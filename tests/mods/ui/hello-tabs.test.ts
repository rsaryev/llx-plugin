/**
 * The worked example of plugins/mods/interface.md § Build a pane with tabs, run through the kit's
 * interface part: the `ui.render` hook builds the tree from `$.ui.resolve(e)`, a press runs the
 * callback, `$.ui.invalidate('ui.render')` asks for a redraw and the hook builds a new tree. The
 * kit draws nothing: the test reads the tree it folds.
 */
import { expect, test } from 'bun:test';
import {
  collectControls,
  isElementNode,
  routeControl,
  uiRules,
  type ElementNode,
} from '../../../src/mods/ui/index.ts';
import { apiHarness } from '../../support/mods-api.ts';
import { fn } from '../../support/mods-chain.ts';
import { fakeInterface, uiOver } from '../../support/mods-ui.ts';

const PANE = 'hello-tabs';

test('a pane with two tabs and a counter: press a tab, press Add one, the next drawing shows the count', async () => {
  const { iface, calls } = fakeInterface();
  const h = await apiHarness({
    plugin: 'hello-tabs',
    rules: uiRules,
    ui: uiOver(iface),
  });
  let tab = 'one';
  let count = 0;
  const $ = h.api;
  await h.mod('hello-tabs', 'user', [
    fn('ui.render', (_$, e, next) => {
      if (e.requestId !== PANE) return next(e);
      const { Box, Text, Button } = $.ui.resolve(e);
      if (!Box || !Text || !Button) throw new Error('missing elements');
      const redraw = () => $.ui.invalidate('ui.render');
      const tabButton = (name: string, label: string, hotkey: string) =>
        Button({
          key: `tab-${name}`,
          label,
          hotkey,
          plain: true,
          dimColor: tab !== name,
          onPress: () => {
            tab = name;
            return redraw();
          },
        });
      const body =
        tab === 'one'
          ? [Text({ children: ['This is the first tab.'] })]
          : [
              Box({
                flexDirection: 'row',
                columnGap: 2,
                children: [
                  Button({
                    key: 'more',
                    label: 'Add one',
                    hotkey: 'a',
                    onPress: () => {
                      count += 1;
                      return redraw();
                    },
                  }),
                  Text({ children: [`Count: ${count}`] }),
                ],
              }),
            ];
      return Box({
        flexDirection: 'column',
        children: [
          Box({
            flexDirection: 'row',
            columnGap: 3,
            children: [tabButton('one', 'One', '1'), tabButton('two', 'Two', '2')],
          }),
          Text({ children: [' '] }),
          ...body,
        ],
      });
    }),
  ]);
  const draw = async (): Promise<ElementNode> => {
    const drawn = await h.ui?.draw({ site: 'Pane', surface: 'terminal', requestId: PANE });
    if (!drawn || !('tree' in drawn)) throw new Error('nothing drawn');
    return drawn.tree;
  };
  const press = async (tree: ElementNode, key: string) =>
    routeControl(
      {
        chain: h.chain,
        tree,
        surface: 'terminal',
        signal: new AbortController().signal,
        report: () => undefined,
      },
      'press',
      key,
    );
  const texts = (tree: ElementNode): string[] =>
    tree.children.flatMap((child) =>
      typeof child === 'string' ? [child] : isElementNode(child) ? texts(child) : [],
    );

  const first = await draw();
  expect(texts(first)).toContain('This is the first tab.');
  expect(collectControls(first).map((c) => c.key)).toEqual(['tab-one', 'tab-two']);

  await press(first, 'tab-two');
  expect(calls.filter((c) => c.name === 'redraw')).toHaveLength(1);
  const second = await draw();
  expect(collectControls(second).map((c) => c.key)).toEqual(['tab-one', 'tab-two', 'more']);
  expect(texts(second)).toContain('Count: 0');

  await press(second, 'more');
  await press(second, 'more');
  expect(texts(await draw())).toContain('Count: 2');
});
