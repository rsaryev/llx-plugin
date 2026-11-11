import type { PluginIssue } from '../../../format/issues.ts';
import {
  locationsWithoutPlugin,
  resolveHookCommand,
  type ResolvedUserConfig,
  type SubstitutionScope,
} from '../../../loading/resolve/index.ts';
import type { CommandSpec } from '../../../ports/index.ts';
import type { RegisteredHandler } from '../../contracts.ts';
import type { HandlerEntry, RunContext } from '../context.ts';

/**
 * What a command hook runs (hooks.md, "Exec form and shell form", "Reference scripts by path"):
 * the form, the placeholders, the checks and the exported variables are `loading/resolve`'s
 * `resolveHookCommand`; this file only says which plugin, which user options and which host
 * defaults a handler gets.
 */

/** A spec to run with its exported variables, or none and the issues that say why. */
export interface CommandPlan {
  readonly spec?: CommandSpec;
  /** The path variables (and a plugin's options) the process gets on top of its environment. */
  readonly exported?: Readonly<Record<string, string>>;
  /** Set when the program would start nothing: the run is a failure to start, with this message. */
  readonly notStarted?: string;
  readonly issues: readonly PluginIssue[];
}

const NO_OPTIONS: ResolvedUserConfig = { declared: {}, values: {} };

/** What `${...}` in this handler's `command` and `args` resolve against. */
function substitutionScope(entry: RegisteredHandler, context: RunContext): SubstitutionScope {
  const { pluginId } = entry;
  const { locations, environment } = context.ports;
  return {
    pluginId: pluginId ?? '',
    locations: pluginId === undefined ? locationsWithoutPlugin(locations) : locations,
    environment,
    userConfig:
      pluginId === undefined ? NO_OPTIONS : (context.userConfigOf?.(pluginId) ?? NO_OPTIONS),
    windows: context.windows,
    signal: context.signal,
  };
}

/** The plan of one command handler; issues are on `hooks.<event>.command` and `.args[i]`. */
export async function planCommand(
  entry: HandlerEntry<'command'>,
  context: RunContext,
): Promise<CommandPlan> {
  const { resolved, notStarted, issues } = await resolveHookCommand(
    entry.handler,
    substitutionScope(entry, context),
    {
      path: `hooks.${entry.event}`,
      defaultShell: context.defaultShell,
      ofPlugin: entry.pluginId !== undefined,
    },
  );
  return {
    ...(resolved === undefined ? {} : { spec: resolved.spec, exported: resolved.environment }),
    ...(notStarted === undefined ? {} : { notStarted }),
    issues,
  };
}
