/**
 * hooks.md § "PreCompact output": stdout as compaction instructions, cut at the cap with a marker;
 * and the input the scripts of the task and teammate sections read.
 */
import { describe, expect, test } from 'bun:test';
import { createOutputStage } from '../../../src/hooks/index.ts';
import type { HookEvent } from '../../../src/protocol/official.ts';
import { fire } from '../../support/hooks-fire.ts';
import { stage, viaEngine } from '../../support/hooks-output.ts';
import { command, entry, FACTS } from '../../support/hooks-select.ts';
import { memoryScratch, type RunnerReply } from '../../support/ports.ts';
import { spec } from '../../support/spec.ts';

/** One command hook of `event` whose script is `script`, fired with `facts`. */
/** Two hooks of `event` that differ in their command, so the engine does not run them once (hooks.md, "How a hook resolves"). */
const twoHooks = (event: HookEvent) => [
  entry(event, { handler: command('./one.sh') }),
  entry(event, { handler: command('./two.sh') }),
];

const runScript = <E extends HookEvent>(event: E, script: RunnerReply, facts: object) =>
  fire(event, [entry(event)], [script], {
    output: stage,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the facts are the event's own
    facts: facts as never,
  }).then(({ outcome }) => outcome);

/** The JSON a command hook reads on stdin. */
const inputOf = (run: { readonly stdin?: string }): Record<string, unknown> =>
  JSON.parse(run.stdin ?? '{}') as Record<string, unknown>;

spec('hooks.behavior.PreCompact output', () => {
  const stdoutOf = (text: string): RunnerReply => ({ exitCode: 0, stdout: text });

  test('when a hook exits 0 and does not block, its stdout is the instructions for the compaction summary', async () => {
    const outcome = await runScript(
      'PreCompact',
      stdoutOf('Keep the API notes verbatim.\n'),
      FACTS.PreCompact,
    );
    expect(outcome.effects.compactionInstructions).toEqual(['Keep the API notes verbatim.']);
    expect(outcome.proceed).toBe(true);
  });

  test('every hook that printed adds its own instructions', async () => {
    const { outcome } = await fire(
      'PreCompact',
      twoHooks('PreCompact'),
      [stdoutOf('one'), stdoutOf('two')],
      { output: stage },
    );
    expect(outcome.effects.compactionInstructions).toEqual(['one', 'two']);
  });

  test('a hook that blocks, by exit code 2 or by decision, gives no instructions', async () => {
    const byExit = await runScript(
      'PreCompact',
      { exitCode: 2, stdout: 'ignored', stderr: 'no' },
      FACTS.PreCompact,
    );
    expect(byExit.proceed).toBe(false);
    expect(byExit.effects.compactionInstructions).toBeUndefined();
    const byDecision = await viaEngine('PreCompact', [{ decision: 'block', reason: 'later' }]);
    expect(byDecision.proceed).toBe(false);
    expect(byDecision.effects.compactionInstructions).toBeUndefined();
  });

  test('a hook with no stdout adds none', async () => {
    expect(
      (await runScript('PreCompact', stdoutOf(''), FACTS.PreCompact)).effects
        .compactionInstructions,
    ).toBeUndefined();
  });

  test('stdout over 10,000 characters is cut at the cap with a marker, not saved to a file', async () => {
    const scratch = memoryScratch();
    const engineStage = createOutputStage({ scratch });
    const { outcome } = await fire(
      'PreCompact',
      [entry('PreCompact')],
      [stdoutOf('x'.repeat(12_000))],
      {
        output: engineStage,
      },
    );
    const [instructions] = outcome.effects.compactionInstructions ?? [];
    expect(instructions?.startsWith('x'.repeat(10_000))).toBe(true);
    expect(instructions?.length).toBeGreaterThan(10_000);
    expect(instructions?.length).toBeLessThan(10_100);
    expect(instructions?.slice(10_000)).not.toContain('x');
    expect(scratch.files).toEqual(new Map());
  });

  test('the cap is per hook: two hooks of 6,000 characters each are both kept whole', async () => {
    const { outcome } = await fire(
      'PreCompact',
      twoHooks('PreCompact'),
      [stdoutOf('a'.repeat(6_000)), stdoutOf('b'.repeat(6_000))],
      { output: stage },
    );
    expect(outcome.effects.compactionInstructions).toEqual(['a'.repeat(6_000), 'b'.repeat(6_000)]);
  });
});

describe('the examples of these sections receive the input the docs show', () => {
  test.each([
    ['TeammateIdle', { teammate_name: 'a', team_name: 'b' }],
    ['TaskCreated', { task_id: '1', task_subject: 's' }],
  ] as const)('%s', async (event, facts) => {
    let read: Record<string, unknown> = {};
    await runScript(
      event,
      (run) => {
        read = inputOf(run);
        return {};
      },
      facts,
    );
    expect(read).toMatchObject({ hook_event_name: event, ...facts });
  });
});
