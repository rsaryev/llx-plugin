import { HOOK_EVENTS } from '../protocol/hook-events.ts';
import type { HookMatcherGroup, HooksSettings } from '../protocol/hook-config.ts';
import { readHandler } from './hooks-handlers.ts';
import { blocksLoading, error, warning, type PluginIssue } from './issues.ts';
import { isRecord } from '../protocol/is-record.ts';

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
  /**
   * Whether the plugin holding these hooks does not load at all (oracle 2.1.319, read `lenient`
   * only): a guard hook that cannot load "may be what guards the permissions declared beside it,
   * so nothing it sits in is applied".
   */
  readonly rejectsPlugin?: boolean;
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

const guardFailure = (event: string, options: HooksReadOptions): { rejectsPlugin?: true } =>
  options.lenient === true && GUARDED_EVENTS.has(event) ? { rejectsPlugin: true } : {};

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

interface EventRead {
  readonly groups?: HookMatcherGroup[];
  readonly issues: PluginIssue[];
  /** A guard event that could not be read: under `lenient`, the plugin does not load. */
  readonly rejectsPlugin?: boolean;
}

function readEvent(event: string, raw: unknown, options: HooksReadOptions): EventRead {
  const path = `hooks.${event}`;
  const known = EVENTS.has(event);
  // Judgment (spec/judgments.md): an unknown event name is warned about, not an error; a plugin's
  // hooks do not load it (oracle 2.1.319), `settings.json` keeps it as written.
  const issues = known ? [] : [warning(path, `"${event}" is not a hook event`)];
  if (options.lenient === true && !known) return { issues };
  if (options.lenient === true && raw === null) return { issues };
  if (!Array.isArray(raw)) {
    const invalid = error(path, `Invalid "${event}": expected an array of matcher groups`);
    return {
      issues: [...issues, ...entryIssues(event, [invalid], options)],
      ...guardFailure(event, options),
    };
  }
  const ignoresMatcher = NO_MATCHER_EVENTS.has(event);
  const read = raw.map((group, index) => readGroup(group, `${path}[${index}]`, ignoresMatcher));
  const found = read.flatMap((one) => one.issues);
  issues.push(...entryIssues(event, found, options));
  return {
    groups: read.flatMap((one) => (one.group === undefined ? [] : [one.group])),
    issues,
    ...(blocksLoading(found) ? guardFailure(event, options) : {}),
  };
}

/** Reads an event map: the `hooks` object of `settings.json`, or an inline `hooks` object. */
export function readHooksSettings(raw: unknown, options: HooksReadOptions = {}): HooksRead {
  if (!isRecord(raw)) {
    return { hooks: {}, issues: [error('hooks', 'The hooks configuration must be an object')] };
  }
  const entries: [string, HookMatcherGroup[]][] = [];
  const issues: PluginIssue[] = [];
  let rejectsPlugin = false;
  for (const [event, value] of Object.entries(raw)) {
    const read = readEvent(event, value, options);
    issues.push(...read.issues);
    rejectsPlugin ||= read.rejectsPlugin === true;
    if (read.groups !== undefined) entries.push([event, read.groups]);
  }
  // `Object.fromEntries` defines own properties, so a JSON-parsed `__proto__` event stays a key.
  const hooks = blocksLoading(issues) ? {} : Object.fromEntries(entries);
  return { hooks, issues, ...(rejectsPlugin && { rejectsPlugin }) };
}

/** Top-level keys of a hooks file that are not event maps. */
const FILE_KEYS: ReadonlySet<string> = new Set(['hooks', 'description', 'modules']);

/** A matcher group with handlers: an object whose `hooks` is a non-empty list. */
const holdsHandlers = (group: unknown): boolean =>
  isRecord(group) && Array.isArray(group.hooks) && group.hooks.length > 0;

/**
 * Whether a hooks file holds, outside its `hooks` object, what may be a guard (oracle 2.1.319): a
 * `PreToolUse` or `PermissionRequest` key that is anything but null or an empty list, or a key that
 * is no hook event holding a matcher group with handlers (`_comment: ["text"]` is harmless). Another known event there is ignored.
 */
function strayGuard(raw: Record<string, unknown>): boolean {
  return Object.entries(raw).some(([key, value]) => {
    if (FILE_KEYS.has(key)) return false;
    if (GUARDED_EVENTS.has(key))
      return value !== null && !(Array.isArray(value) && value.length === 0);
    return !EVENTS.has(key) && Array.isArray(value) && value.some(holdsHandlers);
  });
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
  const rejects = options.lenient === true && strayGuard(raw);
  if ('hooks' in raw) return readWrapped(raw.hooks, rejects, options);
  // A mod-only file (`modules` with no `hooks`) is valid (mods/reference.md, "Files"): no hooks.
  if ('modules' in raw && !rejects) return { hooks: {}, issues: [] };
  return {
    hooks: {},
    ...(rejects && { rejectsPlugin: true }),
    issues: [
      error(
        'hooks',
        'The hooks file has no top-level "hooks" key: a file with only the event map, without that wrapper, fails to load',
      ),
    ],
  };
}

/** The `hooks` object of a hooks file; `rejects`: the file also holds a stray list outside it. */
function readWrapped(wrapped: unknown, rejects: boolean, options: HooksReadOptions): HooksRead {
  const lenient = options.lenient === true;
  const read = readHooksSettings(wrapped === null && lenient ? {} : wrapped, options);
  const stray = rejects
    ? [error('hooks', 'An event list is declared at the top level, outside the "hooks" object')]
    : [];
  const wrongShape = lenient && wrapped !== null && !isRecord(wrapped);
  return rejects || wrongShape || read.rejectsPlugin === true
    ? { ...read, issues: [...stray, ...read.issues], rejectsPlugin: true }
    : read;
}
