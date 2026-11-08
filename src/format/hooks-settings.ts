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

/**
 * Events the docs list as "no matcher support" (hooks.md, "Matcher patterns"): a `matcher` there
 * "is silently ignored", so a pattern that does not compile is not worth a warning.
 */
const NO_MATCHER_EVENTS: ReadonlySet<string> = new Set([
  'CwdChanged',
  'UserPromptSubmit',
  'PostToolBatch',
  'Stop',
  'TeammateIdle',
  'TaskCreated',
  'TaskCompleted',
  'WorktreeCreate',
  'WorktreeRemove',
  'MessageDisplay',
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** An unanchored pattern that does not compile matches nothing (judgment): say so once, at load. */
function matcherIssues(matcher: unknown, path: string, ignored: boolean): PluginIssue[] {
  if (matcher === undefined) return [];
  if (typeof matcher !== 'string') {
    return [error(path, 'Invalid "matcher": expected a string')];
  }
  if (ignored) return [];
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

/** How a hooks object treats an entry it cannot read. */
export interface HooksReadOptions {
  /**
   * Drop the entry with a warning instead of failing the whole object, except under the guarded
   * events: a guard that silently went missing could leave what it protected open. Plugin hooks
   * load this way (oracle 2.1.319, docs/SPEC.md "Sources of truth"); `settings.json` hooks do not
   * (settings.md: a managed event that is not a list ignores the whole field).
   */
  readonly lenient?: boolean;
}

const GUARDED_EVENTS: ReadonlySet<string> = new Set(['PreToolUse', 'PermissionRequest']);

/** What an entry's problems amount to under its event: the entry is dropped, with a warning unless it guards. */
function entryIssues(
  event: string,
  issues: readonly PluginIssue[],
  options: HooksReadOptions,
): PluginIssue[] {
  if (options.lenient !== true || GUARDED_EVENTS.has(event)) return [...issues];
  return issues.map((found) =>
    found.severity === 'error'
      ? warning(found.path, `${found.message}; the entry is ignored`)
      : found,
  );
}

function readGroup(
  raw: unknown,
  path: string,
  ignoresMatcher: boolean,
): { group?: HookMatcherGroup; issues: PluginIssue[] } {
  if (!isRecord(raw)) return { issues: [error(path, 'A matcher group must be an object')] };
  const issues = matcherIssues(raw.matcher, `${path}.matcher`, ignoresMatcher);
  // A group whose matcher cannot be read is dropped: loaded without it, it would match everything.
  if (blocksLoading(issues)) return { issues };
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
  options: HooksReadOptions,
): { groups?: HookMatcherGroup[]; issues: PluginIssue[] } {
  const path = `hooks.${event}`;
  // Judgment (spec/judgments.md): an unknown event name is kept and warned about, not an error.
  const issues = EVENTS.has(event) ? [] : [warning(path, `"${event}" is not a hook event`)];
  if (!Array.isArray(raw)) {
    const invalid = error(path, `Invalid "${event}": expected an array of matcher groups`);
    return { issues: [...issues, ...entryIssues(event, [invalid], options)] };
  }
  const ignoresMatcher = NO_MATCHER_EVENTS.has(event);
  const read = raw.map((group, index) => readGroup(group, `${path}[${index}]`, ignoresMatcher));
  issues.push(
    ...entryIssues(
      event,
      read.flatMap((one) => one.issues),
      options,
    ),
  );
  return { groups: read.flatMap((one) => (one.group === undefined ? [] : [one.group])), issues };
}

/** Reads an event map: the `hooks` object of `settings.json`, or an inline `hooks` object. */
export function readHooksSettings(raw: unknown, options: HooksReadOptions = {}): HooksRead {
  if (!isRecord(raw)) {
    return { hooks: {}, issues: [error('hooks', 'The hooks configuration must be an object')] };
  }
  const entries: [string, HookMatcherGroup[]][] = [];
  const issues: PluginIssue[] = [];
  for (const [event, value] of Object.entries(raw)) {
    const read = readEvent(event, value, options);
    issues.push(...read.issues);
    if (read.groups !== undefined) entries.push([event, read.groups]);
  }
  // `Object.fromEntries` defines own properties, so a JSON-parsed `__proto__` event stays a key.
  return blocksLoading(issues)
    ? { hooks: {}, issues }
    : { hooks: Object.fromEntries(entries), issues };
}

/**
 * Reads `hooks/hooks.json`: `{ "hooks": { <event>: [ { matcher?, hooks: [ <handler> ] } ] } }`.
 * Other top-level keys are ignored: `modules` belongs to the mods reader (components.md, "Hooks"),
 * and a file with `modules` alone holds no hooks.
 */
export function readHooksFile(raw: unknown, options: HooksReadOptions = {}): HooksRead {
  if (!isRecord(raw)) {
    return { hooks: {}, issues: [error('hooks', 'The hooks file must be a JSON object')] };
  }
  // A mod-only file (`modules` with no `hooks`) is valid (mods/reference.md, "Files"): no hooks.
  if (!('hooks' in raw) && 'modules' in raw) return { hooks: {}, issues: [] };
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
  return readHooksSettings(raw.hooks, options);
}
