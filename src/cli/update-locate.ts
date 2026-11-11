import type { Environment } from '../ports/environment.ts';
import { commandSourceRuns } from '../updates/command-source-rerun.ts';
import type { DisplayedCommand } from './command-acceptance.ts';
import { matchingIds, qualifiedCommands } from './plugin-ref.ts';
import { commandFailed, type CommandOutput } from './result.ts';
import { detectScope, type CommandScope } from './scope.ts';
import type { UpdatableInstall, PluginUpdateArguments, PluginUpdateFacts } from './update-facts.ts';

/**
 * Which install `claude plugin update` updates and which command it needs accepted (plugins/
 * cli-reference.md, "plugin update", "Which scope the command updates", "Update by bare name").
 */

export const failureLine = (argument: string, reason: string): string =>
  `Failed to update plugin "${argument}": ${reason}`;

export type Located = { readonly install: UpdatableInstall } | { readonly end: CommandOutput };

/** The install to update: the plugin the argument names at the scope given or detected. */
export function locate(
  args: PluginUpdateArguments,
  facts: PluginUpdateFacts,
  chosen: CommandScope | undefined,
): Located {
  const here =
    chosen === undefined ? facts.installs : facts.installs.filter((one) => one.scope === chosen);
  const [id, ...others] = matchingIds(
    args.plugin,
    here.map((one) => one.id),
  );
  if (id === undefined) {
    const where = chosen === undefined ? '' : ` at scope ${chosen}`;
    return {
      end: commandFailed(
        'update',
        failureLine(args.plugin, `Plugin "${args.plugin}" is not installed${where}`),
        { failureCode: 'not_installed' },
      ),
    };
  }
  if (others.length > 0) {
    const commands = qualifiedCommands('update', [id, ...others]).join(', ');
    return {
      end: commandFailed(
        'update',
        failureLine(
          args.plugin,
          `"${args.plugin}" is installed from more than one marketplace; run one of: ${commands}`,
        ),
        { failureCode: 'ambiguous_plugin' },
      ),
    };
  }
  const scopes = here.filter((one) => one.id === id).map((one) => one.scope);
  const scope = chosen ?? detectScope('update', scopes);
  const install = here.find((one) => one.id === id && one.scope === scope);
  return install === undefined
    ? {
        end: commandFailed(
          'update',
          failureLine(args.plugin, `Plugin "${args.plugin}" is not installed`),
          { failureCode: 'not_installed' },
        ),
      }
    : { install };
}

/** What the entry asks Claude Code to run on this update, when the user has to accept it. */
export function commandToAccept(
  install: UpdatableInstall,
  env: Environment,
): DisplayedCommand | undefined {
  if (install.headersHelper !== undefined) {
    return { command: install.headersHelper, plugin: install.id, origin: 'headers-helper' };
  }
  if (install.command === undefined) return undefined;
  const plan = commandSourceRuns(
    'update',
    {
      id: install.id,
      enabled: true,
      installedVersionInCache: true,
      declared: install.command.declared,
      ...(install.command.accepted === undefined ? {} : { accepted: install.command.accepted }),
    },
    env,
  );
  return plan.acceptance?.ask === true
    ? { command: install.command.declared.command, plugin: install.id, origin: 'command-source' }
    : undefined;
}
