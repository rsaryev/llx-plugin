/** plugins/mods/events.md § Guard or change a tool call; troubleshoot.md § a hook changed this call's input after the model wrote it. */
import { expect, test } from 'bun:test';
import { runModToolCall } from '../../../src/mods/load/index.ts';
import { consume, fn, gen, record } from '../../support/mods-chain.ts';
import { eventHarness } from '../../support/mods-events.ts';
import { openToolFlow } from '../../support/mods-tool-flow.ts';
import { spec } from '../../support/spec.ts';

spec(`mods.troubleshoot.a hook changed this call's input after the model wrote it`, () => {
  test('a turn.step tool frame rewrite is compared with what the model originally wrote', async () => {
    const h = eventHarness();
    const original = { tool: 'Bash', command: 'ls' };
    h.mod('frame-rewriter', 'user', [
      gen('turn.step', async function* (_$, e, next) {
        const downstream = next(e);
        for (;;) {
          const frame = await downstream.next();
          if (frame.done) return frame.value;
          yield { ...record(frame.value), command: 'changed' };
        }
      }),
    ]);
    const { chunks } = await consume(
      h.fireStream(
        'turn.step',
        { turnId: 'turn-1' },
        {
          core: async function* () {
            yield original;
            return {};
          },
        },
      ),
    );
    const changed = record(chunks[0]);
    expect(changed).toEqual({ tool: 'Bash', command: 'changed' });
    if (typeof changed.tool !== 'string') throw new Error('the frame lost its tool');
    const trace: string[] = [];
    const { flow } = await openToolFlow(trace);
    const result = await runModToolCall({
      ...flow,
      call: { ...changed, tool: changed.tool },
      review: { mode: 'auto', by: 'server', written: original },
    });
    expect(record(result.result).deny).toContain(
      "a hook changed this call's input after the model wrote it",
    );
    expect(trace).not.toContain('execute');
  });
});

test('a decisive tool.check result skips all classifier, PermissionRequest and prompt effects', async () => {
  for (const decision of ['allow', 'deny'] as const) {
    const trace: string[] = [];
    const { flow } = await openToolFlow(trace, [fn('tool.check', () => ({ decision }))]);
    const result = await runModToolCall({
      ...flow,
      afterCheck: () => {
        throw new Error('a decisive result must not review or prompt');
      },
    });
    expect(result.result).toEqual(
      decision === 'allow' ? { stdout: 'ok' } : { deny: 'Permission was not granted' },
    );
  }
});

test('withholding a failed tool result never claims that the tool succeeded', async () => {
  const { flow } = await openToolFlow(
    [],
    [
      fn('tool.call', async (_$, e, next) => {
        await next(e);
        return { deny: 'withheld' };
      }),
    ],
  );
  const result = await runModToolCall({
    ...flow,
    execute: () => Promise.resolve({ isError: true, result: 'failed' }),
  });
  expect(result.modelText).toBe('withheld');
});
