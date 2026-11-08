/**
 * Where the one line about a mod that did not load is read (plugins/mods/troubleshoot.md, "Find out
 * why a mod does nothing"): the transcript of a session that hot-reloads a plugin directory, the
 * debug log of any other interactive session, stderr of a `claude -p` run with `--plugin-dir` in the
 * default text format. "A refusal by another mod goes to the debug log only."
 */

/** The lines the page lists: a refused hooks module, one that did not load, a hook skipped, a refusal by another mod. */
export type ModLineKind = 'not-loaded' | 'did-not-load' | 'hook-skipped' | 'refused-by-mod';
export type ModLineChannel = 'transcript' | 'stderr' | 'debug-log';

export interface ModLineSession {
  readonly isInteractive: boolean;
  /** The session loaded a plugin directory with `--plugin-dir`. */
  readonly pluginDir: boolean;
  /** Hot reloading is on for the mods Claude wrote in this session. */
  readonly hotReload?: boolean;
  /** `claude -p --output-format`; absent is the default, text. */
  readonly outputFormat?: 'text' | 'json' | 'stream-json';
}

/** What differs per kind: whether it may leave the debug log at all. */
const REACHES_PEOPLE: { readonly [K in ModLineKind]: boolean } = {
  'not-loaded': true,
  'did-not-load': true,
  'hook-skipped': true,
  'refused-by-mod': false,
};

/** Where `kind` of line is read in `session`; a session with neither a plugin directory nor hot reloading has the debug log only (judgment for a non-interactive run in another format). */
export function modLineChannel(session: ModLineSession, kind: ModLineKind): ModLineChannel {
  if (!REACHES_PEOPLE[kind]) return 'debug-log';
  if (session.isInteractive) {
    return session.pluginDir || session.hotReload === true ? 'transcript' : 'debug-log';
  }
  const isText = (session.outputFormat ?? 'text') === 'text';
  return session.pluginDir && isText ? 'stderr' : 'debug-log';
}
