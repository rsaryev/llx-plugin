import type { HookOrigin } from '../../protocol/mods-events.ts';
import { asyncSlot } from '../async-slot.ts';
import type { AsyncContextFactory } from '../ports.ts';
import type { ReentryInfo } from '../types.ts';

/** Who a mods API call is made for, and where it runs. */
export interface CallContext {
  /** Whose call it is: the event it fires has this origin. */
  readonly origin: HookOrigin;
  /** The mod whose own hooks the event skips. */
  readonly reentry: ReentryInfo;
  /** The working directory of the hook's event, when it is not the session's: a subagent's. */
  readonly cwd?: string;
  /** Set while a method that another mod added to this mod's `$` runs: the mod that called it. */
  readonly lentTo?: string;
}

/**
 * The context the calls of one mod run in. It is the mod's own until a method another mod lent runs:
 * then the calls that method makes run in the context of the hook that called it (reference.md,
 * "Other mods").
 */
export interface Scope {
  current(): CallContext;
  /** Runs `run` with `context` as the current one until it settles. */
  within<T>(context: CallContext, run: () => Promise<T>): Promise<T>;
}

/**
 * With the host's `asyncContext` the context follows each call across `await`, so a call the mod
 * makes on its own while a lent method waits stays its own; without it the contexts are one stack
 * per mod, and such a call runs in the borrowing context too (judgment, spec/judgments.md).
 */
export function createScope(own: CallContext, asyncContext?: AsyncContextFactory): Scope {
  const slot = asyncSlot<CallContext>(asyncContext);
  if (slot !== undefined) {
    return {
      current: () => slot.current() ?? own,
      within: (context, run) => slot.run(context, run),
    };
  }
  const stack: CallContext[] = [own];
  const current = (): CallContext => stack.at(-1) ?? own;
  return {
    current,
    async within(context, run) {
      stack.push(context);
      try {
        return await run();
      } finally {
        stack.splice(stack.lastIndexOf(context), 1);
      }
    },
  };
}
