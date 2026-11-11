import type { HookHandlerType } from '../../../protocol/hook-config.ts';
import type { RegisteredHandler } from '../../contracts.ts';

/**
 * hooks.md, "Hook handler fields" (the last paragraph under "Matcher patterns"): "When an event
 * fires, its matching hooks run in parallel. If more than 12 of them are prompt or agent hooks, 12
 * of those run at once and the rest start as running ones finish. Each waiting hook's `timeout`
 * starts counting when that hook starts."
 *
 * The timeout of a waiting hook starts when its run starts because the kit computes the limit
 * when it hands the request to the port, which enforces it from then on; a hook that waits for a
 * slot has no request yet.
 */

export const MAX_MODEL_HOOKS_AT_ONCE = 12;

/** The types the limit counts: "prompt or agent hooks". */
const LIMITED: { readonly [T in HookHandlerType]: boolean } = {
  command: false,
  http: false,
  mcp_tool: false,
  prompt: true,
  agent: true,
};

/**
 * Runs `run` for every handler at once, except that at most `limit` prompt or agent handlers are
 * running at any moment; the rest start, in order, as running ones finish. Results come back in
 * the order of `entries`, so what merges them is the same from run to run.
 */
export async function runLimited<T>(
  entries: readonly RegisteredHandler[],
  run: (entry: RegisteredHandler) => Promise<T>,
  limit: number = MAX_MODEL_HOOKS_AT_ONCE,
): Promise<T[]> {
  const results: T[] = [];
  const settle = async (index: number, entry: RegisteredHandler): Promise<void> => {
    results[index] = await run(entry);
  };
  const waiting: number[] = [];
  const free: Promise<void>[] = [];
  entries.forEach((entry, index) => {
    if (LIMITED[entry.handler.type]) waiting.push(index);
    else free.push(settle(index, entry));
  });
  const slot = async (): Promise<void> => {
    for (let index = waiting.shift(); index !== undefined; index = waiting.shift()) {
      const entry = entries[index];
      if (entry !== undefined) await settle(index, entry);
    }
  };
  await Promise.all([...free, ...Array.from({ length: Math.min(limit, waiting.length) }, slot)]);
  return results;
}
