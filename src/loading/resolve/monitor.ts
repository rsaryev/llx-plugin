import type { PluginIssue } from '../../format/issues.ts';
import type { Monitor, MonitorTrigger } from '../../format/monitors.ts';
import type { MonitorPaths, SubstitutionScope } from './scope.ts';
import { rejectUserConfigInShell } from './shell-guard.ts';
import { MONITOR_GUARD } from './shell-guard-monitor.ts';
import { monitorCommandPolicy } from './surfaces.ts';
import { substituter, type TokenReference } from './substitute.ts';
import { isPluginVariable, pluginVariableValue } from './variables.ts';

/**
 * A monitor resolved for this host (plugins/manifest-reference.md, "Where each variable resolves";
 * plugins/components.md, "Monitors"). The kit never starts the process: the host runs `command`
 * through a shell, in the session's working directory, outside any sandbox, with the environment
 * below, and turns what it prints into notifications.
 */
export interface ResolvedMonitor {
  readonly name: string;
  /** `command` with `${...}` substituted. */
  readonly command: string;
  /** As written: `${...}` does not resolve there (the table lists `command` only). */
  readonly description: string;
  /** When the monitor starts; `monitorsToStart` decides it from this. */
  readonly when: MonitorTrigger;
  /**
   * What the process receives besides the host's own environment: nothing. The table says "Not
   * exported" and components.md adds that monitor processes get no `CLAUDE_PLUGIN_OPTION_<KEY>`.
   * With `SubstitutionScope.monitorPaths: 'environment-reference'` (an opt-in) the path variables
   * `command` names, as the host reports them, so that the references it holds have a value.
   */
  readonly environment: Readonly<Record<string, string>>;
}

export interface MonitorResolution {
  /** Undefined when the monitor does not start. */
  readonly resolved: ResolvedMonitor | undefined;
  readonly issues: readonly PluginIssue[];
}

type Exported = (
  referenced: readonly TokenReference[],
  scope: SubstitutionScope,
) => Promise<Record<string, string>>;

/** The path variables a command references, as the host reports them. */
const referencedPaths: Exported = async (referenced, scope) => {
  const names = referenced.flatMap((token) =>
    'name' in token && isPluginVariable(token.name) ? [token.name] : [],
  );
  const values = await Promise.all(names.map((name) => pluginVariableValue(name, scope)));
  return Object.fromEntries(names.map((name, at) => [name, values[at] ?? '']));
};

/** Pasted paths need no environment ("Not exported"); references need the values they name. */
const EXPORTED: { readonly [M in MonitorPaths]: Exported } = {
  pasted: () => Promise.resolve({}),
  'environment-reference': referencedPaths,
};

/**
 * Resolves one monitor of a plugin. `command` gets the three path variables and `${ENV_VAR}` from the
 * environment, "but never `${user_config.*}`": a command that references it is an error and the
 * monitor does not start. The check reads the template, so it fires with nothing configured.
 */
export async function resolveMonitor(
  monitor: Monitor,
  scope: SubstitutionScope,
): Promise<MonitorResolution> {
  const path = `monitors.${monitor.name}.command`;
  const refused = rejectUserConfigInShell(
    MONITOR_GUARD,
    monitor.command,
    { monitor: monitor.name, plugin: scope.pluginId },
    path,
  );
  if (refused) return { resolved: undefined, issues: [refused] };
  const done = await substituter(scope).run(monitor.command, monitorCommandPolicy(scope), path);
  const environment = await EXPORTED[scope.monitorPaths ?? 'pasted'](done.referenced, scope);
  return {
    resolved: {
      name: monitor.name,
      command: done.text,
      description: monitor.description,
      when: monitor.when,
      environment,
    },
    issues: [...done.issues],
  };
}
