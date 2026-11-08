import type { Budget } from '../../foundation/index.ts';
import type { ModsApi } from '../types.ts';
import { nestingProblem } from './nesting.ts';

/** Calls whose time counts as the hook's own: a hook that sleeps is working, not waiting on Claude Code. */
const OWN_TIME = new Set(['clock.sleep']);

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  typeof value === 'object' &&
  value !== null &&
  'then' in value &&
  typeof value.then === 'function';

type Method = (...args: readonly unknown[]) => unknown;
const isMethod = (value: unknown): value is Method => typeof value === 'function';

const isNamespace = (value: unknown): value is object =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function guardedCall(method: Method, owner: object, label: string, budget: Budget): Method {
  const metered = !OWN_TIME.has(label);
  return (...args) => {
    for (const argument of args) {
      const problem = nestingProblem(argument);
      if (problem !== null) return Promise.reject(new Error(`$.${label} argument: ${problem}`));
    }
    if (!metered) return Reflect.apply(method, owner, args);
    budget.pause();
    try {
      const result = Reflect.apply(method, owner, args);
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

function guardedNamespace(target: object, path: readonly string[], budget: Budget): object {
  // The proxy stands over an empty object: a frozen `$` forbids a `get` that returns another value.
  return new Proxy(
    {},
    {
      get(_stand, property) {
        const value: unknown = Reflect.get(target, property);
        if (typeof property === 'symbol') return value;
        const next = [...path, property];
        if (isMethod(value)) return guardedCall(value, target, next.join('.'), budget);
        return isNamespace(value) ? guardedNamespace(value, next, budget) : value;
      },
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
 * levels is not supported`.
 */
export function guardApi(api: ModsApi, budget: Budget): ModsApi {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the proxy forwards every property of `api`, so it has the same shape
  return guardedNamespace(api, [], budget) as ModsApi;
}
