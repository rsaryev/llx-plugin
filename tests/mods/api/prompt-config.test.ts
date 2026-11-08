/**
 * `$.prompt`, `$.turn` and `$.config`.
 * plugins/mods/api.md § Start a turn from a background job (`$.prompt.submit({ text })`, `asUser:
 * true`: "Claude reads the text after a sentence that names your mod as the sender. To send it as
 * the user's own words, without that sentence, add `asUser: true`"), § What refused calls return
 * (`$.prompt.submit` resolves with `{ drop: '<reason>' }`); plugins/mods/reference.md § Mods API
 * methods (`$.prompt`, `$.turn`, `$.config`), § Commands and configuration (`config.set`: `next({
 * ...e, value })` or `{ deny: reason }`); plugins/mods/test.md § Look up what a stub returns
 * (`prompt.fill` takes `{ isFilled }`; `$.prompt.read` resolves to `{ text, cursor }`).
 */
import { expect, test } from 'bun:test';
import { MODS_API } from '../../../src/protocol/mods-api-names.ts';
import { fn } from '../../support/mods-chain.ts';
import { apiHarness, expectMethods } from '../../support/mods-api.ts';
import { rejection } from '../../support/rejection.ts';
import { spec } from '../../support/spec.ts';

const prompts = (seen: unknown[] = []) => ({
  submit: (prompt: unknown) => (seen.push(prompt), Promise.resolve({})),
  read: () => Promise.resolve({ text: 'draft', cursor: 5 }),
  fill: (text: string) => (seen.push(['fill', text]), Promise.resolve({ isFilled: true })),
  suggest: (text: string) => (seen.push(['suggest', text]), Promise.resolve({ isShown: true })),
  compose: () => Promise.resolve([{ id: 'intro', text: 'You are', scope: 'main' }]),
});

spec('mods.api.$.prompt', () => {
  test('$.prompt has submit, read, fill, suggest and compose', async () => {
    const { api } = await apiHarness({ ports: { prompts: prompts() } });
    expectMethods(api.prompt, MODS_API.prompt);
  });

  test('submit({ text }) names the mod as the sender; asUser: true sends the user own words without that', async () => {
    const seen: unknown[] = [];
    const h = await apiHarness({ ports: { prompts: prompts(seen) } });
    await h.api.prompt.submit({ text: 'checks failed' });
    await h.api.prompt.submit({ text: 'run the tests', asUser: true });
    expect(seen).toEqual([
      { text: 'checks failed', from: 'my-mod' },
      { text: 'run the tests', asUser: true },
    ]);
  });

  test('a refused submit resolves with { drop: reason } and queues no prompt', async () => {
    const reason = 'the run reached its --max-turns limit';
    const port = { ...prompts(), submit: () => Promise.resolve({ drop: reason }) };
    const h = await apiHarness({ ports: { prompts: port } });
    expect(await h.api.prompt.submit({ text: 'again' })).toEqual({ drop: reason });
  });

  test('read resolves to { text, cursor }; fill and suggest answer { isFilled } and { isShown }; compose lists the sections', async () => {
    const seen: unknown[] = [];
    const h = await apiHarness({ ports: { prompts: prompts(seen) } });
    expect(await h.api.prompt.read()).toEqual({ text: 'draft', cursor: 5 });
    expect(await h.api.prompt.fill('/standup 3')).toEqual({ isFilled: true });
    expect(await h.api.prompt.suggest('run the tests')).toEqual({ isShown: true });
    expect(await h.api.prompt.compose()).toEqual([{ id: 'intro', text: 'You are', scope: 'main' }]);
    expect(seen).toEqual([
      ['fill', '/standup 3'],
      ['suggest', 'run the tests'],
    ]);
  });

  test('a hook on prompt.fill answers with { isFilled: true } as the docs stub does', async () => {
    const h = await apiHarness();
    await h.mod('stub', 'prepend', [fn('prompt.fill', () => ({ isFilled: true }))]);
    expect(await h.api.prompt.fill('x')).toEqual({ isFilled: true });
  });

  test('a hook can change the text a fill puts into the prompt box', async () => {
    const seen: unknown[] = [];
    const h = await apiHarness({ ports: { prompts: prompts(seen) } });
    await h.mod('upper', 'prepend', [
      fn('prompt.fill', (_$, e, next) => next({ ...e, text: String(e.text).toUpperCase() })),
    ]);
    await h.api.prompt.fill('hello');
    expect(seen).toEqual([['fill', 'HELLO']]);
  });

  test('a submit without text rejects', async () => {
    const h = await apiHarness({ ports: { prompts: prompts() } });
    expect(await rejection(h.api.prompt.submit({}))).toContain('$.prompt.submit');
  });
});

spec('mods.api.$.turn', () => {
  test('$.turn has abort, which stops the running turn', async () => {
    let aborted = 0;
    const turns = { abort: () => ((aborted += 1), Promise.resolve()) };
    const { api } = await apiHarness({ ports: { turns } });
    expectMethods(api.turn, MODS_API.turn);
    await api.turn.abort();
    expect(aborted).toBe(1);
  });
});

const config = (sets: unknown[] = []) => ({
  list: () => Promise.resolve([{ key: 'theme', label: 'Theme' }]),
  set: (key: string, value: unknown) => (sets.push([key, value]), Promise.resolve()),
});

spec('mods.api.$.config', () => {
  test('$.config has list and set; set changes one row', async () => {
    const sets: unknown[] = [];
    const { api } = await apiHarness({ ports: { config: config(sets) } });
    expectMethods(api.config, MODS_API.config);
    expect(await api.config.list()).toEqual([{ key: 'theme', label: 'Theme' }]);
    await api.config.set('theme', 'dark');
    expect(sets).toEqual([['theme', 'dark']]);
  });

  test('a config.set hook changes the value or refuses with { deny }, which rejects the call', async () => {
    const sets: unknown[] = [];
    const h = await apiHarness({ ports: { config: config(sets) } });
    await h.mod('fix', 'prepend', [
      fn('config.set', (_$, e, next) =>
        e.value === 'neon' ? { deny: 'too bright' } : next({ ...e, value: 'dark' }),
      ),
    ]);
    await h.api.config.set('theme', 'light');
    expect(sets).toEqual([['theme', 'dark']]);
    expect(await rejection(h.api.config.set('theme', 'neon'))).toContain(
      'my-mod: $.config.set: too bright',
    );
  });
});
