/**
 * plugins/mods/admin.md § Know what happens by default; Know which hooks of a user's mod don't run.
 * These are real host dispatches through the built-in guard, not a test-sorted chain.
 */
import { expect, test } from 'bun:test';
import type { AnyModEventName } from '../../../src/protocol/mods-events.ts';
import { apiHarness } from '../../support/mods-api.ts';
import { fn, record } from '../../support/mods-chain.ts';
import { managed, session } from '../../support/mods-load.ts';
import { spec } from '../../support/spec.ts';

const rowKeys: Readonly<Record<string, (input: unknown) => string>> = {
  'classic.Stop': () => 'classic.<Event>',
  'session.append': (input) => `session.append{door=${String(record(input).door)}}`,
};

const cases = [
  {
    clause: 'Settings hook events',
    event: 'classic.Stop',
    input: { hook_event_name: 'Stop' },
    result: {},
  },
  {
    clause: 'Prompt sections and context',
    event: 'prompt.compose',
    input: {},
    result: { sections: [] },
  },
  {
    clause: 'Prompt sections and context',
    event: 'prompt.context',
    input: {},
    result: { blocks: [] },
  },
  {
    clause: 'Prompt sections and context',
    event: 'prompt.section',
    input: { name: 'system' },
    result: { text: 'original system' },
  },
  {
    clause: 'Engine settings',
    event: 'settings.read',
    input: { layers: [] },
    result: { value: { model: 'haiku' } },
  },
  {
    clause: 'Managed skills',
    event: 'skill.prompt',
    input: { skill: 'company-review', source: 'policySettings', text: 'company instructions' },
    result: { text: 'company instructions' },
  },
  {
    clause: 'Door and compaction attachments',
    event: 'prompt.attachment',
    input: { type: 'compaction' },
    result: { text: 'original summary' },
  },
  {
    clause: 'Door and compaction attachments',
    event: 'prompt.attachment',
    input: { type: 'hook-context' },
    result: { text: 'original hook context' },
  },
  {
    clause: 'Attribution',
    event: 'attribution.text',
    input: {},
    result: { text: 'original attribution' },
  },
  {
    clause: 'Compaction',
    event: 'session.compact',
    input: {},
    result: {},
  },
  {
    clause: 'Attachment row',
    event: 'session.append',
    input: { door: 'attachment', message: { content: 'protected row' } },
    result: {},
  },
  {
    clause: 'Hook-context row',
    event: 'session.append',
    input: { door: 'hook-context', message: { content: 'protected row' } },
    result: {},
  },
  {
    clause: 'Compaction row',
    event: 'session.append',
    input: { door: 'compaction', message: { content: 'protected row' } },
    result: {},
  },
] as const satisfies readonly {
  clause: string;
  event: AnyModEventName;
  input: Readonly<Record<string, unknown>>;
  result: unknown;
}[];

for (const fixture of cases) {
  spec(
    [
      'policy.mods.Know what happens by default.The guard protects what you manage',
      `policy.mods.Know which hooks of a user's mod don't run.${rowKeys[fixture.event]?.(fixture.input) ?? fixture.event}`,
    ],
    () => {
      test(`${fixture.event}: skips user hooks, not organization or built-in hooks`, async () => {
        const s = session({}, { policy: managed({}), firesSessionStart: false });
        await s.host.load([]);
        const trace: string[] = [];
        const { api } = await apiHarness();
        s.host.chain.register({ name: 'user-mod', api }, 'user', [
          fn('*', (_$, e, next) => (trace.push('user'), next(e))),
        ]);
        s.host.chain.register({ name: 'company-mod', api }, 'prepend', [
          fn('*', (_$, e, next) => (trace.push('organization'), next(e))),
        ]);
        await s.host.registerBuiltIn('native-mod', 'user', [
          fn('*', (_$, e, next) => (trace.push('built-in'), next(e))),
        ]);
        trace.length = 0;
        const result = await s.host.fire(fixture.event, fixture.input, {
          core: () => (trace.push('core'), Promise.resolve(fixture.result)),
        });
        expect(result).toEqual(fixture.result);
        expect(trace).toEqual(['organization', 'built-in', 'core']);
        expect(s.reports).toEqual([]);
      });
    },
  );
}

test('ordinary prompts and conversation rows still reach a user mod', async () => {
  const s = session({}, { policy: managed({}), firesSessionStart: false });
  await s.host.load([]);
  const seen: string[] = [];
  const { api } = await apiHarness();
  s.host.chain.register({ name: 'user-mod', api }, 'user', [
    fn('prompt.submit', (_$, e, next) => (seen.push('prompt'), next(e))),
    fn('session.append', (_$, e, next) => (seen.push('row'), next(e))),
  ]);
  await s.host.fire(
    'prompt.submit',
    { text: 'personal instructions' },
    { core: () => Promise.resolve({ text: 'personal instructions' }) },
  );
  await s.host.fire(
    'session.append',
    { message: { content: 'personal row' } },
    { core: () => Promise.resolve({}) },
  );
  expect(seen).toEqual(['prompt', 'row']);
});
