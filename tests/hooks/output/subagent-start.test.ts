/**
 * hooks.md § "SubagentStart input" (the paragraph and table that follow the input example):
 * "SubagentStart hooks can't block subagent creation, but they can inject context into the
 * subagent", through `hookSpecificOutput.additionalContext`. The subagent that receives the
 * string and the compaction that discards it are the host's; what the kit does, and what is
 * proven, is that the field is accepted for SubagentStart only, carried to the subagent from every
 * hook, capped like the other context strings, and that no decision of the hook holds creation back.
 */
import { expect, test } from 'bun:test';
import { createOutputStage, parseHookOutput } from '../../../src/hooks/index.ts';
import { memoryScratch } from '../../support/ports.ts';
import { fire } from '../../support/hooks-fire.ts';
import { merged, specific, stage, taggedFrom } from '../../support/hooks-output.ts';
import { command, entry, FACTS } from '../../support/hooks-select.ts';
import { spec } from '../../support/spec.ts';
import { PREVIEW_LENGTH, TEXT_CAP } from '../../../src/hooks/output/text-cap.ts';

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

  test('a matcher on the agent type: the field travels from a real command hook through the engine for that type only', async () => {
    const reply = {
      exitCode: 0,
      stdout: JSON.stringify(inject('Prefer rg over grep')),
    };
    const hooks = [
      entry('SubagentStart', { matcher: 'Explore', handler: command('./explore.sh') }),
    ];
    const explore = await fire('SubagentStart', hooks, [reply], { output: stage });
    expect(explore.outcome.additionalContext).toEqual(['Prefer rg over grep']);
    const plan = await fire('SubagentStart', hooks, [reply], {
      output: stage,
      facts: { ...FACTS.SubagentStart, agent_type: 'Plan' },
    });
    expect(plan.outcome.additionalContext).toEqual([]);
  });

  test('"can\'t block subagent creation": a decision never blocks (block stays undefined, context still delivered)', () => {
    const outcome = merged('SubagentStart', [
      { decision: 'block', reason: 'no' },
      inject('still delivered'),
    ]);
    expect(outcome.block).toBeUndefined();
    expect(outcome.additionalContext).toEqual(['still delivered']);
  });

  test("the universal fields stay accepted: continue:false and stopReason are carried, creation is the host's to stop", () => {
    const outcome = merged('SubagentStart', [
      { continue: false, stopReason: 'halt' },
      inject('still delivered'),
    ]);
    expect(outcome.block).toBeUndefined();
    expect(outcome.continue).toBe(false);
    expect(outcome.stopReason).toBe('halt');
    expect(outcome.additionalContext).toEqual(['still delivered']);
  });

  test('a value that is not a string fails validation and names the field', () => {
    expect(parseHookOutput('SubagentStart', inject(5)).failure).toContain('additionalContext');
  });

  test('the field belongs to the event it names: another hookEventName is refused', () => {
    expect(
      parseHookOutput('SubagentStart', specific('SessionStart', { additionalContext: 'x' }))
        .failure,
    ).toContain('hookEventName');
  });

  test('a <system-reminder> tag has its < replaced by &lt; in the context the subagent gets', () => {
    const outcome = merged('SubagentStart', [
      inject('a <system-reminder>b</system-reminder>'),
      inject('</system-reminder> sneaky'),
    ]);
    expect(outcome.additionalContext).toEqual([
      'a &lt;system-reminder>b&lt;/system-reminder>',
      '&lt;/system-reminder> sneaky',
    ]);
  });

  test('each string is measured on its own: two hooks of 6,000 characters pass although they exceed the cap together', async () => {
    const scratch = memoryScratch('/session');
    const half = 'b'.repeat(6_000);
    const tagged = taggedFrom('SubagentStart', [inject(half), inject(half)]);
    const { outputs } = await createOutputStage({ scratch }).limit('SubagentStart', tagged, signal);
    expect(scratch.files.size).toBe(0);
    expect(outputs.map((item) => JSON.stringify(item.output))).toEqual([
      JSON.stringify(inject(half)),
      JSON.stringify(inject(half)),
    ]);
  });

  test('a string of exactly the cap passes untouched', async () => {
    const scratch = memoryScratch('/session');
    const text = 'a'.repeat(TEXT_CAP);
    const tagged = taggedFrom('SubagentStart', [inject(text)]);
    const { outputs } = await createOutputStage({ scratch }).limit('SubagentStart', tagged, signal);
    expect(scratch.files.size).toBe(0);
    expect(JSON.stringify(outputs[0]?.output)).toBe(JSON.stringify(inject(text)));
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
    expect(given).toContain('a'.repeat(PREVIEW_LENGTH));
    expect(given).not.toContain('a'.repeat(PREVIEW_LENGTH + 1));
  });
});
