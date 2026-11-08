import type { EventRules } from '../types.ts';
import { API_EVENT_NAMES, STREAM_EVENTS } from '../../protocol/mods-events.ts';
import { isEngineEvent, isEventAnswered, isRecord } from './call.ts';

const STREAMS: ReadonlySet<string> = new Set(STREAM_EVENTS);

/**
 * The calls answered by `{ value }` or `{ deny }` only: the mods API calls that no event of Claude
 * Code's has the name of, and that do not stream. A hook on a stream (`process.spawn`) returns what
 * `next(e)` returns, the command's own result, and only its `{ deny }` is special (test.md, "Follow
 * the test kit's rules").
 */
const VALUE_CALLS: ReadonlySet<string> = new Set(
  API_EVENT_NAMES.filter(
    (name) => !isEventAnswered(name) && !isEngineEvent(name) && !STREAMS.has(name),
  ),
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
  shapeProblem: (event, result, answered, input) =>
    apiEventRules.shapeProblem(event, result, answered, input) ??
    rules.shapeProblem(event, result, answered, input),
});
