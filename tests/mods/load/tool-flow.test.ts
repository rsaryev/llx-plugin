/** plugins/mods/events.md § When tool.check fires, Check whether a tool call is read-only,
 * Guard or change a tool call, Rewrite or add to a prompt; troubleshoot.md § a hook changed this
 * call's input after the model wrote it. The kit, not this test's core callback, orders the steps. */
import { expect, test } from 'bun:test';
import { runModToolCall, runModPromptSubmit } from '../../../src/mods/load/index.ts';
import { fn, record } from '../../support/mods-chain.ts';
import { openToolFlow } from '../../support/mods-tool-flow.ts';
import { spec } from '../../support/spec.ts';

spec(
  [
    'mods.events.Approve or refuse a tool call before the user is asked.When tool.check fires',
    'mods.events.Where settings hooks run in the order',
  ],
  () => {
    test('managed and ordinary hooks surround tool.call; tool.check finishes before review or prompt', async () => {
      for (const effect of ['classifier', 'PermissionRequest', 'prompt']) {
        const trace: string[] = [];
        const { flow } = await openToolFlow(trace, [
          fn('tool.call', (_$, e, next) => {
            trace.push('tool.call');
            return next(e);
          }),
          fn('tool.check', async (_$, e, next) => {
            trace.push('tool.check');
            const result = await next(e);
            trace.push('tool.check returned');
            return result;
          }),
        ]);
        await runModToolCall({
          ...flow,
          afterCheck: () => {
            trace.push(effect);
            return Promise.resolve({ decision: 'allow' });
          },
        });
        expect(trace).toEqual([
          'managed',
          'tool.call',
          'PreToolUse',
          'tool.check',
          'rules',
          'tool.check returned',
          effect,
          'execute',
        ]);
      }
    });

    test('a managed block runs no mod or other hook; a regular block never reaches tool.check', async () => {
      const trace: string[] = [];
      const { flow } = await openToolFlow(trace, [
        fn('tool.check', (_$, e, next) => {
          trace.push('check');
          return next(e);
        }),
      ]);
      expect(
        (
          await runModToolCall({
            ...flow,
            managed: () => Promise.resolve({ deny: 'managed block' }),
          })
        ).result,
      ).toEqual({ deny: 'managed block' });
      expect(trace).toEqual([]);
      expect(
        (
          await runModToolCall({
            ...flow,
            preToolUse: (call) => Promise.resolve({ call, deny: 'blocked' }),
          })
        ).result,
      ).toEqual({ deny: 'blocked' });
      expect(trace).toEqual(['managed']);
    });
  },
);

spec(
  'mods.events.Approve or refuse a tool call before the user is asked.What await next(e) gives you',
  () => {
    test('a denied check never prompts; next sees the rule decision before any prompt runs', async () => {
      const trace: string[] = [];
      const { flow } = await openToolFlow(trace, [
        fn('tool.check', async (_$, e, next) => {
          expect(await next(e)).toEqual({ decision: 'ask' });
          expect(trace).toEqual(['managed', 'PreToolUse', 'rules']);
          return { decision: 'deny', reason: 'no' };
        }),
      ]);
      const result = await runModToolCall({
        ...flow,
        afterCheck: (decision) => {
          trace.push('prompt');
          return Promise.resolve(decision);
        },
      });
      expect(result.result).toEqual({ deny: 'no' });
      expect(trace).not.toContain('prompt');
      expect(trace).not.toContain('execute');
    });
  },
);

spec('mods.events.Check whether a tool call is read-only', () => {
  test('the actual tool.check event gets true for a read-only call, absent otherwise', async () => {
    const seen: unknown[] = [];
    const { flow } = await openToolFlow(
      [],
      [
        fn('tool.check', (_$, e, next) => {
          seen.push(e);
          return next(e);
        }),
      ],
    );
    await runModToolCall(flow);
    await runModToolCall({ ...flow, readOnly: { ...flow.readOnly, bashCommand: () => false } });
    expect(seen).toEqual([
      { tool: 'Bash', input: { command: 'ls' }, isReadOnly: true },
      { tool: 'Bash', input: { command: 'ls' } },
    ]);
  });
});

spec(`mods.troubleshoot.a hook changed this call's input after the model wrote it`, () => {
  test('a tool.call or PreToolUse rewrite is refused before execution, without exposing hook identity', async () => {
    const { flow } = await openToolFlow(
      [],
      [fn('tool.call', (_$, e, next) => next({ ...e, command: 'changed' }))],
    );
    const result = await runModToolCall({ ...flow, review: { mode: 'auto', by: 'server' } });
    expect(record(result.result).deny).toContain(
      "a hook changed this call's input after the model wrote it",
    );
    expect(String(record(result.result).deny)).not.toContain('watcher');
    const pre = await openToolFlow([]);
    const rewritten = await runModToolCall({
      ...pre.flow,
      review: { mode: 'auto', by: 'server' },
      preToolUse: (call) => Promise.resolve({ call: { ...call, command: 'changed' } }),
    });
    expect(record(rewritten.result).deny).toContain('issue the call once more exactly as recorded');
  });

  test('a session-review repeat runs tool.call but drops its further rewrite', async () => {
    const seen: unknown[] = [];
    const { flow } = await openToolFlow(
      [],
      [
        fn('tool.call', (_$, e, next) => {
          seen.push(e);
          return next({ ...e, command: 'further' });
        }),
      ],
    );
    await runModToolCall({
      ...flow,
      call: { tool: 'Bash', command: 'first change' },
      review: { mode: 'auto', by: 'session', repeat: true },
      execute: (call) => {
        seen.push(call);
        return Promise.resolve({ stdout: 'ok' });
      },
    });
    expect(seen).toEqual([
      { tool: 'Bash', command: 'first change' },
      { tool: 'Bash', command: 'first change' },
    ]);
  });
});

test('a result withheld after execution supplies the model-facing note', async () => {
  const { flow } = await openToolFlow(
    [],
    [
      fn('tool.call', async (_$, e, next) => {
        await next(e);
        return { deny: 'withheld' };
      }),
    ],
  );
  expect((await runModToolCall(flow)).modelText).toBe(
    'Bash ran, and a plugin withheld its result: withheld',
  );
});

test('a dropped prompt restores its original text and supplies the user-facing notice', async () => {
  const { host } = await openToolFlow([], [fn('prompt.submit', () => ({ drop: 'not now' }))]);
  let calls = 0;
  const result = await runModPromptSubmit({
    host,
    text: 'original',
    submit: () => {
      calls += 1;
      return Promise.resolve({});
    },
  });
  expect(result).toEqual({
    result: { drop: 'not now' },
    restoredText: 'original',
    notice: 'Prompt dropped by a hook: not now',
  });
  expect(calls).toBe(0);
});
