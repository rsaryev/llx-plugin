/**
 * Where the one line about a mod that did not load is read (plugins/mods/troubleshoot.md, "Find out
 * why a mod does nothing"): the transcript of a session that hot-reloads a plugin directory, the
 * debug log of any other interactive session, stderr of a `claude -p` run with `--plugin-dir` in the
 * default text format. A refusal by another mod goes to the debug log of a `claude -p` run, and to
 * the transcript, as the guard table says, "in a session that hot-reloads a plugin directory".
 */

/**
 * The lines the page lists: a refused hooks module, one that did not load, a hook skipped, a refusal
 * by another mod, a stop of the hooks worker, a call a fresh copy did not make again.
 */
export type ModLineKind =
  | 'not-loaded'
  | 'did-not-load'
  | 'hook-skipped'
  | 'refused-by-mod'
  | 'worker-crash'
  | 'fresh-copy';
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

const isText = (session: ModLineSession): boolean => (session.outputFormat ?? 'text') === 'text';

/** An interactive session shows the line in the transcript when it loaded a plugin directory or hot-reloads, else only the debug log has it. */
const interactiveChannel = (session: ModLineSession): ModLineChannel =>
  session.pluginDir || session.hotReload === true ? 'transcript' : 'debug-log';

/** A refusal by another mod never reaches stderr: in `claude -p` the debug log has it, whatever the flags. */
const refusalChannel = (session: ModLineSession): ModLineChannel =>
  session.isInteractive ? interactiveChannel(session) : 'debug-log';

const hooksModuleChannel = (session: ModLineSession): ModLineChannel => {
  if (session.isInteractive) return interactiveChannel(session);
  return session.pluginDir && isText(session) ? 'stderr' : 'debug-log';
};

/**
 * "This line reaches the transcript in every interactive session" (troubleshoot.md, "`mods that run in
 * the hooks worker are off for this session`"); the line of one mod unloaded has the same place
 * (judgment), and a `claude -p` run reads it where it reads a module that did not load.
 */
const workerCrashChannel = (session: ModLineSession): ModLineChannel =>
  session.isInteractive ? 'transcript' : hooksModuleChannel(session);

/** What differs per kind: where the line goes in a session. */
const CHANNELS: { readonly [K in ModLineKind]: (session: ModLineSession) => ModLineChannel } = {
  'not-loaded': hooksModuleChannel,
  'did-not-load': hooksModuleChannel,
  'hook-skipped': hooksModuleChannel,
  'refused-by-mod': refusalChannel,
  'worker-crash': workerCrashChannel,
  // Judgment: the page names no place for it; it is one line per mod, like a skipped hook.
  'fresh-copy': hooksModuleChannel,
};

/** Where `kind` of line is read in `session`; a session with neither a plugin directory nor hot reloading has the debug log only (judgment for a non-interactive run in another format). */
export function modLineChannel(session: ModLineSession, kind: ModLineKind): ModLineChannel {
  return CHANNELS[kind](session);
}
