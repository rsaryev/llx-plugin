import { error, type PluginIssue } from '../format/issues.ts';
import type { Environment } from '../ports/environment.ts';
import { isUpdate } from '../marketplace/update-detection.ts';
import { DISABLE_NONESSENTIAL_TRAFFIC, isSet } from './env-flags.ts';

/**
 * When the command of a `command` source runs again, and what follows a run (plugins/loading.md,
 * "When a command source re-runs"; plugins/host-marketplace.md, "Change the command of a command
 * source"). Pure: the host runs the command (`runCommandSource`); the kit says which runs happen,
 * which are skipped and why, what the user is asked, and what an Errors-tab entry says.
 */

/** What starts a decision: an explicit install or update, the start of a session, `/reload-plugins`. */
export const RERUN_EVENTS = ['install', 'update', 'session-start', 'reload-plugins'] as const;
export type RerunEvent = (typeof RERUN_EVENTS)[number];

/** The runs the docs list: "Every time you install or update", "Once per session", "installed version is missing". */
export const RUN_KINDS = ['install', 'update', 'once-per-session', 'missing-version'] as const;
export type RunKind = (typeof RUN_KINDS)[number];

/** The command and `mode` a user accepted, or that the catalog declares now. */
export interface CommandDeclaration {
  readonly command: string;
  readonly mode: 'copy' | 'link';
}

export interface CommandPlugin {
  /** `name@marketplace`. */
  readonly id: string;
  readonly enabled: boolean;
  /** The installed version's directory exists in the plugin cache. */
  readonly installedVersionInCache: boolean;
  /** What the marketplace entry declares now. */
  readonly declared: CommandDeclaration;
  /** What the user accepted when they installed or last updated; none for a plugin never installed. */
  readonly accepted?: CommandDeclaration;
}

export type RunSkip = 'command-not-accepted' | 'nonessential-traffic-disabled';

/** "Claude Code shows them the new command and asks them to accept it." */
export type Acceptance = { readonly ask: false } | { readonly ask: true; readonly showing: string };

/** "An entry in the `/plugin` Errors tab: the entry shows the new command and the `claude plugin update` command to run." */
export interface ErrorsTabEntry {
  readonly plugin: string;
  readonly command: string;
  readonly mode: CommandDeclaration['mode'];
  readonly updateCommand: string;
  readonly issue: PluginIssue;
}

export interface RerunPlan {
  readonly runs: readonly RunKind[];
  readonly skipped: readonly { readonly run: RunKind; readonly reason: RunSkip }[];
  /** Set for an install or update: whether the user must accept the command first. */
  readonly acceptance?: Acceptance;
  readonly errorsTab?: ErrorsTabEntry;
}

/** Whether a run is one of "the two background runs" the traffic variable skips. */
const BACKGROUND: { readonly [R in RunKind]: boolean } = {
  install: false,
  update: false,
  'once-per-session': true,
  'missing-version': true,
};

/** Which runs an event brings about; the background ones only "for each enabled" plugin. */
const DUE: { readonly [E in RerunEvent]: (plugin: CommandPlugin) => readonly RunKind[] } = {
  install: () => ['install'],
  update: () => ['update'],
  'session-start': (plugin) => {
    if (!plugin.enabled) return [];
    return plugin.installedVersionInCache
      ? ['once-per-session']
      : ['once-per-session', 'missing-version'];
  },
  'reload-plugins': (plugin) =>
    plugin.enabled && !plugin.installedVersionInCache ? ['missing-version'] : [],
};

/** The events that look at the catalog the way a session does, and so show the Errors-tab entry. */
const SHOWS_ERRORS_TAB: { readonly [E in RerunEvent]: boolean } = {
  install: false,
  update: false,
  'session-start': true,
  'reload-plugins': true,
};

const isChanged = (plugin: CommandPlugin): boolean =>
  plugin.accepted === undefined ||
  plugin.accepted.command !== plugin.declared.command ||
  plugin.accepted.mode !== plugin.declared.mode;

/**
 * An install always shows its command and asks; an update asks only when the command or mode it
 * would run is not the accepted one ("Claude Code runs only the exact command a user accepted").
 */
const ACCEPTANCE: {
  readonly [E in RerunEvent]: ((plugin: CommandPlugin) => Acceptance) | undefined;
} = {
  install: (plugin) => ({ ask: true, showing: plugin.declared.command }),
  update: (plugin) =>
    isChanged(plugin) ? { ask: true, showing: plugin.declared.command } : { ask: false },
  'session-start': undefined,
  'reload-plugins': undefined,
};

function entryFor(plugin: CommandPlugin): ErrorsTabEntry {
  const { command, mode } = plugin.declared;
  const updateCommand = `claude plugin update ${plugin.id}`;
  return {
    plugin: plugin.id,
    command,
    mode,
    updateCommand,
    // Judgment (spec/judgments.md): the docs say what the entry shows, not how it is worded.
    issue: error(
      `plugins.${plugin.id}`,
      `The install command of ${plugin.id} changed to \`${command}\` (mode: ${mode}) and needs your acceptance: run \`${updateCommand}\` in a terminal`,
    ),
  };
}

type Verdict = { readonly run: RunKind } | { readonly run: RunKind; readonly skip: RunSkip };

/** A background run is stopped by an unaccepted command first, then by the traffic variable. */
function verdict(run: RunKind, plugin: CommandPlugin, env: Environment): Verdict {
  if (!BACKGROUND[run]) return { run };
  if (isChanged(plugin)) return { run, skip: 'command-not-accepted' };
  return isSet(env, DISABLE_NONESSENTIAL_TRAFFIC)
    ? { run, skip: 'nonessential-traffic-disabled' }
    : { run };
}

/**
 * The runs `event` brings about for one command-sourced plugin. `DISABLE_AUTOUPDATER` and the
 * marketplace's `autoUpdate` have no part in it: only the traffic variable and an unaccepted
 * command stop the background runs, and never an install or update.
 */
export function commandSourceRuns(
  event: RerunEvent,
  plugin: CommandPlugin,
  env: Environment,
): RerunPlan {
  const verdicts = DUE[event](plugin).map((run) => verdict(run, plugin, env));
  const acceptance = ACCEPTANCE[event]?.(plugin);
  const showsEntry = SHOWS_ERRORS_TAB[event] && plugin.enabled && isChanged(plugin);
  return {
    runs: verdicts.flatMap((each) => ('skip' in each ? [] : [each.run])),
    skipped: verdicts.flatMap((each) =>
      'skip' in each ? [{ run: each.run, reason: each.skip }] : [],
    ),
    ...(acceptance === undefined ? {} : { acceptance }),
    ...(showsEntry ? { errorsTab: entryFor(plugin) } : {}),
  };
}

/** What a finished run leaves to do with the version it produced. */
export interface RunResult {
  /** The version `installed_plugins.json` records; none for a plugin never installed. */
  readonly installedVersion: string | undefined;
  /** The version the hash of the command's output gives (`computePluginVersion`). */
  readonly computedVersion: string;
  /** A running interactive session exists to reload into. */
  readonly interactive: boolean;
  /** Reloading in place "would invalidate the session's prompt cache". */
  readonly reloadInvalidatesPromptCache: boolean;
}

export type AfterRun =
  | { readonly install: false; readonly followUp: 'nothing' }
  | { readonly install: true; readonly followUp: 'reload' | 'ask-reload-plugins' | 'next-launch' };

/** The follow-up of an installed new version, by the state of the session. */
const FOLLOW_UP: {
  readonly [K in 'interactive-cache-safe' | 'interactive-cache-cost' | 'not-interactive']: Extract<
    AfterRun,
    { install: true }
  >['followUp'];
} = {
  'interactive-cache-safe': 'reload',
  'interactive-cache-cost': 'ask-reload-plugins',
  'not-interactive': 'next-launch',
};

const sessionState = (result: RunResult): keyof typeof FOLLOW_UP => {
  if (!result.interactive) return 'not-interactive';
  return result.reloadInvalidatesPromptCache ? 'interactive-cache-cost' : 'interactive-cache-safe';
};

/**
 * "When the command's hashed output has changed, Claude Code installs the result as a new version
 * and reloads it in the running interactive session"; if that "would invalidate the session's
 * prompt cache" it prompts for `/reload-plugins` instead. A session with nothing to reload into
 * loads the new version at its next launch (judgment, spec/judgments.md).
 */
export function afterCommandRun(result: RunResult): AfterRun {
  if (isUpdate(result.installedVersion, result.computedVersion) === 'unchanged') {
    return { install: false, followUp: 'nothing' };
  }
  return { install: true, followUp: FOLLOW_UP[sessionState(result)] };
}
