import type { PluginIssue } from '../format/issues.ts';
import type { Monitor } from '../format/monitors.ts';
import {
  monitorsToStart,
  monitorsToStop,
  resolveMonitor,
  skillTriggerNames,
  type InvokedSkill,
  type MonitorEvent,
  type MonitorMode,
  type MonitorStopEvent,
  type ResolvedMonitor,
} from '../loading/index.ts';
import {
  currentOf,
  monitorKey,
  type MonitorId,
  type MonitorLedgerState,
  type SessionCore,
} from './session-core.ts';
import { subprocessFor } from './session-environment.ts';
import { scopeOf, type ScopeUse } from './scope.ts';
import type { SessionOptions } from './session-types.ts';
import type { ActivePlugin } from './state.ts';
import type { Resolved } from './types.ts';

/**
 * One monitor to start now, ready to spawn (plugins/manifest-reference.md, "monitors": "Shell command
 * Claude Code runs as a persistent background process in the session working directory";
 * plugins/components.md, "Monitors": it "runs in a shell ... with your full user permissions and
 * outside the sandbox"). The host runs `monitor.command` through a POSIX shell (`sh -c`; Git Bash on
 * Windows) in `cwd` with exactly `env`, and turns what it prints into notifications.
 */
export interface MonitorStart {
  /** The monitor resolved: `pluginId`, `name`, `description`, `when`, `command`, its own `environment`. */
  readonly monitor: ResolvedMonitor;
  /** The session's working directory. */
  readonly cwd: string;
  /**
   * The whole environment of the process: `subprocessEnvironment('monitor')` with
   * `monitor.environment` (the path variables `command` references) written over it.
   */
  readonly env: Readonly<Record<string, string>>;
}

/** What `monitorsToStart` reads besides the session: the host's facts of `MonitorMode`. */
export interface MonitorStartOptions extends Omit<MonitorMode, 'interactive'> {
  readonly signal?: AbortSignal;
}

export interface MonitorPart {
  /**
   * The monitors of the enabled plugins to start now, each once per session: every `always` monitor
   * not started yet (at session start, and after an update enabled or reloaded a plugin), and every
   * `on-skill-invoke:<skill>` monitor whose skill `expandSkill` has run (`skillTriggerNames`). Call
   * it when the session opens, after `host.update` and after each skill expansion. Nothing starts
   * when `SessionOptions.interactive` is false. A monitor that must not start (a `${user_config.*}`
   * reference) is left out with its issue, once. What it returns counts as started.
   */
  monitorsToStart(options?: MonitorStartOptions): Promise<Resolved<MonitorStart>>;
  /**
   * The started monitors to stop now: none for `plugin-disabled` ("Claude Code doesn't stop monitors
   * that are already running"), all of them for `session-ended`, which forgets them.
   */
  monitorsToStop(event: MonitorStopEvent): readonly MonitorId[];
  /**
   * What this session's monitors are decided from, as a copy in plain data: the skills that ran and
   * the monitors handed out and not stopped. A host that reopens a chat's session (its trust,
   * directories or settings changed) passes it as `SessionOptions.monitorLedger`.
   */
  monitorLedger(): MonitorLedgerState;
}

/** The skill a successful `expandSkill` ran (its plugin and names), for the `on-skill-invoke` monitors. */
export function recordInvocation(
  core: SessionCore,
  skill: { readonly plugin?: { readonly id: string }; readonly names: readonly string[] },
): void {
  const invoked: InvokedSkill =
    skill.plugin === undefined
      ? { names: skill.names }
      : { pluginId: skill.plugin.id, names: skill.names };
  core.monitors.invoked.push(invoked);
}

/** The events of this session for one plugin: it started, and each of its skills that ran. */
const eventsOf = (core: SessionCore, plugin: ActivePlugin): readonly MonitorEvent[] => [
  { kind: 'session-start' },
  ...core.monitors.invoked.flatMap((skill) =>
    skillTriggerNames(plugin.id, skill).map((name): MonitorEvent => ({
      kind: 'skill-invoked',
      skill: name,
    })),
  ),
];

/** The plugin's monitors to start now; each is marked started before it resolves. */
function dueOf(core: SessionCore, plugin: ActivePlugin, mode: MonitorMode): readonly Monitor[] {
  const { started } = core.monitors;
  const ids = [...started.values()].filter((id) => id.pluginId === plugin.id);
  const names = new Set(ids.map((id) => id.name));
  const due = new Map<string, Monitor>();
  for (const event of eventsOf(core, plugin)) {
    for (const monitor of monitorsToStart(plugin.plugin.monitors, event, names, mode))
      due.set(monitor.name, monitor);
  }
  for (const name of due.keys()) {
    const id = { pluginId: plugin.id, name };
    started.set(monitorKey(id), id);
  }
  return [...due.values()];
}

/** The session's monitor lifecycle over its core (docs/API.md, "Monitors of a session"). */
export function createMonitorPart(core: SessionCore, optionsOf: () => SessionOptions): MonitorPart {
  return {
    async monitorsToStart({ signal, ...facts } = {}) {
      const options = optionsOf();
      const use: ScopeUse = { state: currentOf(core).state, options };
      const mode: MonitorMode = { ...facts, interactive: options.interactive ?? true };
      const due = use.state.active.flatMap((plugin) =>
        dueOf(core, plugin, mode).map((monitor) => ({ plugin, monitor })),
      );
      const env = subprocessFor(core, options, 'monitor');
      const done = await Promise.all(
        due.map(({ plugin, monitor }) => resolveMonitor(monitor, scopeOf(use, plugin, signal))),
      );
      const issues: PluginIssue[] = done.flatMap((one) => one.issues);
      const resolved = done.flatMap(({ resolved: monitor }) =>
        monitor === undefined
          ? []
          : [{ monitor, cwd: options.cwd, env: { ...env, ...monitor.environment } }],
      );
      return { resolved, issues };
    },
    monitorLedger: () => ({
      invoked: core.monitors.invoked.map((skill) => ({ ...skill, names: [...skill.names] })),
      started: [...core.monitors.started.values()].map((id) => ({ ...id })),
    }),
    monitorsToStop(event) {
      const { started } = core.monitors;
      const stopping = monitorsToStop(started.values(), event);
      for (const id of stopping) started.delete(monitorKey(id));
      return stopping;
    },
  };
}
