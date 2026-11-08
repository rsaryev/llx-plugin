import type { JsonValue } from '../foundation/plain-data.ts';
import type { GraphFacts, InstalledRecord } from '../marketplace/dependency-graph.ts';
import { planUninstall } from '../marketplace/dependency-prune.ts';
import {
  commandFailed,
  commandSucceeded,
  usageError,
  type CommandOutput,
  type ResultFields,
} from './result.ts';
import { matchingIds, nameOf, qualifiedCommands } from './plugin-ref.ts';
import { chooseScope, type ConfigScope } from './scope.ts';
import { DATA_PRESERVED, uninstallRetention, type Retention } from './uninstall-data.ts';

/**
 * `claude plugin uninstall <plugin>` as two decisions around the host's writes (plugins/
 * cli-reference.md, "plugin uninstall"): `startUninstall` reads the arguments and the installed
 * plugins and says what to remove, or what the command ends with; the host then switches the plugin
 * off in the scope's settings, removes its install record and reads the installed plugins back, and
 * `concludeUninstall` says what the command prints and which saved state (options, secrets, data
 * directory) goes. The retention rules are `uninstallRetention`'s (G8). What the docs leave open is
 * in spec/judgments.md.
 */

export interface UninstallArguments {
  /** `name` or `name@marketplace`. */
  readonly plugin: string;
  readonly scope?: string;
  readonly keepData?: boolean;
  readonly prune?: boolean;
  readonly yes?: boolean;
  readonly json?: boolean;
}

export interface UninstallFacts {
  /** What is installed, at every scope. */
  readonly graph: GraphFacts;
  /** Both stdin and stdout are a terminal. */
  readonly tty: boolean;
}

/** What `--prune` removes with the plugin, and whether the user is asked first. */
export interface PruneStep {
  /** The auto-installed dependencies no remaining plugin needs. */
  readonly orphans: readonly string[];
  /** `skip`: `-y`; `ask`: the host asks `Remove? [y/N]` and reports the answer; `none`: nothing to remove. */
  readonly confirm: 'none' | 'skip' | 'ask';
}

export type UninstallStart =
  | { readonly kind: 'done'; readonly output: CommandOutput }
  | {
      readonly kind: 'remove';
      /** The plugin as the user typed it, for the failure line. */
      readonly argument: string;
      readonly id: string;
      readonly scope: ConfigScope;
      readonly keepData: boolean;
      readonly json: boolean;
      readonly prune: PruneStep;
    };

/** What the host found after switching the plugin off and removing its record. */
export interface AfterRemoval {
  /** The settings file that still switches the plugin on at the scope, when one does. */
  readonly settingsStillOn?: string;
  /** The installed plugins read back; `'unreadable'` when the list could not be read. */
  readonly remaining: readonly InstalledRecord[] | 'unreadable';
  /** The answer to `Remove? [y/N]`, when `prune.confirm` was `ask`. */
  readonly pruneConfirmed?: boolean;
}

/** State the host deletes for one uninstalled plugin: only what the retention rules let go. */
export interface Cleanup {
  readonly id: string;
  /** Its stored options and secrets. */
  readonly deleteSaved: boolean;
  /** The folder under `~/.claude/plugins/data/` to delete; absent when the directory stays. */
  readonly deleteDataFolder?: string;
}

export interface UninstallConclusion {
  readonly output: CommandOutput;
  readonly json: boolean;
  /** Whether the host removes the install record (not when the settings still switch it on). */
  readonly removeRecord: boolean;
  /** The state to delete, one entry per plugin that has any. */
  readonly cleanup: readonly Cleanup[];
  /** The orphaned dependencies the host also uninstalls from the scope. */
  readonly removePruned: readonly string[];
}

const done = (output: CommandOutput): UninstallStart => ({ kind: 'done', output });

const failureLine = (argument: string, reason: string): string =>
  `Failed to uninstall plugin "${argument}": ${reason}`;

const notInstalled = (argument: string, scope: ConfigScope): UninstallStart =>
  done(
    commandFailed(
      'uninstall',
      failureLine(argument, `Plugin "${argument}" is not installed at scope ${scope}`),
      {
        failureCode: 'not_installed',
      },
    ),
  );

const ambiguous = (argument: string, ids: readonly string[]): UninstallStart =>
  done(
    commandFailed(
      'uninstall',
      failureLine(
        argument,
        `"${argument}" is installed from more than one marketplace; run one of: ${qualifiedCommands('uninstall', ids).join(', ')}`,
      ),
      { failureCode: 'ambiguous_plugin' },
    ),
  );

/** `--json` and a missing `-y` are flag problems: nothing is printed but the reason. */
function flagProblem(args: UninstallArguments, tty: boolean): string | undefined {
  if (args.json === true && args.prune === true) return '--json cannot be combined with --prune';
  if (args.prune === true && args.yes !== true && !tty) {
    return '--prune needs -y when stdin or stdout is not a terminal';
  }
  return undefined;
}

function pruneStep(
  args: UninstallArguments,
  graph: GraphFacts,
  id: string,
  scope: ConfigScope,
): PruneStep {
  if (args.prune !== true) return { orphans: [], confirm: 'none' };
  const orphans = planUninstall(id, scope, graph, true).pruned;
  if (orphans.length === 0) return { orphans, confirm: 'none' };
  return { orphans, confirm: args.yes === true ? 'skip' : 'ask' };
}

/** What to remove, or what the command ends with before anything is touched. */
export function startUninstall(args: UninstallArguments, facts: UninstallFacts): UninstallStart {
  const chosen = chooseScope('uninstall', args.scope);
  if ('reason' in chosen) return done(chosen);
  const problem = flagProblem(args, facts.tty);
  if (problem !== undefined) return done(usageError(problem));
  const { scope } = chosen;
  const here = facts.graph.installed
    .filter((record) => record.scope === scope)
    .map((record) => record.id);
  const [id, ...others] = matchingIds(args.plugin, here);
  if (id === undefined) return notInstalled(args.plugin, scope);
  if (others.length > 0) return ambiguous(args.plugin, [id, ...others]);
  return {
    kind: 'remove',
    argument: args.plugin,
    id,
    scope,
    keepData: args.keepData === true,
    json: args.json === true,
    prune: pruneStep(args, facts.graph, id, scope),
  };
}

const resultFields = (start: Extract<UninstallStart, { kind: 'remove' }>): ResultFields => ({
  pluginId: start.id,
  scope: start.scope,
});

function stillOn(
  start: Extract<UninstallStart, { kind: 'remove' }>,
  file: string,
): UninstallConclusion {
  const name = nameOf(start.id);
  const message = failureLine(
    start.argument,
    `"${name}" was not uninstalled: ${file} still switches it on, so it stays installed with everything it saved`,
  );
  return {
    output: commandFailed('uninstall', message, {
      failureCode: 'settings_still_on',
      fields: resultFields(start),
    }),
    json: start.json,
    removeRecord: false,
    cleanup: [],
    removePruned: [],
  };
}

const cleanupOf = (id: string, retention: Retention): readonly Cleanup[] => {
  const deleteSaved = retention.saved === 'delete';
  const folder = retention.data === 'delete' ? retention.dataFolder : undefined;
  if (!deleteSaved && folder === undefined) return [];
  return [{ id, deleteSaved, ...(folder === undefined ? {} : { deleteDataFolder: folder }) }];
};

/** The orphans to remove: those the user confirmed or `-y` allowed. */
const prunedOf = (
  start: Extract<UninstallStart, { kind: 'remove' }>,
  after: AfterRemoval,
): readonly string[] => {
  if (start.prune.confirm === 'ask')
    return after.pruneConfirmed === true ? start.prune.orphans : [];
  return start.prune.orphans;
};

const withoutPruned = (
  remaining: AfterRemoval['remaining'],
  pruned: readonly string[],
  scope: ConfigScope,
): AfterRemoval['remaining'] =>
  Array.isArray(remaining)
    ? remaining.filter((record) => record.scope !== scope || !pruned.includes(record.id))
    : remaining;

const KEPT_NOTE =
  'The options, secrets and data directory stayed because the installed plugins could not be read back and the plugin may still be installed at another scope';

function unreadableNote(retention: Retention): readonly string[] {
  return [
    `${KEPT_NOTE}. To delete them, remove the saved options and secrets in /plugin or the settings, and the folder ~/.claude/plugins/data/${retention.dataFolder}/`,
  ];
}

const successMessage = (name: string, scope: ConfigScope, extra: readonly string[]): string =>
  [`Successfully uninstalled plugin: ${name} (scope: ${scope})`, ...extra].join('\n');

const jsonFields = (
  start: Extract<UninstallStart, { kind: 'remove' }>,
  retention: Retention,
): ResultFields => {
  const fields: Record<string, JsonValue> = {
    ...resultFields(start),
    keptData: retention.data === 'keep',
  };
  if (retention.savedKept !== undefined) fields['savedKept'] = retention.savedKept;
  return fields;
};

/** What the command prints and which state goes, once the host has switched the plugin off and removed its record. */
export function concludeUninstall(
  start: Extract<UninstallStart, { kind: 'remove' }>,
  after: AfterRemoval,
): UninstallConclusion {
  if (after.settingsStillOn !== undefined) return stillOn(start, after.settingsStillOn);
  const pruned = prunedOf(start, after);
  const remaining = withoutPruned(after.remaining, pruned, start.scope);
  const retention = uninstallRetention({
    id: start.id,
    scope: start.scope,
    keepData: start.keepData,
    remaining,
  });
  const extra = [
    ...(retention.savedKept === undefined ? [] : unreadableNote(retention)),
    ...(pruned.length === 0
      ? []
      : [`Removed ${pruned.length} auto-installed plugins: ${pruned.join(', ')}`]),
  ];
  // Judgment: `--keep-data` also keeps the folders of the plugins `--prune` removes (spec/judgments.md).
  const prunedCleanup = pruned.flatMap((id) =>
    cleanupOf(
      id,
      uninstallRetention({ id, scope: start.scope, keepData: start.keepData, remaining }),
    ),
  );
  return {
    output: commandSucceeded('uninstall', successMessage(nameOf(start.id), start.scope, extra), {
      fields: jsonFields(start, retention),
    }),
    json: start.json,
    removeRecord: true,
    cleanup: [...cleanupOf(start.id, retention), ...prunedCleanup],
    removePruned: pruned,
  };
}

/** What `/plugin` shows beside a plugin whose data directory stayed (`keptData`). */
export const dataPreservedMark = (keptData: boolean): string => (keptData ? DATA_PRESERVED : '');
