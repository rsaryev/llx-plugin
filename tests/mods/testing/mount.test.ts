/**
 * plugins/mods/test.md § Test a drawing (`$.ui.mount`, the hello-tabs example, the handle's methods,
 * the stub for a `ui.render` hook that returns `next(e)`).
 */
import { expect, test } from 'bun:test';
import { registerOf } from '../../support/mods-load.ts';
import { runPluginTests, type TestFile } from '../../support/mods-testing.ts';
import { spec } from '../../support/spec.ts';

type Element = (props: Record<string, unknown>) => unknown;
type Resolve = (e: unknown) => Record<'Box' | 'Text' | 'Button' | 'Input' | 'Select', Element>;
type Hook = (
  $: { ui: { resolve: Resolve; invalidate(name: string): void }; store: Store },
  e: { requestId: string },
  next: (e: unknown) => Promise<unknown>,
) => Promise<unknown>;
interface Store {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}
type Handle = {
  press(t: { key: string }): Promise<void>;
  input(t: { key: string; text: string; kind?: 'change' }): Promise<void>;
  select(t: { key: string; value: string }): Promise<void>;
  find(q: { key?: string; type?: string; text?: string | RegExp }): Promise<unknown>;
  unmount(): Promise<void>;
};
const mounter = (claude: unknown) =>
  (claude as { ui: { mount: (spec: unknown) => Promise<Handle> } }).ui.mount;

// hello-tabs/hooks/register.js of interface.md: the pane with two tabs and a counter.
const helloTabs = registerOf((on) => {
  let tab = 'one';
  let count = 0;
  on('ui.render', { component: 'Pane' }, (async ($, e, next) => {
    if (e.requestId !== 'hello-tabs') return next(e);
    const { Box, Text, Button } = $.ui.resolve(e);
    const redraw = () => $.ui.invalidate('ui.render');
    const tabButton = (name: string, label: string) =>
      Button({
        key: 'tab-' + name,
        label,
        onPress: () => {
          tab = name;
          redraw();
        },
      });
    const body =
      tab === 'one'
        ? [Text({ children: ['This is the first tab.'] })]
        : [
            Box({
              children: [
                Button({
                  key: 'more',
                  label: 'Add one',
                  onPress: async () => {
                    count += 1;
                    redraw();
                    await $.store.set('count', count);
                  },
                }),
                Text({ children: ['Count: ' + count] }),
              ],
            }),
          ];
    return Box({
      children: [Box({ children: [tabButton('one', 'One'), tabButton('two', 'Two')] }), ...body],
    });
  }) satisfies Hook);
});

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

const run = (file: TestFile, register = helloTabs, name = 'hello-tabs') =>
  runPluginTests({ name, register, tests: { 'tests/mount.test.ts': file } });

spec('mods.command.claude plugin test [directory]', () => {
  test('$.ui.mount draws the pane through the mod`s ui.render hook; press and find reach it by key, in both apps', async () => {
    const result = await run(({ test, expect }) => {
      test('the second tab counts presses and saves the count', async (claude, on) => {
        const saved = new Map<string, unknown>();
        on('store.get', (_$: unknown, e: { key: string }) => ({ value: saved.get(e.key) }));
        on('store.set', (_$: unknown, e: { key: string; value: unknown }) => {
          saved.set(e.key, e.value);
          return { value: undefined };
        });
        for (const surface of ['terminal', 'desktop'] as const) {
          const ui = await mounter(claude)({ ...PANE, surface });
          await ui.press({ key: 'tab-two' });
          await ui.press({ key: 'more' });
          expect(await ui.find({ type: 'Text', text: /^Count: \d+$/ })).toBeDefined();
          await ui.unmount();
        }
        expect(saved.get('count')).toBe(2);
      });
    });
    expect(result.lines.join('\n')).toContain(
      '(pass) the second tab counts presses and saves the count',
    );
    expect(result.exitCode).toBe(0);
  });

  test('find returns the first match as { type, props, children } by key or by type and text, and undefined when none', async () => {
    const result = await run(({ test, expect }) => {
      test('find', async (claude, on) => {
        on('store.set', () => ({ value: undefined }));
        const ui = await mounter(claude)({ ...PANE, surface: 'terminal' });
        const first = (await ui.find({ type: 'Text', text: 'This is the first tab.' })) as {
          type: string;
          children: unknown;
        };
        expect(first.type).toBe('Text');
        expect(first.children).toEqual(['This is the first tab.']);
        expect(await ui.find({ key: 'tab-two' })).toBeDefined();
        expect(await ui.find({ key: 'more' })).toBeUndefined();
        expect(await ui.find({ type: 'Text', text: 'Count: 2' })).toBeUndefined();
      });
    });
    expect(result.lines.join('\n')).toContain('(pass) find');
  });

  test('a ui.render hook that returns next(e) fails the mount with `no implementation for ui.render` until a stub answers', async () => {
    const result = await run(({ test, expect }) => {
      test('other pane, no stub', async (claude) => {
        await mounter(claude)({ ...PANE, requestId: 'other', surface: 'terminal' });
      });
      test('other pane, stubbed', async (claude, on) => {
        on('ui.render', () => ({ type: 'Text', props: {}, children: ['drawn by Claude Code'] }));
        const ui = await mounter(claude)({ ...PANE, requestId: 'other', surface: 'terminal' });
        expect(await ui.find({ type: 'Text' })).toBeDefined();
      });
    });
    const text = result.lines.join('\n');
    expect(text).toContain('no implementation for ui.render');
    expect(result.passed).toBe(1);
    expect(result.failed).toBe(1);
  });

  test('input types into an Input and presses Enter, kind change does not; select picks an option', async () => {
    const result = await runPluginTests({
      name: 'form',
      register: registerOf((on) => {
        const log: string[] = [];
        on('ui.render', { component: 'Pane' }, ((
          $: { ui: { resolve: Resolve; invalidate(name: string): void } },
          e: unknown,
        ) => {
          const { Box, Text, Input, Select } = $.ui.resolve(e);
          return Box({
            children: [
              Input({
                key: 'new-note',
                value: '',
                onInput: (text: string) => log.push('change:' + text),
                onSubmit: (text: string) => log.push('submit:' + text),
              }),
              Select({
                key: 'size',
                options: [
                  { label: 'Small', value: 'small' },
                  { label: 'Large', value: 'large' },
                ],
                onSelect: (value: string) => log.push('select:' + value),
              }),
              Text({ children: [log.join(',')] }),
            ],
          });
        }) as never);
      }),
      tests: {
        'tests/form.test.ts': ({ test, expect }) => {
          test('gestures', async (claude) => {
            const ui = await mounter(claude)({ ...PANE, surface: 'terminal' });
            await ui.input({ key: 'new-note', text: 'buy milk', kind: 'change' });
            await ui.input({ key: 'new-note', text: 'buy milk' });
            await ui.select({ key: 'size', value: 'large' });
            expect(
              await ui.find({ type: 'Text', text: 'change:buy milk,submit:buy milk,select:large' }),
            ).toBeDefined();
          });
        },
      },
    });
    expect(result.lines.join('\n')).toContain('(pass) gestures');
  });
});

// acme-guard/hooks/register.js of admin.md, trimmed to the check under test.
