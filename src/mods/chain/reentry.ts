import type { RegisteredHook, ReentryInfo } from '../types.ts';
import type { Frames, HookFrame } from './frames.ts';

/** Who made the call an event came from, as the dispatch knows it. */
export interface CallingHook {
  /** The hooks of each mod running now: the answer when the host gave no `AsyncContext`. */
  readonly frames: Frames;
  /** Whether the chain follows the calling hook (the host gave an `AsyncContext`). */
  readonly followed: boolean;
  /** The hook the call came from; none when it came from a mod's code outside its hooks. */
  readonly frame?: HookFrame | undefined;
}

/**
 * Whether a call by `plugin` skips its `hook`: the calling hook alone, when the chain follows it; a
 * call from the mod's code outside its hooks skips them all (reference.md, `next.error`).
 */
const skipsHook = (calling: CallingHook, plugin: string, hook: RegisteredHook): boolean =>
  calling.followed
    ? calling.frame?.plugin !== plugin || calling.frame.hook === hook
    : calling.frames.skips(plugin, hook);

/**
 * Whether a hook is skipped because the event came from inside a mods API call by that hook, or by
 * its mod's code outside its hooks; a call by another of the mod's hooks reaches it. Such a skip is
 * no failure: no `.catch` handler hears of it and nothing is reported (declarations 2.1.321,
 * `HookFailure` and `CatchHandler`; oracle 2.1.322, spec/judgments.md).
 */
export function reentrySkips(
  link: { readonly plugin: string; readonly hook: RegisteredHook; readonly calling: CallingHook },
  reentry: ReentryInfo | undefined,
): boolean {
  const { plugin, hook, calling } = link;
  return reentry?.plugin === plugin && skipsHook(calling, plugin, hook);
}
