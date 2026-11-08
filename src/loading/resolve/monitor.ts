import type { PluginIssue } from '../../format/issues.ts';
import type { Monitor, MonitorTrigger } from '../../format/monitors.ts';
import { exportedEnvironment } from './exported-environment.ts';
import { fieldRunner } from './field-runner.ts';
import type { SubstitutionScope } from './scope.ts';
import { rejectUserConfigInShell } from './shell-guard.ts';
import { MONITOR_GUARD } from './shell-guard-monitor.ts';
import { substituter } from './substitute.ts';

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
   */
  readonly environment: Readonly<Record<string, string>>;
}

export interface MonitorResolution {
  /** Undefined when the monitor does not start. */
  readonly resolved: ResolvedMonitor | undefined;
  readonly issues: readonly PluginIssue[];
}

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
  const run = fieldRunner(substituter(scope), `monitors.${monitor.name}`);
  const [command, environment] = await Promise.all([
    run.one('monitor-command', monitor.command, 'command'),
    exportedEnvironment('monitor-command', scope),
  ]);
  return {
    resolved: {
      name: monitor.name,
      command: command.value,
      description: monitor.description,
      when: monitor.when,
      environment,
    },
    issues: command.issues,
  };
}
