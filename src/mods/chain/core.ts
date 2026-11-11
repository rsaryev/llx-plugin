import type { Context } from './context.ts';
import type { Stream } from './downstream.ts';
import { isHookBody } from './hook-body.ts';
import { counted, settle, type Slot } from './link-trace.ts';
import { coreStep } from './trace.ts';

/**
 * Claude Code's own behaviour, beneath the last hook: its `next.trace` entry is the engine's. An
 * abandoned dispatch never reaches it: whatever path leads here after `next.signal` aborted (a hook
 * that failed and was skipped, a `.catch` that passed the event on, a late `next(e)`), the call
 * rejects with the abort's reason and nothing runs (claude-code/index.d.ts:6999, :10821;
 * spec/judgments.md, `abortedCore`).
 */
export async function* runCore(ctx: Context, e: unknown, slot: Slot): Stream {
  ctx.options.signal.throwIfAborted();
  const started = ctx.clock.now();
  const received = ctx.rule.coreInput?.(ctx.input, e) ?? e;
  const link = { index: ctx.chain.length, plugin: 'engine', tier: 'core' as const, received };
  const done = (outcome: 'returned' | 'rejected', returned: unknown): void => {
    const ms = ctx.clock.now() - started;
    settle(ctx, slot, link, { outcome, wallMs: ms, ownMs: ms, returned });
  };
  try {
    const out = ctx.options.core(received);
    const returned = isHookBody(out) ? yield* counted(out, slot) : await out;
    if (!isHookBody(out)) coreStep(ctx, { started, received, returned });
    done('returned', returned);
    return returned;
  } catch (error) {
    done('rejected', undefined);
    throw error;
  }
}
