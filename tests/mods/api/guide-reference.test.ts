/**
 * plugins/mods/reference.md § Mods API calls: "Every mods API method is also an event, named for its
 * namespace and method, such as `fs.read`, `model.complete`, or `ui.open`. A hook on one intercepts
 * calls from the mods that run after it, and can return `next(e)`, `{ deny: reason }`, or
 * `{ value }`." Its examples are the calls below; the other calls are held to the same rule by the
 * names the reference lists (§ Mods API methods) through `describeApi`.
 */
import { expect, test } from 'bun:test';
import { describeApi } from '../../../src/mods/api/index.ts';
import { validateMod } from '../../../src/mods/load/commands/validate.ts';
import { API_EVENT_NAMES } from '../../../src/protocol/mods-events.ts';
import { withUiRules } from '../../../src/mods/ui/index.ts';
import { fn } from '../../support/mods-chain.ts';
import { apiHarness } from '../../support/mods-api.ts';
import { fakeInterface, uiOver } from '../../support/mods-ui.ts';
import { memoryFiles } from '../../support/ports.ts';
import { rejection } from '../../support/rejection.ts';
import { spec } from '../../support/spec.ts';

const usage = { inputTokens: 1, outputTokens: 1 };
const models = () => ({
  calls: [] as unknown[],
  complete(call: unknown) {
    this.calls.push(call);
    return Promise.resolve({ isAnswered: true as const, text: 'from the model', usage });
  },
  fork: () => Promise.reject(new Error('unused')),
  classify: () => Promise.reject(new Error('unused')),
});

/** The calls that take no argument, one from each namespace that has one. */
const WITHOUT_ARGUMENTS = [
  'ui.panes',
  'ui.selection',
  'command.list',
  'tool.list',
  'agent.list',
  'turn.abort',
  'session.messages',
  'session.cwd',
  'session.root',
  'session.model',
  'session.turns',
  'session.id',
  'session.repo',
  'session.surfaces',
  'session.usage',
  'session.version',
  'session.compact',
  'config.list',
  'store.keys',
  'clock.now',
] as const;

const callByName = (api: unknown, event: string): Promise<unknown> => {
  const [namespace = '', method = ''] = event.split('.');
  const member: unknown = Reflect.get(Object(Reflect.get(Object(api), namespace)), method);
  if (typeof member !== 'function') throw new Error(`${event} is not a call`);
  return Promise.resolve(member());
};

spec('mods.reference.Mods API calls', () => {
  test('fs.read, model.complete and ui.open are events: a hook on each sees the call and next(e) reaches Claude Code', async () => {
    const { iface } = fakeInterface();
    const port = models();
    const read: string[] = [];
    const h = await apiHarness({
      rules: withUiRules,
      ui: uiOver(iface),
      ports: {
        models: port,
        fs: {
          read: (path: string) => (
            read.push(path),
            Promise.resolve({ text: 'contents', bytes: 8 })
          ),
          write: () => Promise.reject(new Error('unused')),
          list: () => Promise.reject(new Error('unused')),
          stat: () => Promise.reject(new Error('unused')),
          exists: () => Promise.reject(new Error('unused')),
          ancestors: () => Promise.reject(new Error('unused')),
        },
      },
    });
    const seen: string[] = [];
    const watch = (event: string) =>
      fn(event, (_$, e, next) => (seen.push(event + ':' + JSON.stringify(e)), next(e)));
    await h.mod('watcher', 'prepend', [
      watch('fs.read'),
      watch('model.complete'),
      watch('ui.open'),
    ]);
    expect(await h.api.fs.read('/work/notes.md')).toBe('contents');
    await h.api.model.complete({ model: 'haiku', prompt: 'hi' });
    await h.api.ui.open({ id: 'my-pane' });
    expect(seen).toHaveLength(3);
    expect(seen[0]).toStartWith('fs.read:');
    expect(seen[0]).toContain('/work/notes.md');
    expect(seen[1]).toStartWith('model.complete:');
    expect(seen[2]).toStartWith('ui.open:');
    expect(read).toEqual(['/work/notes.md']);
    expect(port.calls).toHaveLength(1);
  });

  test('{ value } answers the call in Claude Code place: the port is never reached', async () => {
    const port = models();
    const h = await apiHarness({ ports: { models: port } });
    await h.mod('stub', 'prepend', [
      fn('model.complete', () => ({ value: { isAnswered: true, text: 'stubbed', usage } })),
    ]);
    expect(await h.api.model.complete({ model: 'haiku', prompt: 'hi' })).toEqual({
      isAnswered: true,
      text: 'stubbed',
      usage,
    });
    expect(port.calls).toHaveLength(0);
  });

  test('{ deny: reason } refuses the call: it rejects with the reason and the port is never reached', async () => {
    const port = models();
    const h = await apiHarness({ ports: { models: port } });
    await h.mod('policy', 'prepend', [fn('model.complete', () => ({ deny: 'no models today' }))]);
    expect(await rejection(h.api.model.complete({ model: 'haiku', prompt: 'hi' }))).toContain(
      'no models today',
    );
    expect(port.calls).toHaveLength(0);
  });

  test('a hook intercepts only the calls of the mods that run after it', async () => {
    const h = await apiHarness({ plugin: 'early' });
    const late = await h.mod('late', 'append', []);
    const early = await h.mod('early-hook', 'prepend', [fn('clock.now', () => ({ value: 42 }))]);
    expect(await late.api.clock.now()).toBe(42);
    // The mod that owns the hook is not intercepted by it when it is the one calling.
    expect(await early.api.clock.now()).not.toBe(42);
  });

  test('every call of the table is such an event: a hook on one answers when the call is made', async () => {
    const h = await apiHarness();
    const described = new Set(
      describeApi(h.api).flatMap((entry) => entry.members.flatMap((m) => m.event ?? [])),
    );
    for (const event of WITHOUT_ARGUMENTS) expect(described.has(event)).toBe(true);
    const { iface } = fakeInterface();
    const withUi = () => apiHarness({ rules: withUiRules, ui: uiOver(iface) });
    for (const event of WITHOUT_ARGUMENTS) {
      const answered = await withUi();
      await answered.mod('stub', 'prepend', [fn(event, () => ({ value: `answered ${event}` }))]);
      expect(await callByName(answered.api, event)).toBe(`answered ${event}`);
      const refused = await withUi();
      await refused.mod('policy', 'prepend', [fn(event, () => ({ deny: 'not now' }))]);
      expect(await rejection(callByName(refused.api, event))).toContain('not now');
    }
  });

  test('a hook module can name every call of the table as an event, and no other name is one', async () => {
    const h = await apiHarness();
    const events = describeApi(h.api).flatMap((entry) =>
      entry.members.flatMap((m) => m.event ?? []),
    );
    expect(events.map(String).toSorted()).toEqual([...API_EVENT_NAMES].toSorted());
    const module = (names: readonly string[]) =>
      `export function register(on) {\n${names.map((name) => `  on('${name}', async ($, e, next) => next(e))`).join('\n')}\n}`;
    const folder = (source: string) =>
      memoryFiles({
        '.claude-plugin/plugin.json': JSON.stringify({ name: 'm', version: '0.1.0' }),
        'hooks/hooks.json': JSON.stringify({ modules: ['./register.js'] }),
        'hooks/register.js': source,
      });
    const known = await validateMod({ files: folder(module(events)), target: '.' });
    expect(known.lines.join('\n')).not.toContain('is not an event');
    const unknown = await validateMod({ files: folder(module(['fs.slurp'])), target: '.' });
    expect(unknown.lines.join('\n')).toContain('"fs.slurp" is not an event');
  });
});
