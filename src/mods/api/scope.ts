import type { HookOrigin } from '../../protocol/mods-events.ts';
import type { ReentryInfo } from '../types.ts';

/** Who a mods API call is made for, and where it runs. */
export interface CallContext {
  /** Whose call it is: the event it fires has this origin. */
  readonly origin: HookOrigin;
  /** The mod whose own hooks the event skips, and why (`rewritten`, `lent`). */
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

export function createScope(own: CallContext): Scope {
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
