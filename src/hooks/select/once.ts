import type { HookRegistry, RegisteredHandler } from '../contracts.ts';
import { createHookRegistry } from '../registry.ts';
import { SOURCE_POLICY } from '../source-kind.ts';

/** `once` is set and the source honors it (`SourcePolicy.honorsOnce`). */
const isOnce = (entry: RegisteredHandler): boolean =>
  entry.handler.once === true && SOURCE_POLICY[entry.source.kind].honorsOnce;

/**
 * Whether the session removes this handler after the run: `once` is set, the source honors it, and
 * the run succeeded. "A run that fails, blocks with exit code 2, or times out leaves the hook in
 * place, so it runs again on the next matching event."
 */
export const consumedByRun = (entry: RegisteredHandler, succeeded: boolean): boolean =>
  succeeded && isOnce(entry);

/**
 * The `once` handlers of a session: held while a dispatch runs one, spent after its first
 * successful run (a background one when its process ends). `once` "removes the hook after its first
 * successful run", so a dispatch that starts while another runs the hook leaves it out, and a run
 * that fails, blocks or times out frees it again. Registrations are told apart by identity, not by
 * id: a hook registered again under the same id is a new one (judgment, spec/judgments.md).
 */
export interface OnceClaims {
  /** `selected` without the `once` handlers another run holds or a run spent; it holds the rest. */
  take(selected: readonly RegisteredHandler[]): readonly RegisteredHandler[];
  /** Ends the hold of one run: spent after a success, free to run again otherwise. */
  settle(entry: RegisteredHandler, succeeded: boolean): void;
  spent(entry: RegisteredHandler): boolean;
}

export function createOnceClaims(): OnceClaims {
  const held = new WeakSet<RegisteredHandler>();
  const spent = new WeakSet<RegisteredHandler>();
  return {
    take(selected) {
      const free = selected.filter(
        (entry) => !isOnce(entry) || !(held.has(entry) || spent.has(entry)),
      );
      free.filter(isOnce).forEach((entry) => held.add(entry));
      return free;
    },
    settle(entry, succeeded) {
      held.delete(entry);
      if (consumedByRun(entry, succeeded)) spent.add(entry);
    },
    spent: (entry) => spent.has(entry),
  };
}

/** The registry without the registrations a run spent; the same registry when none is in it. */
export function withoutSpent(registry: HookRegistry, claims: OnceClaims): HookRegistry {
  const kept = registry.entries.filter((entry) => !claims.spent(entry));
  return kept.length === registry.entries.length ? registry : createHookRegistry(kept);
}
