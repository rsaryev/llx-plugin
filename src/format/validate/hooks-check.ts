import { HOOK_EVENTS } from '../../protocol/hook-events.ts';
import { errorAt, warningAt, type Finding } from './finding.ts';
import { handlerAdvice, handlerProblem } from './hook-handlers.ts';
import { isRecord, kindOf, withArticle } from './received.ts';

/**
 * The hook configuration checks of `claude plugin validate` (oracle 2.1.319), for the `hooks`
 * object of `hooks/hooks.json` and the inline one of `plugin.json`. An entry that cannot load is
 * dropped at runtime and reported as a warning, except under `PreToolUse` and `PermissionRequest`:
 * a guard that silently went missing could leave the permissions beside it unprotected, so there
 * it is an error.
 */
const EVENTS: ReadonlySet<string> = new Set(HOOK_EVENTS);
const GUARDED: ReadonlySet<string> = new Set(['PreToolUse', 'PermissionRequest']);

const IGNORED = '; entry ignored at runtime';
/** Why a guard that cannot load is an error. */
export const GUARDED_TAIL =
  ' — a PreToolUse/PermissionRequest hook that cannot be loaded may be what guards the permissions declared beside it, so nothing it sits in is applied until the entry is fixed or removed';

/** One problem with an entry, worded for its event. */
function entryFinding(event: string, where: string, problem: string): Finding {
  return GUARDED.has(event)
    ? errorAt('hooks', `${where}: ${problem}${GUARDED_TAIL}`)
    : warningAt('hooks', `${where}: ${problem}${IGNORED}`);
}

function handlerFindings(
  event: string,
  where: string,
  handlers: unknown[],
  advice: boolean,
): Finding[] {
  return handlers.flatMap((handler, index) => {
    const at = `${where}.hooks.${index}`;
    const problem = handlerProblem(handler);
    if (problem !== undefined) return [entryFinding(event, at, problem)];
    const shell = advice ? handlerAdvice(handler) : undefined;
    return shell === undefined ? [] : [warningAt(`hooks.${event}`, shell)];
  });
}

function groupFindings(event: string, where: string, group: unknown, advice: boolean): Finding[] {
  if (!isRecord(group)) {
    return [
      entryFinding(event, where, `Hook matcher must be an object; received ${withArticle(group)}`),
    ];
  }
  const { matcher, hooks } = group;
  if (!Array.isArray(hooks)) {
    const message = `Hook matcher "hooks" must be an array of hook entries; received ${withArticle(hooks)}`;
    return [entryFinding(event, where, message)];
  }
  if (matcher !== undefined && typeof matcher !== 'string') {
    const message = `Invalid hook matcher (matcher: Invalid input: expected string, received ${kindOf(matcher)})`;
    return [entryFinding(event, where, message)];
  }
  return handlerFindings(event, where, hooks, advice);
}

function eventFindings(site: HooksSite, event: string, groups: unknown): Finding[] {
  const { prefix, advice } = site;
  const where = `${prefix}.${event}`;
  if (!EVENTS.has(event)) return [warningAt('hooks', `${where}: unknown hook event${IGNORED}`)];
  if (!Array.isArray(groups)) {
    const message = `must be an array of matchers; received ${withArticle(groups)}`;
    return [entryFinding(event, where, message)];
  }
  return groups.flatMap((group, index) => groupFindings(event, `${where}.${index}`, group, advice));
}

/** Where a hooks object sits and whether its shell commands are advised on. */
export interface HooksSite {
  /** How the oracle names it: `hooks`, or `hooks.0` for one map of a list. */
  readonly prefix: string;
  /** The unquoted-placeholder warning applies to `hooks/hooks.json` only, not to hooks written inline. */
  readonly advice: boolean;
}

const FILE_SITE: HooksSite = { prefix: 'hooks', advice: true };

/** The findings of one hooks object, event by event. */
export function hooksMapFindings(
  map: Readonly<Record<string, unknown>>,
  site: HooksSite = FILE_SITE,
): Finding[] {
  return Object.entries(map).flatMap(([event, groups]) => eventFindings(site, event, groups));
}
