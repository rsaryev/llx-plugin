import type { HookSession, RegisteredHandler } from '../contracts.ts';
import { supportsHandlerType } from './event-catalog.ts';
import { passesGates } from './gates.ts';

/**
 * hooks.md, "FileChanged": the matcher "serves two roles". Its value builds the watch list: "split
 * on `|` and each segment is registered as a literal filename in the working directory", so
 * `".envrc|.env"` watches exactly those two files and a regular expression such as `^\.env` would
 * watch a file literally named that. An omitted matcher "adds nothing to the watch list", while
 * `"*"` is registered like any value, as a file named `*`.
 *
 * Judgments (spec/judgments.md): an empty segment (`".env|"`, or the empty string) names no file;
 * a handler that never runs (gated off by `disableAllHooks`, trust, a disabled plugin or a managed
 * lock, or of a type `FileChanged` does not support) adds nothing, since no run would follow.
 */
export function fileChangedWatchList(
  entries: readonly RegisteredHandler[],
  session: HookSession,
): readonly string[] {
  const names = entries
    .filter((entry) => entry.event === 'FileChanged')
    .filter((entry) => supportsHandlerType('FileChanged', entry.handler.type))
    .filter((entry) => passesGates(entry, session))
    .flatMap((entry) => (entry.matcher ?? '').split('|'))
    .filter((name) => name !== '');
  return [...new Set(names)];
}
