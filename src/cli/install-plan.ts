import type { CatalogPlugin, GraphFacts } from '../marketplace/dependency-graph.ts';
import { installClosure, type InstallStep } from '../marketplace/dependency-install-plan.ts';
import type { InstallScope } from '../marketplace/install-scopes.ts';
import type { RegisteredMarketplace } from '../format/marketplace/marketplace-names.ts';
import type { Sha256 } from '../ports/marketplace.ts';
import {
  decideAcceptance,
  type CommandAcceptance,
  type DisplayedCommand,
  type ShownCommand,
} from './command-acceptance.ts';
import type { SavedValues } from './configure-plan.ts';
import {
  applyConfig,
  notAppliedLines,
  notYetSetLine,
  type ConfigOutcome,
  type InstallOptions,
} from './install-config.ts';
import type { PendingInstall } from './install-start.ts';
import { beforeLines, displayedOf, locate, marketplaceRefusal } from './install-lookup.ts';
import {
  commandFailed,
  commandSucceeded,
  type CommandOutput,
  type ResultFields,
} from './result.ts';

/**
 * The second half of `claude plugin install <plugin>` (plugins/cli-reference.md, "plugin install",
 * "Accept a displayed install command"): the decision ladder once the host has added the
 * `--marketplace` source and refreshed. In order: the plugin is looked up (`Plugin "<name>" not found
 * in any configured marketplace` for a bare name nobody lists); one already installed at that scope
 * ends with `Plugin "<id>" is already installed (scope: <scope>)` and exit `0`, still planning any
 * missing dependency ("re-running `claude plugin install` on the dependent"); the `--config` values
 * are checked; the dependency closure is planned; a command-source or `headersHelper` entry prints its
 * command and needs `-y` or the digest (`decideAcceptance`). The refusals the docs do not quote are in
 * spec/judgments.md.
 */

/** What the host found after its `--marketplace` add and refresh. */
export interface InstallFound {
  /** The installed plugins and the marketplace catalogs, after the refresh. */
  readonly graph: GraphFacts;
  /** The catalog text the run read, after its own refresh: it goes into the digest `--accept-command` names. */
  readonly catalog: string;
  /** The plugin's `userConfig` and its bundled servers'. */
  readonly options: InstallOptions;
  /**
   * The marketplace `--marketplace` added or reused. `registered` is the fetch's fact for the
   * download-folder rule: "A new one is added under the same organization policy checks as `claude
   * plugin marketplace add`", so a name that command refuses refuses the install.
   */
  readonly addedMarketplace?: {
    readonly name: string;
    readonly alreadyKnown: boolean;
    readonly registered: readonly RegisteredMarketplace[];
  };
  /** The refresh the plan asked for failed: "the install proceeds from the cached catalog". */
  readonly refreshFailed?: boolean;
  /** The installed copy's directory exists; `false` for a record whose directory is gone ("not cached"), which a reinstall restores. */
  readonly installedCopyPresent?: boolean;
  /** The answer to `Run this command now? [y/N]`, once the host has asked. */
  readonly answer?: boolean;
}

/** What the host carries out for a successful install. */
export interface InstallEffects {
  readonly id: string;
  readonly scope: InstallScope;
  /** Dependencies first; the plugin itself is installed after them unless it is already installed. */
  readonly steps: readonly InstallStep[];
  /** Install the plugin (not for one that was already installed). */
  readonly install: boolean;
  readonly config: SavedValues;
  /** Values for each bundled server, by server name. */
  readonly servers: ConfigOutcome['servers'];
}

export type InstallRun =
  /** The host prints `before`, asks `prompt` and calls `planInstall` again with the answer. */
  | { readonly before: readonly string[]; readonly prompt: string }
  | {
      readonly before: readonly string[];
      readonly output: CommandOutput;
      readonly effects?: InstallEffects;
    };

const ended = (output: CommandOutput, before: readonly string[]): InstallRun => ({
  before,
  output,
});

const fieldsOf = (id: string, scope: InstallScope): ResultFields => ({ pluginId: id, scope });

const shownFields = (shown: ShownCommand, id: string, scope: InstallScope): ResultFields => ({
  ...fieldsOf(id, scope),
  shownCommand: { ...shown },
});

/** A run that printed the command and did not run it. */
function notRun(
  acceptance: Extract<CommandAcceptance, { ask: false }>,
  context: {
    readonly id: string;
    readonly scope: InstallScope;
    readonly before: readonly string[];
    readonly command: string;
  },
): InstallRun {
  return ended(
    commandFailed('install', acceptance.line, {
      failureCode: 'command_not_accepted',
      fields: shownFields(acceptance.shownCommand, context.id, context.scope),
    }),
    [...context.before, context.command],
  );
}

function alreadyInstalled(
  id: string,
  pending: PendingInstall,
  found: InstallFound,
  before: readonly string[],
): InstallRun {
  const closure = installClosure(
    { root: id, scope: pending.scope, operation: 'reinstall' },
    found.graph,
  );
  const message = `Plugin "${id}" is already installed (scope: ${pending.scope})`;
  const output = commandSucceeded('install', message, { fields: fieldsOf(id, pending.scope) });
  if (!closure.ok || closure.steps.length === 0) return ended(output, before);
  return {
    before,
    output,
    effects: {
      id,
      scope: pending.scope,
      steps: closure.steps,
      install: false,
      config: { settings: {}, secrets: {} },
      servers: {},
    },
  };
}

const isInstalledAt = (id: string, scope: InstallScope, graph: GraphFacts): boolean =>
  graph.installed.some((record) => record.id === id && record.scope === scope);

function configRefusal(config: ConfigOutcome): CommandOutput {
  const lines = config.refused.map((problem) => `--config ${problem.key}: ${problem.message}`);
  return commandFailed('install', ['Failed to install plugin:', ...lines].join('\n'), {
    failureCode: 'invalid_config',
    fields: { invalidKeys: config.refused.map((problem) => problem.key) },
  });
}

function closureRefusal(id: string, messages: readonly string[]): CommandOutput {
  return commandFailed('install', [`Failed to install plugin "${id}":`, ...messages].join('\n'), {
    failureCode: 'dependency_error',
  });
}

interface Succeeded {
  readonly id: string;
  readonly scope: InstallScope;
  readonly config: ConfigOutcome;
  readonly options: InstallOptions;
  readonly leftOut: readonly string[];
}

/** The success lines: the install, what `--config` did not apply, the options still unset, dependencies left to the user. */
function successLines(done: Succeeded): string {
  const unset = notYetSetLine(done.id, done.config);
  return [
    `Successfully installed plugin: ${done.id} (scope: ${done.scope})`,
    ...notAppliedLines(done.config, done.options),
    ...(unset === undefined ? [] : [unset]),
    ...done.leftOut,
  ].join('\n');
}

const acceptanceOf = (
  shown: DisplayedCommand,
  pending: PendingInstall,
  found: InstallFound,
  sha256: Sha256,
): Promise<CommandAcceptance> =>
  decideAcceptance(
    {
      shown,
      catalog: found.catalog,
      flags: {
        ...(pending.yes ? { yes: true } : {}),
        ...(pending.acceptCommand === undefined ? {} : { acceptCommand: pending.acceptCommand }),
      },
      session: pending.session,
      tty: pending.tty,
      ...(found.answer === undefined ? {} : { answer: found.answer }),
    },
    sha256,
  );

interface Shown {
  readonly id: string;
  readonly entry: CatalogPlugin;
  readonly before: readonly string[];
}

/** The run that ends the install at its command: the question, or the refusal. `undefined` when the command runs or the entry has none. */
async function stopAtCommand(
  at: Shown,
  pending: PendingInstall,
  found: InstallFound,
  sha256: Sha256,
): Promise<InstallRun | undefined> {
  const shown = displayedOf(at.id, at.entry);
  if (shown === undefined) return undefined;
  const acceptance = await acceptanceOf(shown, pending, found, sha256);
  if (acceptance.run) return undefined;
  if (acceptance.ask) return { before: [...at.before, shown.command], prompt: acceptance.prompt };
  return notRun(acceptance, {
    id: at.id,
    scope: pending.scope,
    before: at.before,
    command: shown.command,
  });
}

/** What `claude plugin install` prints and does, once the host added the marketplace and refreshed. */
export async function planInstall(
  pending: PendingInstall,
  found: InstallFound,
  sha256: Sha256,
): Promise<InstallRun> {
  const before = beforeLines(found);
  const refused = marketplaceRefusal(pending, found);
  if (refused !== undefined) return ended(refused, []);
  const located = locate(pending, found);
  if ('end' in located) return ended(located.end, before);
  const { id, entry } = located;
  const { scope } = pending;
  if (isInstalledAt(id, scope, found.graph) && found.installedCopyPresent !== false) {
    return alreadyInstalled(id, pending, found, before);
  }
  const config = applyConfig(pending.given, found.options);
  if (config.refused.length > 0) return ended(configRefusal(config), before);
  const closure = installClosure({ root: id, scope, operation: 'install' }, found.graph);
  if (!closure.ok) {
    return ended(
      closureRefusal(
        id,
        closure.issues.map((issue) => issue.message),
      ),
      before,
    );
  }
  const stopped = await stopAtCommand({ id, entry, before }, pending, found, sha256);
  if (stopped !== undefined) return stopped;
  const leftOut = closure.leftOut.map((one) => one.message);
  return {
    before,
    output: commandSucceeded(
      'install',
      successLines({ id, scope, config, options: found.options, leftOut }),
      {
        fields: fieldsOf(id, scope),
      },
    ),
    effects: {
      id,
      scope,
      steps: closure.steps,
      install: true,
      config: config.plugin,
      servers: config.servers,
    },
  };
}
