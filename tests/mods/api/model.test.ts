/**
 * `$.model`: complete, fork and classify, prompt blocks and caching, and `maxTokens`.
 * plugins/mods/api.md § Call a model (the request each call sends; "A Claude API failure doesn't
 * reject the call, so check `r.isAnswered`, and read `r.reason` when it's `false`. The call
 * rejects for a request Claude Code won't send"), § Use prompt caching (arrays of `{ text }`
 * blocks, `cache: true` on the last block of static content), § What a `model.complete` hook
 * receives (`e.prompt` always a string, `e.system` a string or absent, `e.promptBlocks` and
 * `e.systemBlocks` when the caller passed arrays; "It keeps the leading blocks that still match
 * the start of the string, with their breakpoints, and sends the rest of the string with no
 * breakpoint"); plugins/mods/reference.md § Limits ("`maxTokens`: 1024 by default, up to 64,000
 * or the model's output limit").
 */
import { expect, test } from 'bun:test';
import type { CompleteResult, ModelCall } from '../../../src/mods/api/index.ts';
import { MODS_API } from '../../../src/protocol/mods-api-names.ts';
import { fn } from '../../support/mods-chain.ts';
import { apiHarness, expectMethods } from '../../support/mods-api.ts';
import { rejection } from '../../support/rejection.ts';
import { spec } from '../../support/spec.ts';

const usage = {
  input_tokens: 10,
  output_tokens: 5,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
};

function models(answer: CompleteResult = { isAnswered: true, text: 'bug', usage }) {
  const calls: ModelCall[] = [];
  const forks: unknown[] = [];
  return {
    calls,
    forks,
    complete: (call: ModelCall) => (calls.push(call), Promise.resolve(answer)),
    fork: (call: unknown) => (forks.push(call), Promise.resolve(answer)),
    classify: (request: unknown) => Promise.resolve({ label: 'x', request }),
  };
}

spec(
  [
    'mods.api.$.model',
    'mods.apiGuide.Send one prompt',
    'mods.apiGuide.Use prompt caching',
    'mods.apiGuide.Choose between prompt and system',
    'mods.apiGuide.What a model.complete hook receives.e.prompt',
    'mods.apiGuide.What a model.complete hook receives.e.promptBlocks and e.systemBlocks',
    'mods.apiGuide.What a model.complete hook receives.e.system',
  ],
  () => {
    test('$.model has complete, fork and classify', async () => {
      const { api } = await apiHarness({ ports: { models: models() } });
      expectMethods(api.model, MODS_API.model);
    });

    test('complete sends the prompt on its own, with the system prompt, and resolves to the answer with usage', async () => {
      const port = models();
      const h = await apiHarness({ ports: { models: port } });
      const r = await h.api.model.complete({
        model: 'haiku',
        system: 'Reply with one word: bug, feature, or question.',
        prompt: 'the export button does nothing',
        maxTokens: 20,
        timeoutMs: 15_000,
      });
      expect(r).toEqual({ isAnswered: true, text: 'bug', usage });
      expect(port.calls[0]).toMatchObject({
        model: 'haiku',
        system: [{ text: 'Reply with one word: bug, feature, or question.' }],
        prompt: [{ text: 'the export button does nothing' }],
        maxTokens: 20,
        timeoutMs: 15_000,
      });
    });

    test('a Claude API failure does not reject: isAnswered is false with a reason', async () => {
      const h = await apiHarness({
        ports: { models: models({ isAnswered: false, reason: 'api-error' }) },
      });
      expect(await h.api.model.complete({ model: 'haiku', prompt: 'x' })).toEqual({
        isAnswered: false,
        reason: 'api-error',
      });
    });

    test('a request Claude Code will not send rejects', async () => {
      const port = {
        ...models(),
        complete: () => Promise.reject(new Error('model "x" is blocked by your organization')),
      };
      const h = await apiHarness({ ports: { models: port } });
      expect(await rejection(h.api.model.complete({ model: 'x', prompt: 'y' }))).toContain(
        'blocked by your organization',
      );
    });

    test('a call without a model or prompt rejects', async () => {
      const h = await apiHarness({ ports: { models: models() } });
      expect(await rejection(h.api.model.complete({ prompt: 'x' }))).toContain('$.model.complete');
      expect(await rejection(h.api.model.complete({ model: 'haiku' }))).toContain(
        '$.model.complete',
      );
    });

    test('fork sends the conversation with the prompt at the end', async () => {
      const port = models();
      const h = await apiHarness({ ports: { models: port } });
      expect(await h.api.model.fork({ prompt: 'summarize so far' })).toMatchObject({
        isAnswered: true,
      });
      expect(port.forks[0]).toMatchObject({ prompt: [{ text: 'summarize so far' }] });
    });

    test('a stub answers $.model.complete with { value } as the docs do', async () => {
      const h = await apiHarness();
      await h.mod('stub', 'prepend', [
        fn('model.complete', () => ({ value: { isAnswered: true, text: 'PASS\nNice.', usage } })),
      ]);
      expect(await h.api.model.complete({ model: 'haiku', prompt: 'x' })).toMatchObject({
        text: 'PASS\nNice.',
      });
    });

    test('a prompt as an array of blocks reaches the port with the cache breakpoint', async () => {
      const port = models();
      const h = await apiHarness({ ports: { models: port } });
      await h.api.model.complete({
        model: 'haiku',
        prompt: [{ text: 'RULES', cache: true }, { text: 'the text to label' }],
      });
      expect(port.calls[0]?.prompt).toEqual([
        { text: 'RULES', cache: true },
        { text: 'the text to label' },
      ]);
    });

    test('the event holds e.prompt as one string, e.system a string or absent, and the block arrays only for arrays', async () => {
      const seen: unknown[] = [];
      const h = await apiHarness({ ports: { models: models() } });
      await h.mod('spy', 'prepend', [
        fn('model.complete', (_$, e, next) => (seen.push(e), next(e))),
      ]);
      await h.api.model.complete({
        model: 'haiku',
        prompt: [{ text: 'A', cache: true }, { text: 'B' }],
        system: 'S',
      });
      await h.api.model.complete({ model: 'haiku', prompt: 'plain' });
      expect(seen[0]).toMatchObject({
        prompt: 'AB',
        system: 'S',
        promptBlocks: [{ text: 'A', cache: true }, { text: 'B' }],
      });
      expect(seen[0]).not.toHaveProperty('systemBlocks');
      expect(seen[1]).toMatchObject({ prompt: 'plain' });
      expect(seen[1]).not.toHaveProperty('system');
      expect(seen[1]).not.toHaveProperty('promptBlocks');
    });

    test('a hook that adds to the end of prompt keeps the caller breakpoints', async () => {
      const port = models();
      const h = await apiHarness({ ports: { models: port } });
      await h.mod('note', 'prepend', [
        fn('model.complete', (_$, e, next) => next({ ...e, prompt: `${String(e.prompt)}\nNOTE` })),
      ]);
      await h.api.model.complete({
        model: 'haiku',
        prompt: [{ text: 'RULES', cache: true }, { text: 'text' }],
      });
      expect(port.calls[0]?.prompt).toEqual([
        { text: 'RULES', cache: true },
        { text: 'text' },
        { text: '\nNOTE' },
      ]);
    });

    test('a hook that changes the start of prompt removes the breakpoints; the rest is sent as one block', async () => {
      const port = models();
      const h = await apiHarness({ ports: { models: port } });
      await h.mod('prefix', 'prepend', [
        fn('model.complete', (_$, e, next) => next({ ...e, prompt: `NOTE\n${String(e.prompt)}` })),
      ]);
      await h.api.model.complete({
        model: 'haiku',
        prompt: [{ text: 'RULES', cache: true }, { text: 'text' }],
      });
      expect(port.calls[0]?.prompt).toEqual([{ text: 'NOTE\nRULEStext' }]);
    });

    test('system takes the same array form with its own breakpoints', async () => {
      const port = models();
      const h = await apiHarness({ ports: { models: port } });
      await h.api.model.complete({
        model: 'haiku',
        prompt: 'p',
        system: [{ text: 'S1', cache: true }],
      });
      expect(port.calls[0]?.system).toEqual([{ text: 'S1', cache: true }]);
    });
  },
);

spec(['mods.limit.maxTokens', 'mods.limit.$.model.complete'], () => {
  test('maxTokens is 1024 when the call sets none', async () => {
    const port = models();
    const h = await apiHarness({ ports: { models: port } });
    await h.api.model.complete({ model: 'haiku', prompt: 'x' });
    expect(port.calls[0]?.maxTokens).toBe(1024);
  });

  test('maxTokens up to 64,000 is sent as given', async () => {
    const port = models();
    const h = await apiHarness({ ports: { models: port } });
    await h.api.model.complete({ model: 'haiku', prompt: 'x', maxTokens: 64_000 });
    expect(port.calls[0]?.maxTokens).toBe(64_000);
  });

  test('a maxTokens above 64,000 never reaches the model as more than 64,000', async () => {
    const port = models();
    const h = await apiHarness({ ports: { models: port } });
    // Whether the call is cut or refused is the kit's judgment (judgments.test.ts); the cap holds either way.
    await h.api.model.complete({ model: 'haiku', prompt: 'x', maxTokens: 100_000 }).catch(() => 0);
    expect(port.calls.every((call) => call.maxTokens <= 64_000)).toBe(true);
  });

  test('a maxTokens that is not a positive whole number rejects', async () => {
    const h = await apiHarness({ ports: { models: models() } });
    for (const bad of [0, -1, 1.5, '20']) {
      expect(
        await rejection(h.api.model.complete({ model: 'haiku', prompt: 'x', maxTokens: bad })),
      ).toContain('$.model.complete');
    }
  });
});
