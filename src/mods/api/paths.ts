import type { Deps } from './call.ts';

/** A path that starts at a root: `/dir`, `\dir` or `C:\dir`. */
const ABSOLUTE = /^(?:[A-Za-z]:[\\/]|[\\/])/;

/**
 * The absolute path a mods API call means (api.md, "Reach files, processes, and the network"): a
 * relative path resolves against the working directory of the session, or of the subagent whose
 * event the hook is handling. Judgment: `~` is not expanded, the docs do not say it is.
 */
export async function absolutePath(deps: Deps, path: string): Promise<string> {
  if (ABSOLUTE.test(path)) return path;
  return deps.ports.locations.joinPath(await workingDirectory(deps), path);
}

/** The working directory of the session, or of the subagent whose event the hook handles: where a relative path and a command start. */
export async function workingDirectory(deps: Deps): Promise<string> {
  return deps.scope.current().cwd ?? deps.eventCwd?.() ?? (await deps.ports.session.cwd());
}
