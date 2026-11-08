/**
 * plugins/mods/interface.md § Keep a value in `$.state` (Define, read, and write a value), § Load a
 * saved value again after `/clear`; plugins/mods/test.md § Test a drawing after `/clear`. Each test is
 * the docs' own example, run through the pane of hello-tabs.
 */
import { expect, test } from 'bun:test';
import { atom, read, update, type StateHost } from '../../../src/mods/api/index.ts';
import { registerOf } from '../../support/mods-load.ts';
import { HELLO_MANIFEST, HELLO_TYPES, helloStateModule } from '../../support/mods-hello-state.ts';
import { runPluginTests, type TestFile } from '../../support/mods-testing.ts';
import { spec } from '../../support/spec.ts';

type Element = (props: Record<string, unknown>) => unknown;
type Resolve = (e: unknown) => Record<'Box' | 'Text' | 'Button', Element>;
interface Dollar extends StateHost {
  ui: { resolve: Resolve };
  store: { get(key: string): Promise<unknown>; set(key: string, value: unknown): Promise<void> };
}
type Next = (e: unknown) => unknown;

const PANE = {
  plugin: 'hello-tabs',
  component: 'Pane',
  requestId: 'hello-tabs',
  viewport: { columns: 100, rows: 30 },
  props: {
    title: 'Hello tabs',
    isFocused: true,
    bodyColumns: 60,
    placement: 'inline',
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const;

type Handle = {
  press(t: { key: string }): Promise<void>;
  find(q: { key?: string; type?: string; text?: string | RegExp }): Promise<unknown>;
};
type Claude = {
  ui: { mount: (spec: unknown) => Promise<Handle> };
  classic: { SessionStart(e: { source: string }): Promise<unknown> };
};
const claudeOf = (claude: unknown): Claude => claude as Claude;

// hello-tabs of interface.md after "Change `hello-tabs` to use `$.state`": `count` is an atom, the
// button saves what the store holds now plus one (§ Save from more than one session), and
// `session.start` runs `loadCount`.
const withClassicHook = registerOf((on) => {
  const count = atom({ plugin: 'hello-tabs', key: 'count' }, 0);
  async function loadCount($: Dollar) {
    const saved = Number((await $.store.get('count')) ?? 0);
    await update($, count, () => saved);
  }
  on('ui.render', { component: 'Pane' }, async ($: Dollar, e: unknown) => {
    const { Box, Text, Button } = $.ui.resolve(e);
    const n = await read($, count);
    const press = async () => {
      const saved = Number((await $.store.get('count')) ?? 0);
      await $.store.set('count', saved + 1);
      await update($, count, () => saved + 1);
    };
    return Box({
      children: [
        Button({ key: 'more', label: 'Add one', onPress: press }),
        Text({ children: ['Count: ' + n] }),
      ],
    });
  });
  on('session.start', async ($: Dollar, e: unknown, next: Next) => {
    await loadCount($);
    return next(e);
  });
  on(
    'classic.SessionStart',
    { source: ['clear', 'resume', 'fork'] },
    async ($: Dollar, e: unknown, next: Next) => {
      await loadCount($);
      return next(e);
    },
  );
});

// The same mod without the hook the docs add: it loads the count in `session.start` only.
const withoutClassicHook = registerOf((on) => {
  const count = atom({ plugin: 'hello-tabs', key: 'count' }, 0);
  on('ui.render', { component: 'Pane' }, async ($: Dollar, e: unknown) => {
    const { Box, Text, Button } = $.ui.resolve(e);
    const n = await read($, count);
    const press = async () => {
      await update($, count, (value) => value + 1);
      await $.store.set('count', await read($, count));
    };
    return Box({
      children: [
        Button({ key: 'more', label: 'Add one', onPress: press }),
        Text({ children: ['Count: ' + n] }),
      ],
    });
  });
});

const run = (file: TestFile, withHook = true) =>
  runPluginTests({
    name: 'hello-tabs',
    register: withHook ? withClassicHook : withoutClassicHook,
    extra: {
      'hooks/register.js': helloStateModule(withHook),
      'types/index.d.ts': HELLO_TYPES,
      '.claude-plugin/plugin.json': HELLO_MANIFEST,
    },
    tests: { 'tests/hello-tabs.test.ts': file },
  });

spec('mods.interface.Define, read, and write a value', () => {
  test('atom names a value and its default, read returns it, update writes it, and a drawing that read the value is drawn again by the write', async () => {
    const result = await run(({ test, expect }) => {
      test('the pane follows the value', async (claude, on) => {
        const saved = new Map<string, unknown>();
        on('store.get', (_$: unknown, e: { key: string }) => ({ value: saved.get(e.key) }));
        on('store.set', (_$: unknown, e: { key: string; value: unknown }) => {
          saved.set(e.key, e.value);
          return { value: undefined };
        });
        const ui = await claudeOf(claude).ui.mount({ ...PANE, surface: 'terminal' });
        expect(await ui.find({ type: 'Text', text: 'Count: 0' })).toBeDefined();
        await ui.press({ key: 'more' });
        await ui.press({ key: 'more' });
        // No `$.ui.invalidate` anywhere in the mod: reading `count` while drawing subscribed the pane to it.
        expect(await ui.find({ type: 'Text', text: 'Count: 2' })).toBeDefined();
      });
    });
    expect(result.lines.join('\n')).toContain('(pass) the pane follows the value');
    expect(result.exitCode).toBe(0);
  });
});

spec('mods.interface.Load a saved value again after /clear', () => {
  test('the test of test.md: after classic.SessionStart with source clear the pane shows the stored count, not 0', async () => {
    const result = await run(({ test, expect }) => {
      test('the saved count comes back after /clear', async (claude, on) => {
        on('store.get', () => ({ value: 7 }));
        on('classic.SessionStart', () => ({}));
        await claudeOf(claude).classic.SessionStart({ source: 'clear' });
        const ui = await claudeOf(claude).ui.mount({ ...PANE, surface: 'terminal' });
        expect(await ui.find({ type: 'Text', text: 'Count: 7' })).toBeDefined();
      });
    });
    expect(result.lines.join('\n')).toContain('(pass) the saved count comes back after /clear');
    expect(result.exitCode).toBe(0);
  });

  test('without the classic.SessionStart hook the pane draws Count: 0, and the test fails at toBeDefined', async () => {
    const result = await run(({ test, expect }) => {
      test('the saved count comes back after /clear', async (claude, on) => {
        on('store.get', () => ({ value: 7 }));
        on('classic.SessionStart', () => ({}));
        await claudeOf(claude).classic.SessionStart({ source: 'clear' });
        const ui = await claudeOf(claude).ui.mount({ ...PANE, surface: 'terminal' });
        expect(await ui.find({ type: 'Text', text: 'Count: 7' })).toBeDefined();
        expect(await ui.find({ type: 'Text', text: 'Count: 0' })).toBeUndefined();
      });
    }, false);
    expect(result.failed).toBe(1);
  });

  test('resume and fork load it again too; startup and compact do not, which the source filter keeps to the three resets', async () => {
    const result = await run(({ test, expect }) => {
      for (const [source, shown] of [
        ['resume', 'Count: 7'],
        ['fork', 'Count: 7'],
        ['startup', 'Count: 0'],
        ['compact', 'Count: 0'],
      ] as const) {
        test(`source ${source}`, async (claude, on) => {
          on('store.get', () => ({ value: 7 }));
          on('classic.SessionStart', () => ({}));
          await claudeOf(claude).classic.SessionStart({ source });
          const ui = await claudeOf(claude).ui.mount({ ...PANE, surface: 'terminal' });
          expect(await ui.find({ type: 'Text', text: shown })).toBeDefined();
        });
      }
    });
    expect(result.passed).toBe(4);
    expect(result.failed).toBe(0);
  });

  test('a button that saves the $.state value writes the default over the stored count when nothing loaded it again', async () => {
    const saved = new Map<string, unknown>([['count', 7]]);
    const result = await run(({ test, expect }) => {
      test('the store keeps its 7', async (claude, on) => {
        on('store.get', (_$: unknown, e: { key: string }) => ({ value: saved.get(e.key) }));
        on('store.set', (_$: unknown, e: { key: string; value: unknown }) => {
          saved.set(e.key, e.value);
          return { value: undefined };
        });
        const ui = await claudeOf(claude).ui.mount({ ...PANE, surface: 'terminal' });
        await ui.press({ key: 'more' });
        expect(saved.get('count')).toBe(7);
      });
    }, false);
    expect(result.failed).toBe(1);
    expect(saved.get('count')).toBe(1);
  });
});
