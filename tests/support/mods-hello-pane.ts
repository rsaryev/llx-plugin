import { atom, read, update } from '../../src/mods/api/index.ts';
import type { ModNext, ModsApi } from '../../src/mods/types.ts';
import { registerOf } from './mods-load.ts';
import { HELLO_MANIFEST, HELLO_TYPES, helloStateModule } from './mods-hello-state.ts';
import { runPluginTests, type TestFile } from './mods-testing.ts';

/** The props of the `Pane` site hello-tabs draws, on the terminal surface. */
export const PANE = {
  plugin: 'hello-tabs',
  component: 'Pane',
  requestId: 'hello-tabs',
  viewport: { columns: 100, rows: 30 },
  surface: 'terminal',
  props: {
    title: 'Hello tabs',
    isFocused: true,
    bodyColumns: 60,
    placement: 'inline',
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const;

type Next = ModNext<unknown, unknown>;

/** The three elements hello-tabs draws with, from the table of the site: the terminal has all of them. */
function elementsOf($: ModsApi, e: unknown) {
  const { Box, Text, Button } = $.ui.resolve(e);
  if (!Box || !Text || !Button) throw new Error('the terminal draws Box, Text and Button');
  return { Box, Text, Button };
}

// hello-tabs of interface.md after "Change `hello-tabs` to use `$.state`": `count` is an atom, the
// button saves what the store holds now plus one (§ Save from more than one session), and
// `session.start` runs `loadCount`.
const withClassicHook = registerOf((on) => {
  const count = atom({ plugin: 'hello-tabs', key: 'count' }, 0);
  async function loadCount($: ModsApi) {
    const saved = Number((await $.store.get('count')) ?? 0);
    await update($, count, () => saved);
  }
  on('ui.render', { component: 'Pane' }, async ($: ModsApi, e: unknown) => {
    const { Box, Text, Button } = elementsOf($, e);
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
  on('session.start', async ($: ModsApi, e: unknown, next: Next) => {
    await loadCount($);
    return next(e);
  });
  on(
    'classic.SessionStart',
    { source: ['clear', 'resume', 'fork'] },
    async ($: ModsApi, e: unknown, next: Next) => {
      await loadCount($);
      return next(e);
    },
  );
});

// The same mod without the hook the docs add: it loads the count in `session.start` only.
const withoutClassicHook = registerOf((on) => {
  const count = atom({ plugin: 'hello-tabs', key: 'count' }, 0);
  on('ui.render', { component: 'Pane' }, async ($: ModsApi, e: unknown) => {
    const { Box, Text, Button } = elementsOf($, e);
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

/** Runs a test file against hello-tabs, with or without the `classic.SessionStart` hook the docs add. */
export const runHello = (file: TestFile, withHook = true) =>
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
