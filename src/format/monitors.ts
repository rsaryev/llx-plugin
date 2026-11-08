import { z } from 'zod';
import { error, type PluginIssue } from './issues.ts';

/**
 * Monitor entries of a plugin (plugins/manifest-reference.md, "monitors"; plugins/components.md,
 * "Monitors"). The SDK has no monitor config type (no match in sdk.d.ts), so `Monitor` is the kit's,
 * transcribed from the field table: "Each entry is a strict object with these fields", and "An
 * unknown key inside one is an error, and the plugin doesn't load" (manifest-reference, "Unrecognized
 * fields").
 */

/** `always`, or the first run of one skill. */
export type MonitorTrigger =
  | { readonly kind: 'always' }
  | { readonly kind: 'on-skill-invoke'; readonly skill: string };

export interface Monitor {
  /** "Identifier unique within the plugin." */
  readonly name: string;
  /** "Shell command Claude Code runs as a persistent background process in the session working directory." */
  readonly command: string;
  /** "Short summary shown in the task panel and notification summaries." */
  readonly description: string;
  /** The `when` field; absent means `always`, "the default". */
  readonly when: MonitorTrigger;
}

/** What a monitor without `when` starts on: "`\"always\"`, the default". */
const ALWAYS_TRIGGER: MonitorTrigger = { kind: 'always' };

const ALWAYS = 'always';
const ON_SKILL_INVOKE = 'on-skill-invoke:';

/** The documented forms of `when`, for the message of a malformed one. */
const WHEN_FORMS = `"${ALWAYS}" or "${ON_SKILL_INVOKE}<skill>"`;

/**
 * `"always"` or `"on-skill-invoke:<skill>"`. Judgment: the skill after the colon must not be empty
 * (the docs write `<skill>` as a placeholder and a trigger with no skill could never fire), and the
 * value is read as written, with no trimming or case folding.
 */
export function parseMonitorTrigger(when: string): MonitorTrigger | undefined {
  if (when === ALWAYS) return ALWAYS_TRIGGER;
  const skill = when.startsWith(ON_SKILL_INVOKE) ? when.slice(ON_SKILL_INVOKE.length) : '';
  return skill.length > 0 ? { kind: 'on-skill-invoke', skill } : undefined;
}

/** Judgment: `name`, `command` and `description` are required, so an empty string counts as missing. */
const text = (what: string) =>
  z.string({ error: 'expected a string' }).min(1, { error: `${what} must not be empty` });

const entrySchema = z.strictObject({
  name: text('name'),
  command: text('command'),
  description: text('description'),
  when: z.string({ error: `expected ${WHEN_FORMS}` }).exactOptional(),
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const reason = (failure: z.ZodError): string =>
  failure.issues
    .map((found) =>
      found.path.length > 0 ? `${found.path.join('.')}: ${found.message}` : found.message,
    )
    .join('; ');

const invalid = (origin: string, index: number, why: string): PluginIssue =>
  error(`${origin}[${index}]`, `Invalid monitor at ${origin}[${index}]: ${why}`);

export interface MonitorRead {
  /** Undefined when Claude Code would not load the entry. */
  readonly monitor: Monitor | undefined;
  readonly issues: readonly PluginIssue[];
}

/** One entry of the array; `index` is its position, for the issue. */
export function readMonitor(raw: unknown, origin: string, index: number): MonitorRead {
  if (!isRecord(raw)) {
    return { monitor: undefined, issues: [invalid(origin, index, 'expected an object')] };
  }
  const parsed = entrySchema.safeParse(raw);
  if (!parsed.success) {
    return { monitor: undefined, issues: [invalid(origin, index, reason(parsed.error))] };
  }
  const { name, command, description, when } = parsed.data;
  const trigger = when === undefined ? ALWAYS_TRIGGER : parseMonitorTrigger(when);
  if (!trigger) {
    const why = `when: expected ${WHEN_FORMS}, got "${when}"`;
    return { monitor: undefined, issues: [invalid(origin, index, why)] };
  }
  return { monitor: { name, command, description, when: trigger }, issues: [] };
}

export interface MonitorsRead {
  readonly monitors: Monitor[];
  readonly issues: PluginIssue[];
}

/**
 * The monitors of one source: `monitors/monitors.json`, a `.json` file `experimental.monitors` names,
 * or its inline array (components.md: "The `experimental.monitors` manifest key takes the same array
 * inline or a path to a JSON file"; manifest-reference: "a `.json` file holding the monitors array").
 *
 * Every problem is an error issue, which keeps the plugin from loading. Judgment: an invalid entry
 * is left out and a later entry of a name already taken is left out too (the first keeps the name),
 * while the valid entries are still returned, so a caller that reports and carries on has the rest;
 * the docs say the plugin does not load and give no partial result.
 */
export function readMonitors(raw: unknown, origin: string): MonitorsRead {
  if (!Array.isArray(raw)) {
    const why = 'expected an array of monitors';
    return { monitors: [], issues: [error(origin, `Invalid monitors in ${origin}: ${why}`)] };
  }
  const monitors: Monitor[] = [];
  const issues: PluginIssue[] = [];
  const names = new Set<string>();
  raw.forEach((entry: unknown, index) => {
    const read = readMonitor(entry, origin, index);
    issues.push(...read.issues);
    const { monitor } = read;
    if (!monitor) return;
    if (names.has(monitor.name)) {
      const why = `name "${monitor.name}" is already used by an earlier monitor; names must be unique within the plugin`;
      issues.push(invalid(origin, index, why));
      return;
    }
    names.add(monitor.name);
    monitors.push(monitor);
  });
  return { monitors, issues };
}
