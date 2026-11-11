import type { ModsApi, ModCatchNext, ModNext, RegisteredHook, SkipTier } from '../types.ts';
import type { GuestHook, HookCall } from '../ports.ts';
import type { ApiEventName } from '../../protocol/mods-events.ts';
import { SKIP_TIERS } from '../chain/tiers.ts';

/**
 * The hooks a module registered, as the host's runtime hands them back (`GuestHook`), as hooks the
 * chain runs. The runtime marshals `HookCall` into the guest: `api` serves every `$.ns.method` (so
 * each is an event the chain sees), `next` and `nextTo` serve `next` and `next.to`.
 */

/** Whether the guest wrote an async generator, which is what a hook on a streaming event is. */
const GENERATORS: { readonly [K in GuestHook['kind']]: boolean } = {
  function: false,
  generator: true,
};

const isSkipTier = (tier: string): tier is SkipTier => SKIP_TIERS.some((one) => one === tier);

type Any = Promise<unknown> | AsyncGenerator<unknown, unknown>;

/** `$.fs.read` for `fs.read`: the method of the namespace, called with the guest's arguments. */
function callApi(api: ModsApi, path: ApiEventName, args: readonly unknown[]): Promise<unknown> {
  const [namespace = '', method = ''] = path.split('.');
  const target: unknown = Reflect.get(api, namespace);
  const member: unknown =
    typeof target === 'object' && target !== null ? Reflect.get(target, method) : undefined;
  if (typeof member !== 'function') {
    return Promise.reject(new Error(`$.${path} is not part of the mods API`));
  }
  // The method may be synchronous (`$.ui.resolve`) or return a timer; the guest awaits the answer.
  return Promise.resolve(Reflect.apply(member, target, args));
}

function hookCall(api: ModsApi, e: unknown, next: ModNext<unknown, Any>): HookCall {
  return {
    event: e,
    api: (path, args) => callApi(api, path, args),
    next: (changed) => next(changed),
    nextTo: (changed, tier) =>
      isSkipTier(tier)
        ? Promise.resolve(next.to(changed, tier))
        : Promise.reject(new Error(`next.to: "${tier}" is not a tier a hook can skip to`)),
    signal: next.signal,
    origin: next.origin,
    budget: () => ({ ms: next.budget.ms, remainingMs: next.budget.remainingMs }),
    name: next.event,
    trace: () => next.trace,
    direct: { $: api, next },
  };
}

/** `guest` as a hook of the chain; a hook with a `.catch` handler carries it as `catchRun`. */
export function registeredFrom(guest: GuestHook): RegisteredHook {
  return {
    event: guest.event,
    ...(guest.matcher === undefined ? {} : { matcher: guest.matcher }),
    isGenerator: GENERATORS[guest.kind],
    run: (api: ModsApi, e: unknown, next: ModNext<unknown, Any>) =>
      guest.run(hookCall(api, e, next)),
    ...(guest.hasCatch && guest.runCatch
      ? {
          catchRun: (api: ModsApi, e: unknown, next: ModCatchNext<unknown, Any>) =>
            guest.runCatch?.({
              ...hookCall(api, e, next),
              error: next.error,
              called: () => next.called,
            }),
        }
      : {}),
  };
}
