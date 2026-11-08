import { HOOK_EVENTS } from '../protocol/hook-events.ts';
import type { HookMatcherGroup, HooksSettings } from '../protocol/hook-config.ts';
import { readHandler } from './hooks-handlers.ts';
import { blocksLoading, error, warning, type PluginIssue } from './issues.ts';

/**
 * Reading hook configuration (hooks.md, "Configuration"): three levels of nesting, an event, its
 * matcher groups, and each group's handlers. A hooks file (`hooks/hooks.json`) wraps the event map
 * in a top-level `"hooks"` key; an inline object (the manifest's `hooks`, a skill's frontmatter,
 * the `hooks` of `settings.json`) is the event map itself. A file that fails the hooks schema does
 * not load ("Failed to load hooks from <path>: <reason>"), so any error leaves `hooks` empty; the
 * caller, which knows the path, adds it to the reason.
 */
export interface HooksRead {
  /** Official shape. Empty when an error keeps the file from loading. */
  readonly hooks: HooksSettings;
  readonly issues: readonly PluginIssue[];
}

const EVENTS: ReadonlySet<string> = new Set(HOOK_EVENTS);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** An unanchored pattern that does not compile matches nothing (judgment): say so once, at load. */
function matcherIssues(matcher: unknown, path: string): PluginIssue[] {
  if (matcher === undefined) return [];
  if (typeof matcher !== 'string') {
    return [error(path, 'Invalid "matcher": expected a string')];
  }
  // "*" is match-all, not a pattern; `rules` holds the grammar, which layer 2 cannot import.
  if (matcher === '*') return [];
  try {
    new RegExp(matcher).test('');
    return [];
  } catch {
    return [
      warning(
        path,
        `The matcher "${matcher}" is not a valid regular expression and matches nothing`,
      ),
    ];
  }
}

const GROUP_KEYS = new Set(['matcher', 'hooks']);

function readGroup(
  raw: unknown,
  path: string,
): { group?: HookMatcherGroup; issues: PluginIssue[] } {
  if (!isRecord(raw)) return { issues: [error(path, 'A matcher group must be an object')] };
  const issues = matcherIssues(raw.matcher, `${path}.matcher`);
  for (const key of Object.keys(raw).filter((found) => !GROUP_KEYS.has(found))) {
    issues.push(warning(`${path}.${key}`, `Unknown field "${key}" is ignored`));
  }
  if (!Array.isArray(raw.hooks)) {
    return {
      issues: [...issues, error(`${path}.hooks`, 'Invalid "hooks": expected an array of handlers')],
    };
  }
  const read = raw.hooks.map((handler, index) => readHandler(handler, `${path}.hooks[${index}]`));
  issues.push(...read.flatMap((one) => one.issues));
  const handlers = read.flatMap((one) => (one.handler === undefined ? [] : [one.handler]));
  const group: HookMatcherGroup =
    typeof raw.matcher === 'string'
      ? { matcher: raw.matcher, hooks: handlers }
      : { hooks: handlers };
  return { group, issues };
}

function readEvent(
  event: string,
  raw: unknown,
): { groups?: HookMatcherGroup[]; issues: PluginIssue[] } {
  const path = `hooks.${event}`;
  // Judgment (spec/judgments.md): an unknown event name is kept and warned about, not an error.
  const issues = EVENTS.has(event) ? [] : [warning(path, `"${event}" is not a hook event`)];
  if (!Array.isArray(raw)) {
    return {
      issues: [...issues, error(path, `Invalid "${event}": expected an array of matcher groups`)],
    };
  }
  const read = raw.map((group, index) => readGroup(group, `${path}[${index}]`));
  issues.push(...read.flatMap((one) => one.issues));
  return { groups: read.flatMap((one) => (one.group === undefined ? [] : [one.group])), issues };
}

/** Reads an event map: the `hooks` object of `settings.json`, or an inline `hooks` object. */
export function readHooksSettings(raw: unknown): HooksRead {
  if (!isRecord(raw)) {
    return { hooks: {}, issues: [error('hooks', 'The hooks configuration must be an object')] };
  }
  const hooks: HooksSettings = {};
  const issues: PluginIssue[] = [];
  for (const [event, value] of Object.entries(raw)) {
    const read = readEvent(event, value);
    issues.push(...read.issues);
    if (read.groups !== undefined) hooks[event] = read.groups;
  }
  return blocksLoading(issues) ? { hooks: {}, issues } : { hooks, issues };
}

/**
 * Reads `hooks/hooks.json`: `{ "hooks": { <event>: [ { matcher?, hooks: [ <handler> ] } ] } }`.
 * Other top-level keys are ignored: `modules` belongs to the mods reader (components.md, "Hooks").
 */
export function readHooksFile(raw: unknown): HooksRead {
  if (!isRecord(raw)) {
    return { hooks: {}, issues: [error('hooks', 'The hooks file must be a JSON object')] };
  }
  if (!('hooks' in raw)) {
    return {
      hooks: {},
      issues: [
        error(
          'hooks',
          'The hooks file has no top-level "hooks" key: a file with only the event map, without that wrapper, fails to load',
        ),
      ],
    };
  }
  return readHooksSettings(raw.hooks);
}
