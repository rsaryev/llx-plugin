import type { EventRule, EventRuleBook } from '../types.ts';
import { API_EVENT_NAMES, STREAM_EVENTS } from '../../protocol/mods-events.ts';
import { isEngineEvent, isEventAnswered } from './call.ts';
import { isRecord } from '../../protocol/is-record.ts';

const STREAMS: ReadonlySet<string> = new Set(STREAM_EVENTS);

/**
 * The calls answered by `{ value }` or `{ deny }` only: the mods API calls that no event of Claude
 * Code's has the name of, and that do not stream. A hook on a stream (`process.spawn`) returns what
 * `next(e)` returns, the command's own result, and only its `{ deny }` is special (test.md, "Follow
 * the test kit's rules").
 */
const VALUE_CALLS: readonly string[] = [
  ...API_EVENT_NAMES.filter(
    (name) => !isEventAnswered(name) && !isEngineEvent(name) && !STREAMS.has(name),
  ),
  // Claude Code fires `settings.read` too, but a hook on it answers like a call: "`next(e)`, `{ value }`, or `{ deny: reason }`" (reference.md).
  'settings.read',
];

const valueCall = (event: string): EventRule => ({
  shapeProblem: (result) =>
    isRecord(result) && (typeof result.deny === 'string' || 'value' in result)
      ? undefined
      : `${event} result: returned neither { value } nor { deny }`,
});

/**
 * The rules of the mods API calls (reference.md, "Mods API calls"): a hook on one "can return
 * `next(e)`, `{ deny: reason }`, or `{ value }`", so any other result fails the hook like a throw.
 */
export const API_RULES: EventRuleBook = Object.fromEntries(
  VALUE_CALLS.map((event): [string, EventRule] => [event, valueCall(event)]),
);
