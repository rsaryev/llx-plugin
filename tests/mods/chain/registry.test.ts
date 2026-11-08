/**
 * Registering hooks, matching events, and the order the chain runs in.
 * plugins/mods/events.md § Filter which events a hook handles (matchers, wildcards, "registered
 * twice without a matcher") and § The order mods run in; plugins/mods/reference.md § The hook
 * function. The docs give these behaviours without a requirement row of their own.
 */
import { describe, expect, test } from 'bun:test';
import {
  consume,
  fn,
  gen,
  harness,
  type FnHook,
  type HookOptions,
} from '../../support/mods-chain.ts';
import { CLASSIC_EVENT_NAMES } from '../../../src/protocol/mods-events.ts';

const seeing =
  (seen: unknown[]): FnHook =>
  (_$, e, next) => (seen.push(e.tool ?? e.name), next(e));

async function run(options: HookOptions, tools: string[]): Promise<unknown[]> {
  const h = harness();
  const seen: unknown[] = [];
  h.mod('my-mod', 'user', [fn('tool.call', seeing(seen), options)]);
  for (const tool of tools) await h.fire('tool.call', { tool });
  return seen;
}

describe('matchers (events.md § Filter which events a hook handles)', () => {
  const TOOLS = ['Bash', 'Edit', 'Write', 'Read', 'mcp__github__list', 'mcp__slack__post'];

  test('a string matches one value: Bash calls only', async () => {
    expect(await run({ matcher: { tool: 'Bash' } }, TOOLS)).toEqual(['Bash']);
  });
  test('an array matches any value in it', async () => {
    expect(await run({ matcher: { tool: ['Edit', 'Write'] } }, TOOLS)).toEqual(['Edit', 'Write']);
  });
  test('a regular expression matches by pattern, unanchored', async () => {
    expect(await run({ matcher: { tool: /^mcp__github__/ } }, TOOLS)).toEqual([
      'mcp__github__list',
    ]);
    expect(await run({ matcher: { tool: /ash/ } }, TOOLS)).toEqual(['Bash']);
  });
  test('the hook runs only when every field matches', async () => {
    const h = harness();
    const seen: unknown[] = [];
    h.mod('my-mod', 'user', [
      fn('tool.call', seeing(seen), { matcher: { tool: 'Bash', agent: 'main' } }),
    ]);
    await h.fire('tool.call', { tool: 'Bash', agent: 'sub' });
    await h.fire('tool.call', { tool: 'Bash' });
    await h.fire('tool.call', { tool: 'Bash', agent: 'main' });
    expect(seen).toHaveLength(1);
  });
  test('a serialised expression from a hooks module runtime is a regular expression too, and a number or boolean field matches itself', async () => {
    expect(
      await run({ matcher: { tool: { $regexp: '^Ed', flags: 'i' } } }, ['edit', 'Bash']),
    ).toEqual(['edit']);
    const h = harness();
    const seen: unknown[] = [];
    h.mod('my-mod', 'user', [fn('tool.call', seeing(seen), { matcher: { n: 2, ok: true } })]);
    await h.fire('tool.call', { n: 2, ok: true, name: 'yes' });
    await h.fire('tool.call', { n: '2', ok: true, name: 'no' });
    expect(seen).toEqual(['yes']);
  });
  test('a field set to undefined is not a filter (judgment)', async () => {
    expect(await run({ matcher: { tool: undefined } }, ['Bash', 'Edit'])).toEqual(['Bash', 'Edit']);
    expect(await run({ matcher: { tool: undefined, n: 1 } }, ['Bash'])).toEqual([]);
  });
  test('a global expression keeps no state between events', async () => {
    expect(await run({ matcher: { tool: /a/g } }, ['a', 'a', 'a'])).toEqual(['a', 'a', 'a']);
  });
  test('a malformed serialised expression is an issue, and nothing of the module loads', () => {
    const h = harness();
    const issues = h.mod('my-mod', 'user', [
      fn('tool.call', seeing([]), { matcher: { tool: { $regexp: '(' } } }),
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toContain('regular expression');
  });
});

describe('wildcards (events.md § Filter which events a hook handles)', () => {
  test("'classic.*' matches every settings hook event and nothing else", async () => {
    const h = harness();
    const seen: unknown[] = [];
    h.mod('my-mod', 'user', [fn('classic.*', seeing(seen))]);
    for (const event of CLASSIC_EVENT_NAMES) await h.fire(event, { name: event });
    await h.fire('tool.call', { name: 'tool.call' });
    expect(seen).toEqual([...CLASSIC_EVENT_NAMES]);
  });
  test("'*' matches every event except the telemetry events, mods API calls included", async () => {
    const h = harness();
    const seen: unknown[] = [];
    h.mod('my-mod', 'user', [fn('*', seeing(seen))]);
    for (const event of [
      'tool.call',
      'classic.Stop',
      'fs.read',
      'session.start',
      'telemetry.log',
    ]) {
      await h.fire(event, { name: event });
    }
    expect(seen).toEqual(['tool.call', 'classic.Stop', 'fs.read', 'session.start']);
  });
  test('a wildcard hook takes a matcher like any other', async () => {
    const h = harness();
    const seen: unknown[] = [];
    h.mod('my-mod', 'user', [fn('*', seeing(seen), { matcher: { tool: 'Bash' } })]);
    await h.fire('tool.call', { tool: 'Bash' });
    await h.fire('prompt.submit', { name: 'p' });
    expect(seen).toEqual(['Bash']);
  });
  test('an async function hook on * never sees a streaming event, and a generator never sees another (judgment)', async () => {
    const h = harness();
    const seen: string[] = [];
    h.mod('fn-hook', 'user', [fn('*', (_$, e, next) => (seen.push('fn'), next(e)))]);
    h.mod('gen-hook', 'user', [
      gen('*', async function* (_$, e, next) {
        seen.push('gen');
        return yield* next(e);
      }),
    ]);
    await h.fire('tool.call');
    await consume(h.fireStream('turn.step'));
    expect(seen).toEqual(['fn', 'gen']);
  });
});

describe('registering a module (events.md § Filter which events a hook handles)', () => {
  test('on called twice for one event with no matcher: on("session.start") is registered twice without a matcher, and the module is not loaded', async () => {
    const h = harness();
    const issues = h.mod('my-mod', 'user', [
      fn('session.start', (_$, e, next) => next(e)),
      fn('tool.call', (_$, e, next) => next(e)),
      fn('session.start', (_$, e, next) => next(e)),
    ]);
    expect(issues.map((issue) => issue.message)).toEqual([
      'on("session.start") is registered twice without a matcher',
    ]);
    expect(issues[0]?.severity).toBe('error');
    expect(issues[0]?.path).toBe('hooks:session.start'); // judgment: the path names the event
    await h.fire('tool.call');
    expect(h.coreSeen).toHaveLength(1);
    expect(h.reports).toEqual([]);
  });
  test('one event once per matcher is fine, and so is one no-matcher hook beside matcher hooks', () => {
    const h = harness();
    expect(
      h.mod('my-mod', 'user', [
        fn('tool.call', (_$, e, next) => next(e), { matcher: { tool: 'Bash' } }),
        fn('tool.call', (_$, e, next) => next(e), { matcher: { tool: 'Edit' } }),
        fn('tool.call', (_$, e, next) => next(e)),
      ]),
    ).toEqual([]);
  });
  test('two mods may each register one hook for an event', () => {
    const h = harness();
    const hook = fn('session.start', (_$, e, next) => next(e));
    expect(h.mod('a', 'user', [hook])).toEqual([]);
    expect(h.mod('b', 'user', [hook])).toEqual([]);
  });
  test('a hook of the wrong form for its event is refused: an async generator on turn.step, an async function elsewhere (judgment)', () => {
    const h = harness();
    expect(h.mod('a', 'user', [fn('turn.step', (_$, e, next) => next(e))])[0]?.message).toBe(
      'on("turn.step") takes an async generator hook',
    );
    expect(
      h.mod('b', 'user', [
        gen('tool.call', async function* (_$, e, next) {
          return yield* next(e);
        }),
      ])[0]?.message,
    ).toBe('on("tool.call") takes an async function hook');
  });
  test('registering a mod again replaces its earlier hooks, and unregister removes them (judgment)', async () => {
    const h = harness();
    const seen: string[] = [];
    h.mod('my-mod', 'user', [fn('tool.call', (_$, e, next) => (seen.push('old'), next(e)))]);
    h.mod('my-mod', 'user', [fn('tool.call', (_$, e, next) => (seen.push('new'), next(e)))]);
    await h.fire('tool.call');
    h.chain.unregister('my-mod');
    await h.fire('tool.call');
    expect(seen).toEqual(['new']);
  });
});

describe('the order mods run in (events.md § The order mods run in)', () => {
  test('by tier: prepend, user, append, builtin, then Claude Code, whatever order they were registered in', async () => {
    const h = harness();
    const ran: string[] = [];
    for (const tier of ['builtin', 'append', 'user', 'prepend'] as const) {
      h.mod(`${tier}-mod`, tier, [fn('tool.call', (_$, e, next) => (ran.push(tier), next(e)))]);
    }
    await h.fire('tool.call', {}, { core: () => (ran.push('core'), Promise.resolve(0)) });
    expect(ran).toEqual(['prepend', 'user', 'append', 'builtin', 'core']);
  });
  test('the built-in guard sec-default@builtin is registered first in the prepend tier, so it runs before every other mod (judgment)', async () => {
    const h = harness();
    const ran: string[] = [];
    const hook = (label: string) => fn('tool.call', (_$, e, next) => (ran.push(label), next(e)));
    h.mod('sec-default@builtin', 'prepend', [hook('guard')]);
    h.mod('org-prepend', 'prepend', [hook('prepend')]);
    h.mod('installed', 'user', [hook('user')]);
    h.mod('org-append', 'append', [hook('append')]);
    h.mod('other-builtin', 'builtin', [hook('builtin')]);
    await h.fire('tool.call');
    expect(ran).toEqual(['guard', 'prepend', 'user', 'append', 'builtin']);
  });
  test('within a tier, in the order the mods were registered, and within one module in the order on was called', async () => {
    const h = harness();
    const ran: string[] = [];
    const hook = (label: string) =>
      fn('tool.call', (_$, e, next) => (ran.push(label), next(e)), { matcher: { n: 1 } });
    h.mod('one', 'user', [hook('one-a'), hook('one-b')]);
    h.mod('two', 'user', [hook('two-a')]);
    await h.fire('tool.call', { n: 1 });
    expect(ran).toEqual(['one-a', 'one-b', 'two-a']);
  });
  test('the matcher is tested against the event as it reaches the hook, after earlier hooks changed it', async () => {
    const h = harness();
    const ran: string[] = [];
    h.mod('rewriter', 'user', [fn('tool.call', (_$, e, next) => next({ ...e, tool: 'Edit' }))]);
    h.mod('edit-only', 'user', [
      fn('tool.call', (_$, e, next) => (ran.push('edit'), next(e)), { matcher: { tool: 'Edit' } }),
    ]);
    await h.fire('tool.call', { tool: 'Bash' });
    expect(ran).toEqual(['edit']);
  });
});
