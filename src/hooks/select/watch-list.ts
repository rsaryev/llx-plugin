import { dedupeSettingsHandlers } from './dedupe.ts';
import type { HookEvent } from '../../protocol/official.ts';
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

/**
 * hooks.md, "CwdChanged" and "FileChanged" output: `watchPaths` "Replaces the current dynamic watch
 * list ... Returning an empty array clears the dynamic list" (`SessionStart` seeds it the same way).
 * The dynamic list after one more output: the output's paths, each once, when the output returned
 * the field (`[]` empties it), else the list as it was. Judgment (spec/judgments.md): an output that
 * names no `watchPaths` leaves the list alone, since only a returned field replaces it.
 */
export function mergeWatchPaths(
  current: readonly string[],
  effect: readonly string[] | undefined,
): readonly string[] {
  return effect === undefined ? current : [...new Set(effect)];
}

/**
 * Whether some registered handler of the event could run in this session: it passes the gates
 * (`disableAllHooks`, trust, plugin enablement, the managed locks) and its type is one the event
 * supports. Judgment (spec/judgments.md): the matcher and `if` are not read, since they need the
 * occurrence the question is asked before; a handler gated off or of an unsupported type never
 * counts, as no run would follow.
 */
export function hasRunnableHandler(
  entries: readonly RegisteredHandler[],
  session: HookSession,
  event: HookEvent,
): boolean {
  return entries.some(
    (entry) =>
      entry.event === event &&
      supportsHandlerType(event, entry.handler.type) &&
      passesGates(entry, session),
  );
}

/**
 * The handlers of `entries` that would run in the session, in order: they pass the gates and have a
 * type their event supports (matchers and `if` are not read), and a handler written in several
 * settings files is listed once (hooks.md, "Hook handler fields"). What a host lists in a `/hooks` view.
 */
export function runnableHandlers(
  entries: readonly RegisteredHandler[],
  session: HookSession,
): readonly RegisteredHandler[] {
  return dedupeSettingsHandlers(
    entries.filter(
      (entry) =>
        supportsHandlerType(entry.event, entry.handler.type) && passesGates(entry, session),
    ),
  );
}
