import type { Budget } from '../../foundation/index.ts';
import type { ModsApi } from '../types.ts';
import { nestingProblem } from './nesting.ts';
import { isRecord } from '../../protocol/is-record.ts';
import { AT_ONCE_CALLS, OWN_TIME_CALLS } from '../../protocol/mods-api-names.ts';

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  typeof value === 'object' &&
  value !== null &&
  'then' in value &&
  typeof value.then === 'function';

type Method = (...args: readonly unknown[]) => unknown;
const isMethod = (value: unknown): value is Method => typeof value === 'function';

/** Runs a call where it is attributed to the hook (`AsyncSlot.run` of the calling hook's frame). */
type Within = <R>(call: () => R) => R;
const direct: Within = (call) => call();

interface Guard {
  readonly budget: Budget;
  readonly within: Within;
}

function guardedCall(method: Method, owner: object, label: string, guard: Guard): Method {
  const { budget, within } = guard;
  const metered = !OWN_TIME_CALLS.has(label);
  const atOnce = AT_ONCE_CALLS.has(label);
  return (...args) => {
    for (const argument of args) {
      const problem = nestingProblem(argument);
      if (problem === null) continue;
      const error = new Error(`$.${label} argument: ${problem}`);
      // A call that answers at once throws where it is called; any other rejects.
      if (atOnce) throw error;
      return Promise.reject(error);
    }
    const apply = (): unknown => within(() => Reflect.apply(method, owner, args));
    if (!metered) return apply();
    budget.pause();
    try {
      const result = apply();
      if (!isThenable(result)) {
        budget.resume(); // a synchronous result is back: the hook has the floor again
        return result;
      }
      return Promise.resolve(result).finally(() => budget.resume()); // a promise resumes when it settles
    } catch (error) {
      budget.resume();
      throw error;
    }
  };
}

/** What a namespace property reads as through the guard: a method guarded, a namespace guarded in turn. */
function guardedValue(target: object, path: readonly string[], guard: Guard, value: unknown) {
  if (isMethod(value)) return guardedCall(value, target, path.join('.'), guard);
  return isRecord(value) ? guardedNamespace(value, path, guard) : value;
}

function guardedNamespace(target: object, path: readonly string[], guard: Guard): object {
  // Each property is wrapped once, so `$.fs.read === $.fs.read` within a hook; a changed value is wrapped again.
  const wrapped = new Map<string, { readonly source: unknown; readonly guarded: unknown }>();
  const read = (property: string): unknown => {
    const value: unknown = Reflect.get(target, property);
    const known = wrapped.get(property);
    if (known !== undefined && known.source === value) return known.guarded;
    const guarded = guardedValue(target, [...path, property], guard, value);
    wrapped.set(property, { source: value, guarded });
    return guarded;
  };
  // The proxy stands over an empty object: a frozen `$` forbids a `get` that returns another value.
  return new Proxy(
    {},
    {
      get: (_stand, property) =>
        typeof property === 'symbol' ? Reflect.get(target, property) : read(property),
      has: (_stand, property) => Reflect.has(target, property),
      ownKeys: () => Reflect.ownKeys(target),
      getOwnPropertyDescriptor: (_stand, property) =>
        Reflect.has(target, property)
          ? {
              configurable: true,
              enumerable: true,
              writable: false,
              value: Reflect.get(target, property),
            }
          : undefined,
    },
  );
}

/**
 * The `$` a hook receives: its mod's mods API with two guards. Every call pauses the hook's time
 * budget until it returns, except `$.clock.sleep` (reference.md, "Limits"); and a call whose
 * argument nests deeper than the limit rejects with a message ending `nesting deeper than 28000
 * levels is not supported`. `within` runs each call as the hook's (the chain's `AsyncSlot`).
 */
export function guardApi(api: ModsApi, budget: Budget, within: Within = direct): ModsApi {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the proxy forwards every property of `api`, so it has the same shape
  return guardedNamespace(api, [], { budget, within }) as ModsApi;
}
