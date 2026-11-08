import type { PluginSourceKind, PluginSourceOf } from '../format/marketplace/types.ts';
import type { CatalogPlugin } from '../marketplace/dependency-graph.ts';
import { NOT_REFRESHED } from '../updates/refresh-before-install.ts';
import type { DisplayedCommand } from './command-acceptance.ts';
import type { InstallFound } from './install-plan.ts';
import type { PendingInstall } from './install-start.ts';
import { matchingIds, qualifiedCommands } from './plugin-ref.ts';
import { commandFailed, type CommandOutput } from './result.ts';

/**
 * Looking the plugin up for `claude plugin install` (plugins/cli-reference.md, "plugin install";
 * plugins/install.md, "Add and install from your shell"; plugins/troubleshooting.md, `Plugin "<name>"
 * not found in any configured marketplace`): which catalog entry the argument names, what prints
 * ahead of the result and which command the entry asks Claude Code to run.
 */

/** The marketplace the plugin is installed from is named after the `@`. */
const idsFor = (found: InstallFound): readonly string[] => {
  const all = Object.keys(found.graph.catalog);
  const added = found.addedMarketplace?.name;
  return added === undefined
    ? all
    : all.filter((id) => found.graph.catalog[id]?.marketplace === added);
};

export type Located =
  | { readonly id: string; readonly entry: CatalogPlugin }
  | { readonly end: CommandOutput };

export function locate(pending: PendingInstall, found: InstallFound): Located {
  const [id, ...others] = matchingIds(pending.plugin, idsFor(found));
  const entry = id === undefined ? undefined : found.graph.catalog[id];
  if (id === undefined || entry === undefined) {
    return {
      end: commandFailed(
        'install',
        `Plugin "${pending.plugin}" not found in any configured marketplace`,
        {
          failureCode: 'not_found',
        },
      ),
    };
  }
  if (others.length === 0) return { id, entry };
  return {
    end: commandFailed(
      'install',
      `"${pending.plugin}" is offered by more than one marketplace; run one of: ${qualifiedCommands('install', [id, ...others]).join(', ')}`,
      { failureCode: 'ambiguous_plugin' },
    ),
  };
}

/** What prints ahead of the result: the marketplace that was added, a refresh that failed. */
export function beforeLines(found: InstallFound): readonly string[] {
  const added = found.addedMarketplace;
  const addLine =
    added === undefined || added.alreadyKnown
      ? []
      : [`Successfully added marketplace: ${added.name} (declared in user settings)`];
  return [...addLine, ...(found.refreshFailed === true ? [NOT_REFRESHED] : [])];
}

type CommandOf<K extends PluginSourceKind> = (source: PluginSourceOf<K>) => string | undefined;

const NO_COMMAND = (): undefined => undefined;

/** Per source kind, the command it asks Claude Code to run: only a `command` source has one. */
const SOURCE_COMMANDS: { readonly [K in PluginSourceKind]: CommandOf<K> } = {
  relative: NO_COMMAND,
  github: NO_COMMAND,
  url: NO_COMMAND,
  'git-subdir': NO_COMMAND,
  npm: NO_COMMAND,
  archive: NO_COMMAND,
  command: (source) => source.command,
};

function sourceCommand<K extends PluginSourceKind>(
  kind: K,
  source: PluginSourceOf<K>,
): string | undefined {
  return SOURCE_COMMANDS[kind](source);
}

/** The command the entry asks Claude Code to run: a `headersHelper` first, then a `command` source. */
export function displayedOf(id: string, entry: CatalogPlugin): DisplayedCommand | undefined {
  if (entry.headersHelper !== undefined) {
    return { command: entry.headersHelper, plugin: id, origin: 'headers-helper' };
  }
  const command = sourceCommand(entry.source.kind, entry.source);
  return command === undefined ? undefined : { command, plugin: id, origin: 'command-source' };
}
