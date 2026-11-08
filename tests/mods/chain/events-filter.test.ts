/**
 * plugins/mods/events.md § Filter which events a hook handles and § Filter a `tool.check` hook by
 * whether the call is read-only. Each test is the docs' own example.
 */
import { expect, test } from 'bun:test';
import { createEventRules } from '../../../src/mods/events/index.ts';
import { fn, harness, type Ev } from '../../support/mods-chain.ts';
import { spec } from '../../support/spec.ts';

const typed = () => harness(undefined, createEventRules());

spec('mods.events.Filter which events a hook handles', () => {
  /** The documented example: the same function registered three times, each for a narrower set of tools. */
  async function callsSeen(tools: readonly string[]): Promise<string[]> {
    const h = typed();
    const seen: string[] = [];
    const hook = (_$: unknown, e: Ev, next: (e: Ev) => Promise<unknown>) => {
      seen.push(String(e.tool));
      return next(e);
    };
    h.mod('my-mod', 'user', [
      fn('tool.call', hook, { matcher: { tool: 'Bash' } }),
      fn('tool.call', hook, { matcher: { tool: ['Edit', 'Write'] } }),
      fn('tool.call', hook, { matcher: { tool: /^mcp__github__/ } }),
    ]);
    for (const tool of tools) await h.fire('tool.call', { tool, input: {} });
    return seen;
  }

  test('hook runs once for a Bash, Edit or Write call and once for a tool whose name starts with mcp__github__; a Read call matches none of the three', async () => {
    const seen = await callsSeen([
      'Bash',
      'Edit',
      'Write',
      'Read',
      'mcp__github__issues',
      'mcp__slack__post',
    ]);
    expect(seen).toEqual(['Bash', 'Edit', 'Write', 'mcp__github__issues']);
  });

  test('the hook runs only when every field matches', async () => {
    const h = typed();
    const seen: unknown[] = [];
    h.mod('my-mod', 'user', [
      fn('tool.call', (_$, e, next) => (seen.push(e.tool), next(e)), {
        matcher: { tool: 'Bash', isReadOnly: true },
      }),
    ]);
    await h.fire('tool.call', { tool: 'Bash', input: {} });
    await h.fire('tool.call', { tool: 'Edit', input: {} });
    expect(seen).toEqual([]);
  });

  test("'classic.*' matches every settings hook event and '*' every event except the telemetry events", async () => {
    const h = typed();
    const seen: string[] = [];
    h.mod('wild', 'user', [
      fn('classic.*', (_$, e, next) => (seen.push(`classic.* ${String(e.name)}`), next(e))),
      fn('*', (_$, e, next) => (seen.push(`* ${String(e.name)}`), next(e))),
    ]);
    for (const name of [
      'classic.PreToolUse',
      'tool.call',
      'session.start',
      'telemetry.log',
      'telemetry.mark',
    ])
      await h.fire(name, { name });
    expect(seen).toEqual([
      'classic.* classic.PreToolUse',
      '* classic.PreToolUse',
      '* tool.call',
      '* session.start',
    ]);
  });

  test('a telemetry event takes its own name and a { to: "collector" } filter', () => {
    const h = typed();
    const plain = h.mod('wild', 'user', [fn('telemetry.log', (_$, e, next) => next(e))]);
    expect(plain.map((issue) => issue.message)).toEqual([
      'on("telemetry.log") needs the filter { to: \'collector\' }, so it can be told from a hook on every event',
    ]);
    expect(
      h.mod('wild', 'user', [
        fn('telemetry.log', (_$, e, next) => next(e), { matcher: { to: 'collector' } }),
      ]),
    ).toEqual([]);
  });

  test('registering an event twice with no matcher fails the module with the documented message; one hook per matcher is fine', () => {
    const h = typed();
    const hook = fn('session.start', (_$, e, next) => next(e));
    expect(h.mod('twice', 'user', [hook, hook]).map((issue) => issue.message)).toEqual([
      'on("session.start") is registered twice without a matcher',
    ]);
    expect(
      h.mod('narrow', 'user', [
        fn('tool.call', (_$, e, next) => next(e), { matcher: { tool: 'Bash' } }),
        fn('tool.call', (_$, e, next) => next(e), { matcher: { tool: 'Edit' } }),
      ]),
    ).toEqual([]);
  });
});

spec('mods.events.Filter a tool.check hook by whether the call is read-only', () => {
  const hook = (seen: unknown[]) => (_$: unknown, e: Ev, next: (e: Ev) => Promise<unknown>) => {
    seen.push(e.tool);
    return next(e);
  };

  test('isReadOnly: true in the matcher limits the hook to read-only calls', async () => {
    const h = typed();
    const seen: unknown[] = [];
    h.mod('my-mod', 'user', [
      fn('tool.check', hook(seen), { matcher: { tool: 'Bash', isReadOnly: true } }),
    ]);
    await h.fire('tool.check', { tool: 'Bash', input: { command: 'ls' }, isReadOnly: true });
    await h.fire('tool.check', { tool: 'Bash', input: { command: 'rm x' } });
    expect(seen).toEqual(['Bash']);
  });

  test('isReadOnly: false in a matcher never runs: the field is `true` or absent, not `false`', async () => {
    const h = typed();
    const seen: unknown[] = [];
    h.mod('my-mod', 'user', [fn('tool.check', hook(seen), { matcher: { isReadOnly: false } })]);
    await h.fire('tool.check', { tool: 'Bash', input: { command: 'ls' }, isReadOnly: true });
    await h.fire('tool.check', { tool: 'Bash', input: { command: 'rm x' } });
    expect(seen).toEqual([]);
  });

  test('for calls that are not read-only, the hook body tests e.isReadOnly: the docs mcp__github__ example asks for those only', async () => {
    const h = typed();
    h.mod('my-mod', 'user', [
      fn(
        'tool.check',
        async (_$, e, next) => {
          const decided = (await next(e)) as { decision?: string };
          if (e.isReadOnly || decided.decision === 'deny') return decided;
          return { decision: 'ask', reason: 'This tool can change the GitHub repository' };
        },
        { matcher: { tool: /^mcp__github__/ } },
      ),
    ]);
    const check = (event: Ev, decision: string) =>
      h.fire('tool.check', event, { core: () => Promise.resolve({ decision }) });
    expect(
      await check({ tool: 'mcp__github__list', input: {}, isReadOnly: true }, 'allow'),
    ).toEqual({
      decision: 'allow',
    });
    expect(await check({ tool: 'mcp__github__merge', input: {} }, 'allow')).toEqual({
      decision: 'ask',
      reason: 'This tool can change the GitHub repository',
    });
    expect(await check({ tool: 'mcp__github__merge', input: {} }, 'deny')).toEqual({
      decision: 'deny',
    });
  });
});
