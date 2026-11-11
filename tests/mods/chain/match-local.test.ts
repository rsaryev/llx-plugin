/**
 * `matchesEvent(matcher, e)`: a hook's matcher tested in this thread, the rule of events.md ("Filter
 * which events a hook handles") as the chain applies it, for a runtime in an isolate. A field is a
 * value, a list of allowed values, or a regular expression (`/x/` or `{ $regexp, flags }`).
 */
import { describe, expect, test } from 'bun:test';
import { isHookBody, matchesEvent } from '../../../src/entry/mod-isolate.ts';

describe('matchesEvent', () => {
  test('no matcher, or none with a field, passes every event', () => {
    expect(matchesEvent(undefined, { tool: 'Bash' })).toBe(true);
    expect(matchesEvent({ tool: undefined }, { tool: 'Bash' })).toBe(true);
  });

  test('every field must let the event through: a value, a list, a RegExp', () => {
    expect(matchesEvent({ tool: 'Bash' }, { tool: 'Bash' })).toBe(true);
    expect(matchesEvent({ tool: ['Read', 'Bash'] }, { tool: 'Bash' })).toBe(true);
    expect(matchesEvent({ tool: /^Ba/ }, { tool: 'Bash' })).toBe(true);
    expect(matchesEvent({ tool: { $regexp: '^ba', flags: 'i' } }, { tool: 'Bash' })).toBe(true);
    expect(matchesEvent({ tool: 'Bash', agentId: 'a' }, { tool: 'Bash' })).toBe(false);
    expect(matchesEvent({ tool: /x/ }, { tool: 3 })).toBe(false);
  });

  test('a field whose expression does not compile passes nothing', () => {
    expect(matchesEvent({ tool: { $regexp: '(' } }, { tool: '(' })).toBe(false);
  });
});

test('isHookBody tells a streaming body from any other answer', () => {
  async function* body() {
    yield 1;
  }
  expect(isHookBody(body())).toBe(true);
  expect(isHookBody(Promise.resolve())).toBe(false);
  expect(isHookBody({ next: 1 })).toBe(false);
});
