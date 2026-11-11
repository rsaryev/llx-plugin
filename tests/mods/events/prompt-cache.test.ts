/**
 * Sending a changed system prompt section or tool description.
 * plugins/mods/reference.md § Send a changed system prompt section or tool description with
 * `breakPromptCache` ("call `$.ui.invalidate('prompt.section')` or `$.ui.invalidate('tool.describe')`
 * so your hook runs again. Return `{ text, breakPromptCache: true }` or `{ description,
 * breakPromptCache: true }` from it. Without the field, Claude keeps reading the text saved with the
 * conversation for a section or a tool loaded upfront until a new conversation or a compaction";
 * "The changed text reaches Claude on the next turn, and the prompt cache starts over"), and the
 * `prompt.section` and `tool.describe` rows of § Prompts and what Claude reads and § Tools. When the
 * host fires the hooks again and sends the turn is the host's: the kit proves that the call asks the
 * host to run them, that the answers carry the field, and what Claude reads on the next turn.
 */
import { describe, expect, test } from 'bun:test';
import { nextTurnText } from '../../../src/mods/events/index.ts';
import { uiRules } from '../../../src/mods/ui/index.ts';
import { apiHarness } from '../../support/mods-api.ts';
import { flush, fn } from '../../support/mods-chain.ts';
import { eventHarness, reasonsOf } from '../../support/mods-events.ts';
import { fakeInterface, uiOver } from '../../support/mods-ui.ts';
import { spec } from '../../support/spec.ts';

const ID =
  'mods.reference.Send a changed system prompt section or tool description with breakPromptCache';

/** Fires `event` with a hook that answers `answer`; the result and whether the hook was skipped. */
async function answered(event: string, input: Record<string, unknown>, answer: unknown) {
  const h = eventHarness();
  h.mod('my-mod', 'user', [fn(event, () => Promise.resolve(answer))]);
  const result = await h.fire(event, input);
  return { result, skipped: reasonsOf(h).length === 1 };
}

spec(ID, () => {
  test("$.ui.invalidate('prompt.section') and $.ui.invalidate('tool.describe') ask the host to run those hooks again, and redraw nothing", async () => {
    const { iface, calls } = fakeInterface();
    const h = await apiHarness({ rules: uiRules, ui: uiOver(iface) });
    h.api.ui.invalidate('prompt.section');
    h.api.ui.invalidate('tool.describe');
    await flush();
    expect(calls.filter((c) => c.name === 'rerun' || c.name === 'redraw')).toEqual([
      { name: 'rerun', args: ['prompt.section'] },
      { name: 'rerun', args: ['tool.describe'] },
    ]);
  });

  test('a prompt.section hook answers { text, breakPromptCache: true } and a tool.describe hook { description, breakPromptCache: true }', async () => {
    const section = { text: 'Be brief.', breakPromptCache: true };
    expect(await answered('prompt.section', { name: 'rules' }, section)).toEqual({
      result: section,
      skipped: false,
    });
    const tool = { description: 'Counts', breakPromptCache: true };
    expect(await answered('tool.describe', { description: 'Old' }, tool)).toEqual({
      result: tool,
      skipped: false,
    });
  });

  test('without the field Claude keeps reading the saved text of a section or a tool loaded upfront', () => {
    expect(nextTurnText({ saved: 'Be brief.', answered: 'Be terse.' })).toEqual({
      text: 'Be brief.',
      breaksCache: false,
    });
    expect(
      nextTurnText({ saved: 'Be brief.', answered: 'Be terse.', breakPromptCache: false }),
    ).toEqual({ text: 'Be brief.', breaksCache: false });
    expect(nextTurnText({ saved: 'Be brief.', answered: null })).toEqual({
      text: 'Be brief.',
      breaksCache: false,
    });
  });

  test('with the field the changed text reaches Claude on the next turn and the prompt cache starts over', () => {
    expect(
      nextTurnText({ saved: 'Be brief.', answered: 'Be terse.', breakPromptCache: true }),
    ).toEqual({ text: 'Be terse.', breaksCache: true });
    expect(nextTurnText({ saved: 'Be brief.', answered: null, breakPromptCache: true })).toEqual({
      text: null,
      breaksCache: true,
    });
  });

  test('in a new conversation or after a compaction nothing is saved: the text the hooks answer is read, and the cache does not start over for it', () => {
    expect(nextTurnText({ answered: 'Be terse.' })).toEqual({
      text: 'Be terse.',
      breaksCache: false,
    });
  });
});

describe('judgments', () => {
  test('a breakPromptCache that is not true or false fails the hook', async () => {
    const section = await answered(
      'prompt.section',
      { name: 'rules' },
      { text: 'x', breakPromptCache: 'yes' },
    );
    expect(section.skipped).toBe(true);
    const tool = await answered(
      'tool.describe',
      { description: 'Old' },
      { description: 'x', breakPromptCache: 1 },
    );
    expect(tool.skipped).toBe(true);
  });

  test('an answer equal to the saved text breaks no cache, with or without the field', () => {
    expect(nextTurnText({ saved: 'Same', answered: 'Same', breakPromptCache: true })).toEqual({
      text: 'Same',
      breaksCache: false,
    });
  });

  test('a tool behind tool search reads its changed description without the field', () => {
    expect(nextTurnText({ saved: 'Old', answered: 'New', isDeferred: true })).toEqual({
      text: 'New',
      breaksCache: false,
    });
  });
});
