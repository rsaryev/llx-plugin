/**
 * hooks.md, the matcher table of each event section (SessionStart, Setup, Notification, PreCompact,
 * PostCompact, ConfigChange, DirectoryAdded): the values a matcher can name. One
 * `spec(hooks.matcherValue.<Event>.<value>)` per documented value: a hook whose matcher is that
 * value runs when the event carries it, and does not run for any other documented value.
 */
import { describe, expect, test } from 'bun:test';
import { MATCHER_VALUES } from '../../../src/hooks/select/matcher-values.ts';
import type { HookEvent } from '../../../src/protocol/official.ts';
import { factSchemaOf } from '../../../src/hooks/input/facts.ts';
import { requirementKeys } from '../../support/requirements.ts';
import { spec } from '../../support/spec.ts';
import { entry, FACTS, select } from '../../support/hooks-select.ts';

/** The field that carries the value, in each event's "input" table of hooks.md. */
const FIELD = {
  SessionStart: 'source',
  Setup: 'trigger',
  Notification: 'notification_type',
  PreCompact: 'trigger',
  PostCompact: 'trigger',
  ConfigChange: 'source',
  DirectoryAdded: 'source',
} as const satisfies Partial<Record<HookEvent, string>>;
type ValuedEvent = keyof typeof FIELD;
/** Events whose field is an open string (a plugin raises its own notification types), not an enum. */
const OPEN_FIELD: readonly string[] = ['Notification'];
const isValued = (event: string): event is ValuedEvent => event in FIELD;

/** The documented values, read from the ids `hooks.matcherValue.<Event>.<value>` of the requirements, never from a copy. */
const DOCUMENTED = Object.fromEntries(
  Object.keys(FIELD).map((event) => [event, requirementKeys(`hooks.matcherValue.${event}.`)]),
);
const documented = (event: ValuedEvent): readonly string[] => DOCUMENTED[event] ?? [];

/** The events whose table lists `value`: the only ones whose facts may carry it. */
const eventsWith = (value: string): ValuedEvent[] =>
  Object.keys(FIELD)
    .filter(isValued)
    .filter((event) => documented(event).includes(value));

const baseFacts = (event: ValuedEvent) => FACTS[event];

/** The facts of `event` with `value` in the field its input table names. */
const carrying = (event: ValuedEvent, value: string): unknown => ({
  ...baseFacts(event),
  [FIELD[event]]: value,
});

const accepts = (event: ValuedEvent, value: string): boolean =>
  factSchemaOf(event).safeParse(carrying(event, value)).success;

const runs = (event: ValuedEvent, matcher: string, facts: unknown): boolean => {
  const parsed = factSchemaOf(event).safeParse(facts);
  return (
    parsed.success && select([entry(event, { matcher })], event, parsed.data).selected.length === 1
  );
};

/** One spec block per documented value, each asserting what that value means for its event. */
for (const [event, values] of Object.entries(DOCUMENTED)) {
  if (!isValued(event)) continue;
  for (const value of values) {
    spec(`hooks.matcherValue.${event}.${value}`, () => {
      test(`${value} is a value of the ${FIELD[event]} field of ${event}`, () => {
        expect(accepts(event, value)).toBe(true);
        if (OPEN_FIELD.includes(event)) return;
        expect(accepts(event, `${value}_`)).toBe(false);
        expect(accepts(event, value.toUpperCase())).toBe(false);
      });

      test(`only the events whose table lists ${value} carry it: ${eventsWith(value).join(', ')}`, () => {
        for (const other of Object.keys(FIELD).filter(isValued)) {
          if (OPEN_FIELD.includes(other)) continue;
          expect(accepts(other, value), `${value} on ${other}`).toBe(
            eventsWith(value).includes(other),
          );
        }
      });

      test('a hook with this matcher runs when the event carries the value, and not for another documented value', () => {
        expect(runs(event, value, carrying(event, value))).toBe(true);
        for (const other of values.filter((each) => each !== value)) {
          expect(runs(event, value, carrying(event, other)), other).toBe(false);
        }
      });
    });
  }
}

describe('the kit lists the documented values', () => {
  test('MATCHER_VALUES holds the documented values of each event', () => {
    for (const event of Object.keys(FIELD).filter(isValued)) {
      expect(MATCHER_VALUES[event].map(String).toSorted()).toEqual(
        [...documented(event)].toSorted(),
      );
    }
  });

  test('SessionEnd lists its reasons without the removed bypass_permissions_disabled', () => {
    expect([...MATCHER_VALUES.SessionEnd]).toEqual([
      'clear',
      'resume',
      'logout',
      'prompt_input_exit',
      'other',
    ]);
  });

  test('InstructionsLoaded and StopFailure list the values of their tables', () => {
    expect([...MATCHER_VALUES.InstructionsLoaded]).toEqual([
      'session_start',
      'nested_traversal',
      'path_glob_match',
      'include',
      'compact',
    ]);
    expect(MATCHER_VALUES.StopFailure).toContain('cloud_credential_error');
  });
});
