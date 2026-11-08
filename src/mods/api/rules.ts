import type { EventRules } from '../types.ts';
import { API_EVENT_NAMES } from '../../protocol/mods-events.ts';
import { isEngineEvent, isEventAnswered, isRecord } from './call.ts';

/** The calls answered by `{ value }` or `{ deny }` only: the mods API calls that no event of Claude Code's has the name of. */
const VALUE_CALLS: ReadonlySet<string> = new Set(
  API_EVENT_NAMES.filter((name) => !isEventAnswered(name) && !isEngineEvent(name)),
);

/**
 * What the chain knows of the mods API calls (reference.md, "Mods API calls"): a hook on one
 * "can return `next(e)`, `{ deny: reason }`, or `{ value }`", so any other result fails the hook like
 * a throw. Other events pass through; compose with `createEventRules()` through `combineRules`.
 */
export const apiEventRules: Pick<EventRules, 'shapeProblem'> = {
  shapeProblem(event, result) {
    if (!VALUE_CALLS.has(event)) return undefined;
    const answers = isRecord(result) && (typeof result.deny === 'string' || 'value' in result);
    return answers ? undefined : `${event} result: returned neither { value } nor { deny }`;
  },
};

/**
 * `rules` with the shape of the mods API calls added: the chain takes one set of rules, so the
 * host passes `withApiRules(createEventRules())`.
 */
export const withApiRules = (rules: EventRules): EventRules => ({
  ...rules,
  shapeProblem: (event, result, answered) =>
    apiEventRules.shapeProblem(event, result, answered) ??
    rules.shapeProblem(event, result, answered),
});
