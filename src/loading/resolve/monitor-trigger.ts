import type { Monitor, MonitorTrigger } from '../../format/monitors.ts';

/**
 * What can start a monitor (plugins/manifest-reference.md, "monitors", the `when` row): a session
 * starting, plugins reloading, or a skill running.
 */
export type MonitorEvent =
  | { readonly kind: 'session-start' }
  | { readonly kind: 'plugin-reload' }
  | {
      readonly kind: 'skill-invoked';
      /** The skill that ran, as a trigger writes it after `on-skill-invoke:` (judgment J-L11). */
      readonly skill: string;
    };

/** Whether the host runs a person's session; plugin monitors start only in an interactive one. */
export interface MonitorMode {
  readonly interactive: boolean;
  /** False on third-party providers or when telemetry/nonessential traffic disables flag fetching. */
  readonly featureFlagsAvailable?: boolean;
  /** The host release, when it needs decisions for a release other than the tracked one. */
  readonly version?: string;
}

/** components.md § Monitors: flag-free monitors require v2.1.310. */
function versionAllowsMonitors(mode: MonitorMode): boolean {
  if (mode.featureFlagsAvailable !== false) return true;
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(mode.version ?? '');
  // Judgment: an unparseable host release cannot establish the required minimum.
  if (match === null) return false;
  const current = match.slice(1).map(Number);
  const minimum = [2, 1, 310];
  const firstDifference = minimum.findIndex((part, index) => current[index] !== part);
  return firstDifference < 0 || (current[firstDifference] ?? 0) > (minimum[firstDifference] ?? 0);
}

/** Already running monitors survive disabling a plugin; only session end stops them. */
export const monitorsToStop = (
  started: ReadonlySet<string>,
  event: 'plugin-disabled' | 'session-ended',
): readonly string[] => (STOP_RUNNING[event] ? [...started] : []);

const STOP_RUNNING = { 'plugin-disabled': false, 'session-ended': true } as const;

type EventKind = MonitorEvent['kind'];
type TriggerKind = MonitorTrigger['kind'];

// Only a skill event and a skill trigger carry `skill`, so `in` narrows each union without naming a kind.

/** `"always"`: "the monitor starts at session start and on plugin reload". */
const ALWAYS_STARTS_ON: { readonly [E in EventKind]: boolean } = {
  'session-start': true,
  'plugin-reload': true,
  'skill-invoked': false,
};

type Starts = (trigger: MonitorTrigger, event: MonitorEvent) => boolean;

/** Per trigger: whether an event is the one it waits for. */
const STARTS: { readonly [T in TriggerKind]: Starts } = {
  always: (_trigger, event) => ALWAYS_STARTS_ON[event.kind],
  // "With `on-skill-invoke:<skill>`, it starts the first time that skill runs."
  'on-skill-invoke': (trigger, event) =>
    'skill' in trigger && 'skill' in event && event.skill === trigger.skill,
};

/**
 * The monitors an event starts (plugins/manifest-reference.md, "monitors"; plugins/components.md,
 * "Monitors"). Pure: the host keeps the set of names it has started and spawns what comes back.
 *
 * - `always` starts on session start and on plugin reload; `on-skill-invoke:<skill>` only when that
 *   skill runs, and "the first time": a name already in `started` never starts again.
 * - "Plugin monitors don't start in non-interactive mode with the `-p` flag": nothing starts there.
 *   Judgment J-L9: the docs name only that flag, so `mode.interactive` is the kit's own input, which
 *   the host sets false for `-p` and for any run with no person at it.
 * - Judgment J-L10: `started` holds the names of the monitors the host has running (or has started in
 *   this session) for this plugin; none of them is returned again, for `always` as well, so a plugin
 *   reload does not start a second copy ("if you disable a plugin mid-session, Claude Code doesn't
 *   stop monitors that are already running"). A host that stopped one removes its name.
 */
export function monitorsToStart(
  monitors: readonly Monitor[],
  event: MonitorEvent,
  started: ReadonlySet<string>,
  mode: MonitorMode,
): Monitor[] {
  if (!mode.interactive || !versionAllowsMonitors(mode)) return [];
  return monitors.filter(
    (monitor) => !started.has(monitor.name) && STARTS[monitor.when.kind](monitor.when, event),
  );
}
