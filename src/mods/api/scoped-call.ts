import type { Scope } from './scope.ts';

const STARTS_TURN: ReadonlySet<string> = new Set(['prompt.submit']);

/**
 * Admission for a host-backed mods API method. An engine.create namespace is lent the borrowing
 * hook's scope; reference.md, "Other mods" says prompt.submit rejects while its turn waits on it.
 * The refusal wording is a judgment (spec/judgments.md). `createModsApi` uses this same gate.
 * Other methods retain their synchronous/asynchronous return shape and run in the current scope.
 */
export function runScopedModCall<T>(scope: Scope, method: string, run: () => T): T {
  const lent = scope.current().lentTo;
  if (lent !== undefined && STARTS_TURN.has(method)) {
    throw new Error(`$.${method}: the turn is waiting on a hook of ${lent}`);
  }
  return run();
}
