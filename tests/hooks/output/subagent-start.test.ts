/**
 * hooks.md § "SubagentStart input" (the paragraph and table that follow the input example):
 * "SubagentStart hooks can't block subagent creation, but they can inject context into the
 * subagent", through `hookSpecificOutput.additionalContext`. The subagent that receives the
 * string and the compaction that discards it are the host's; what the kit does, and what is
 * proven, is that the field is accepted for SubagentStart only, carried to the subagent from every
 * hook, capped like the other context strings, and that no decision of the hook holds creation back.
 */
import { expect, test } from 'bun:test';
import { createOutputStage, parseHookOutput, TEXT_CAP } from '../../../src/hooks/index.ts';
import { memoryScratch } from '../../support/ports.ts';
import { merged, specific, taggedFrom, viaEngine } from '../../support/hooks-output.ts';
import { FACTS } from '../../support/hooks-select.ts';
import { spec } from '../../support/spec.ts';

const inject = (additionalContext: unknown) => specific('SubagentStart', { additionalContext });
const signal = new AbortController().signal;

spec('hooks.input.SubagentStart.additionalContext', () => {
  test('the doc example: the string is handed on to be added to the subagent', () => {
    const outcome = merged('SubagentStart', [inject('Follow security guidelines for this task')]);
    expect(outcome.additionalContext).toEqual(['Follow security guidelines for this task']);
  });

  test('every hook that returns a string contributes, in registry order', () => {
    const outcome = merged('SubagentStart', [
      inject('Follow the security guidelines'),
      {},
      inject('second'),
    ]);
    expect(outcome.additionalContext).toEqual(['Follow the security guidelines', 'second']);
  });

  test('a hook with no additionalContext adds nothing', () => {
    expect(merged('SubagentStart', [{}]).additionalContext).toEqual([]);
  });

  test('an Explore subagent: the field travels from a real command hook through the engine', async () => {
    const outcome = await viaEngine('SubagentStart', [inject('Prefer rg over grep')], {
      ...FACTS.SubagentStart,
      agent_type: 'Explore',
    });
    expect(outcome.additionalContext).toEqual(['Prefer rg over grep']);
  });

  test('"can\'t block subagent creation": decision, continue and exit-style stops are dropped', () => {
    const outcome = merged('SubagentStart', [
      { decision: 'block', reason: 'no' },
      { continue: false, stopReason: 'halt' },
      inject('still delivered'),
    ]);
    expect(outcome.block).toBeUndefined();
    expect(outcome.additionalContext).toEqual(['still delivered']);
  });

  test('a value that is not a string fails validation and names the field', () => {
    expect(parseHookOutput('SubagentStart', inject(5)).failure).toContain('additionalContext');
  });

  test('the field belongs to the event it names: another hookEventName is refused', () => {
    expect(
      parseHookOutput('SubagentStart', specific('SessionStart', { additionalContext: 'x' }))
        .failure,
    ).toBeDefined();
  });

  test('a string over the 10,000-character cap is saved to a file and the subagent gets a preview', async () => {
    const scratch = memoryScratch('/session');
    const text = 'a'.repeat(TEXT_CAP + 1);
    const tagged = taggedFrom('SubagentStart', [inject(text)]);
    const { outputs } = await createOutputStage({ scratch }).limit('SubagentStart', tagged, signal);
    expect(scratch.files.size).toBe(1);
    expect([...scratch.files.values()]).toEqual([text]);
    const kept = outputs[0]?.output;
    const given =
      kept !== undefined && 'hookSpecificOutput' in kept
        ? JSON.stringify(kept.hookSpecificOutput)
        : '';
    expect(given).not.toContain(text);
    expect(given).toContain('/session/');
  });
});
