/**
 * The matcher engine port (docs/API.md, "Mods"). events.md § Filter which events a hook handles
 * says a field "can be a value, an array of allowed values, or a regular expression"; it does not
 * say where the expression runs or what a test that never ends means. A pattern a mod's author
 * wrote, such as `/^(a+)+$/`, can run for ever on the thread that serves the session, so a host
 * may hand the kit an engine that runs it elsewhere. Everything here is a judgment
 * (spec/judgments.md), tested outside `spec(...)`: a test that the engine refused or did not answer
 * is no match, and the hook is skipped with a line.
 */
import { describe, expect, test } from 'bun:test';
import type { MatcherEngine, MatcherPattern } from '../../../src/mods/ports.ts';
import { fn, flush, harness, type Ev } from '../../support/mods-chain.ts';

interface Call {
  readonly source: string;
  readonly flags: string;
  readonly value: string;
  readonly ms: number;
  readonly signal: AbortSignal;
}

/** An engine that records what it is asked and answers through `answer`, which may never return. */
function fakeEngine(answer: (call: Call) => boolean | Promise<boolean>) {
  const compiled: { source: string; flags: string }[] = [];
  const calls: Call[] = [];
  const engine: MatcherEngine = {
    compile(source, flags) {
      if (source === '(') throw new SyntaxError('Unterminated group');
      compiled.push({ source, flags });
      const pattern: MatcherPattern = {
        test(value, limit) {
          const call = { source, flags, value, ...limit };
          calls.push(call);
          return answer(call);
        },
      };
      return pattern;
    },
  };
  return { engine, compiled, calls };
}

const REDOS = /^(a+)+$/;
const NEVER = (): Promise<boolean> => new Promise<boolean>(() => undefined);

const seeing = (seen: unknown[]) => (_$: unknown, e: Ev, next: (e: Ev) => Promise<unknown>) => {
  seen.push(e.tool);
  return next(e);
};

describe('a regular expression of a matcher runs in the host engine when there is one', () => {
  test('the engine answers, not this thread: a pattern the engine says matches does, whatever RegExp says', async () => {
    const { engine, compiled, calls } = fakeEngine(({ source }) => source === 'anything');
    const h = harness(undefined, {}, { matcherEngine: engine });
    const seen: unknown[] = [];
    h.mod('my-mod', 'user', [fn('tool.call', seeing(seen), { matcher: { tool: /anything/ } })]);
    await h.fire('tool.call', { tool: 'Read' });
    expect(seen).toEqual(['Read']);
    expect(compiled).toEqual([{ source: 'anything', flags: '' }]);
    expect(calls.map((call) => call.value)).toEqual(['Read']);
  });

  test('a serialised expression reaches the engine with its flags, minus g and y', async () => {
    const { engine, compiled } = fakeEngine(() => true);
    const h = harness(undefined, {}, { matcherEngine: engine });
    h.mod('my-mod', 'user', [
      fn('tool.call', seeing([]), { matcher: { tool: { $regexp: '^Ed', flags: 'gimy' } } }),
    ]);
    expect(compiled).toEqual([{ source: '^Ed', flags: 'im' }]);
  });

  test('values and lists of values are compared here and never reach the engine; a field that is not a string does not either', async () => {
    const { engine, calls } = fakeEngine(() => true);
    const h = harness(undefined, {}, { matcherEngine: engine });
    const seen: unknown[] = [];
    h.mod('my-mod', 'user', [
      fn('tool.call', seeing(seen), { matcher: { tool: ['Bash', 'Edit'], turn: /1/ } }),
    ]);
    await h.fire('tool.call', { tool: 'Bash', turn: 1 });
    await h.fire('tool.call', { tool: 'Edit', turn: '1' });
    await h.fire('tool.call', { tool: 'Read', turn: '1' });
    expect(seen).toEqual(['Edit']);
    expect(calls.map((call) => call.value)).toEqual(['1']);
  });

  test('the engine is given the time the chain allows and an abort signal', async () => {
    const { engine, calls } = fakeEngine(() => true);
    const h = harness(undefined, {}, { matcherEngine: engine, matcherMs: 25 });
    h.mod('my-mod', 'user', [fn('tool.call', seeing([]), { matcher: { tool: /B/ } })]);
    await h.fire('tool.call', { tool: 'Bash' });
    expect(calls.map((call) => [call.ms, call.signal.aborted])).toEqual([[25, false]]);
  });

  test('an expression the engine refuses to compile refuses the module, with the message every invalid expression has', () => {
    const { engine } = fakeEngine(() => true);
    const h = harness(undefined, {}, { matcherEngine: engine });
    const issues = h.mod('my-mod', 'user', [
      fn('tool.call', seeing([]), { matcher: { tool: { $regexp: '(' } } }),
    ]);
    expect(issues.map((issue) => issue.message)).toEqual([
      'on("tool.call"): matcher field "tool" is not a valid regular expression: Unterminated group',
    ]);
  });
});

describe('a test the engine does not answer', () => {
  test('a ReDoS pattern against an engine that never answers is no match after the limit, the hook is skipped with a line, and the chain goes on', async () => {
    const { engine, calls } = fakeEngine(NEVER);
    const h = harness(undefined, {}, { matcherEngine: engine });
    const seen: unknown[] = [];
    h.mod('rogue', 'user', [
      fn('tool.call', seeing(seen), { matcher: { tool: { $regexp: REDOS.source } } }),
    ]);
    h.mod('other', 'user', [fn('tool.call', seeing(seen))]);
    const fired = h.fire('tool.call', { tool: `${'a'.repeat(40)}!` });
    await flush();
    expect(seen).toEqual([]);
    h.clock.advance(100);
    expect(await fired).toEqual({ core: { tool: `${'a'.repeat(40)}!` } });
    expect(seen).toEqual([`${'a'.repeat(40)}!`]);
    expect(h.reports.map(({ line, kind }) => [line, kind])).toEqual([
      [
        'rogue: tool.call hook skipped: the matcher for "tool" ran over its 100 ms limit',
        'timeout',
      ],
    ]);
    expect(calls[0]?.signal.aborted).toBe(true);
  });

  test('the limit is the one given, and the budget is not spent while the engine still has time', async () => {
    const { engine } = fakeEngine(NEVER);
    const h = harness(undefined, {}, { matcherEngine: engine, matcherMs: 40 });
    h.mod('rogue', 'user', [fn('tool.call', seeing([]), { matcher: { tool: /a/ } })]);
    const fired = h.fire('tool.call', { tool: 'a' });
    await flush();
    h.clock.advance(39);
    await flush();
    expect(h.reports).toEqual([]);
    h.clock.advance(1);
    await fired;
    expect(h.reports.map((report) => report.reason)).toEqual([
      'the matcher for "tool" ran over its 40 ms limit',
    ]);
  });

  test('an engine that throws or rejects refuses the test: no match, skipped, the engine message in the line', async () => {
    const throwing = fakeEngine(() => {
      throw new Error('the isolate is gone');
    });
    const rejecting = fakeEngine(() => Promise.reject(new Error('worker crashed')));
    for (const [engine, message] of [
      [throwing.engine, 'the isolate is gone'],
      [rejecting.engine, 'worker crashed'],
    ] as const) {
      const h = harness(undefined, {}, { matcherEngine: engine });
      const seen: unknown[] = [];
      h.mod('rogue', 'user', [fn('tool.call', seeing(seen), { matcher: { tool: /a/ } })]);
      await h.fire('tool.call', { tool: 'a' });
      expect(seen).toEqual([]);
      expect(h.reports.map(({ line, kind }) => [line, kind])).toEqual([
        [
          `rogue: tool.call hook skipped: the matcher for "tool" was refused by the engine: ${message}`,
          'throw',
        ],
      ]);
    }
  });

  test('among allowed values, one that was not answered counts as no and another can still match', async () => {
    const { engine } = fakeEngine(({ source }) =>
      source === 'slow' ? NEVER() : source === 'Bash',
    );
    const h = harness(undefined, {}, { matcherEngine: engine });
    const seen: unknown[] = [];
    h.mod('my-mod', 'user', [
      fn('tool.call', seeing(seen), { matcher: { tool: [/slow/, /Bash/] } }),
    ]);
    const fired = h.fire('tool.call', { tool: 'Bash' });
    await flush();
    h.clock.advance(100);
    await fired;
    expect(seen).toEqual(['Bash']);
    // the hook ran, so no hook was skipped and there is nothing to report
    expect(h.reports).toEqual([]);
  });

  test('every field is tested in turn: a later field is not asked once an earlier one said no', async () => {
    const { engine, calls } = fakeEngine(() => false);
    const h = harness(undefined, {}, { matcherEngine: engine });
    h.mod('my-mod', 'user', [fn('tool.call', seeing([]), { matcher: { agent: /x/, tool: /y/ } })]);
    await h.fire('tool.call', { agent: 'x', tool: 'y' });
    expect(calls.map((call) => call.source)).toEqual(['x']);
  });

  test('the event being abandoned reaches the engine through its signal', async () => {
    const { engine, calls } = fakeEngine(NEVER);
    const h = harness(undefined, {}, { matcherEngine: engine });
    h.mod('my-mod', 'user', [fn('tool.call', seeing([]), { matcher: { tool: /a/ } })]);
    const abandon = new AbortController();
    const fired = h.fire('tool.call', { tool: 'a' }, { signal: abandon.signal });
    await flush();
    abandon.abort(new Error('interrupted'));
    expect(calls[0]?.signal.aborted).toBe(true);
    h.clock.advance(100);
    await fired;
  });
});

describe('with no engine', () => {
  test('a regular expression is tested in this thread, as before', async () => {
    const h = harness();
    const seen: unknown[] = [];
    h.mod('my-mod', 'user', [fn('tool.call', seeing(seen), { matcher: { tool: /^mcp__/ } })]);
    await h.fire('tool.call', { tool: 'mcp__github__list' });
    await h.fire('tool.call', { tool: 'Bash' });
    expect(seen).toEqual(['mcp__github__list']);
    expect(h.reports).toEqual([]);
  });
});
