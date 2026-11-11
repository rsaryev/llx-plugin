import type { PluginIssue } from '../../format/issues.ts';
import type { Monitor, MonitorTrigger } from '../../format/monitors.ts';
import type { SubstitutionScope } from './scope.ts';
import { shellExports } from './shell-exports.ts';
import { rejectUserConfigInShell } from './shell-guard.ts';
import { MONITOR_GUARD } from './shell-guard-monitor.ts';
import { surfacePolicy } from './surfaces.ts';
import { substituter } from './substituter.ts';

/**
 * A monitor resolved for this host (plugins/manifest-reference.md, "Where each variable resolves";
 * plugins/components.md, "Monitors"). The kit never starts the process: the host runs `command`
 * through a shell, in the session's working directory, outside any sandbox, with the environment
 * below, and turns what it prints into notifications.
 */
export interface ResolvedMonitor {
  readonly name: string;
  /**
   * The plugin it belongs to, by the id the host uses for it (`SubstitutionScope.pluginId`): what a
   * host keys a registration by. The same field on every resolved process (judgment, spec/judgments.md).
   */
  readonly pluginId: string;
  /** `command` with `${...}` substituted. */
  readonly command: string;
  /** As written: `${...}` does not resolve there (the table lists `command` only). */
  readonly description: string;
  /** When the monitor starts; `monitorsToStart` decides it from this. */
  readonly when: MonitorTrigger;
  /**
   * What the process receives besides the host's own environment. The table says "Not exported"
   * and components.md adds that monitor processes get no `CLAUDE_PLUGIN_OPTION_<KEY>`: no option and
   * no variable `command` does not name. With the default `SubstitutionScope.shellPaths`
   * (`environment-reference`) it holds the path variables `command` references, as the host reports
   * them, so the references have a value; with `pasted` it is empty (judgment, spec/judgments.md).
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
  const run = substituter(scope);
  const done = await run.run(monitor.command, surfacePolicy('monitor-command', scope), path);
  const environment = await shellExports(done.referenced, scope, run.variable);
  return {
    resolved: {
      name: monitor.name,
      pluginId: scope.pluginId,
      command: done.text,
      description: monitor.description,
      when: monitor.when,
      environment,
    },
    issues: [...done.issues],
  };
}
