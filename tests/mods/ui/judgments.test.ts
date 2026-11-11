/**
 * What the kit decides where the docs are silent about the interface (spec/judgments.md). Tested
 * outside `spec(...)`: a judgment is never compatibility.
 */
import { expect, test } from 'bun:test';
import {
  placePane,
  routeControl,
  spacingCells,
  treeProblem,
  renderEvent,
} from '../../../src/mods/ui/index.ts';
import { apiHarness } from '../../support/mods-api.ts';
import { fakeInterface, uiChain, uiOver, node, text } from '../../support/mods-ui.ts';
import { uiRules } from '../../../src/mods/ui/index.ts';
import { measureTree } from '../../../src/mods/ui/elements/limits.ts';

const judgmentApi = async () => ({
  h: await apiHarness({ rules: uiRules, ui: uiOver(fakeInterface().iface) }),
});

const problemOf = (tree: unknown) => treeProblem('Pane', 'terminal', tree);

test('a Box takes the flexbox layout props the table calls "flex layout"', () => {
  const props = {
    flexDirection: 'row',
    flexWrap: 'wrap',
    flexGrow: 1,
    flexShrink: 0,
    alignItems: 'center',
    alignSelf: 'center',
    justifyContent: 'center',
  };
  expect(problemOf(node('Box', props))).toBeUndefined();
  // Declarations 2.1.321: BoxProps has no flexBasis.
  expect(problemOf(node('Box', { flexBasis: 2 }))).toBeDefined();
});

test('a Text reads left to right or right to left (claude-code/index.d.ts:13935)', () => {
  expect(problemOf(node('Text', { dir: 'rtl', children: ['שלום'] }))).toBeUndefined();
  expect(problemOf(node('Text', { dir: 'up', children: ['x'] }))).toBeDefined();
});

test('a spacing value that is neither a number of cells nor a step name fails the tree', () => {
  expect(problemOf(node('Box', { gap: 'huge' }))).toBe(
    'a tree Pane refuses: Box prop "gap" must be a number of cells or one of xs, sm, md, lg, xl',
  );
  expect(problemOf(node('Box', { padding: -1 }))).toContain('Box prop "padding"');
});

test('a Text holds strings and Text; a Box holds strings, elements and Claude Code`s own drawing', () => {
  expect(problemOf(node('Text', { children: ['a', text('b')] }))).toBeUndefined();
  expect(problemOf(node('Text', { children: [node('Box')] }))).toContain('Text cannot hold');
  const ref = { type: 'engine', ref: 1 } as const;
  expect(problemOf(node('Box', { children: ['s', node('Box'), ref] }))).toBeUndefined();
  expect(problemOf(node('Text', { children: [ref] }))).toContain("Claude Code's own drawing");
});

test('two Buttons with one key are a valid tree: the press by that key is what needs each key once', () => {
  const tree = node('Box', {
    children: [node('Button', { label: 'Same' }), node('Button', { label: 'Same' })],
  });
  expect(problemOf(tree)).toBeUndefined();
});

test('an Image source that is a string is a file path: the kit counts no bytes for it', () => {
  const tree = node('Box', { children: [node('Image', { key: 'i', source: '/tmp/x.png' })] });
  expect(measureTree(tree).imageBytes).toBe(0);
});

test('the Desktop app`s step cells are its own: the kit gives none', () => {
  expect(spacingCells('desktop', 'padding', 'md')).toBeUndefined();
  expect(spacingCells('desktop', 'padding', 2)).toEqual({ across: 2, down: 2 });
});

test('a pane a mod opens by itself waits when the window is not measured, and the other apps place it', () => {
  const base = { origin: 'mod', hasUserOpened: false } as const;
  expect(placePane({ ...base, surface: 'terminal', viewport: undefined }).isPlaced).toBe(false);
  expect(placePane({ ...base, surface: 'desktop', viewport: undefined })).toEqual({
    isPlaced: true,
  });
  expect(placePane({ ...base, surface: 'vscode', viewport: undefined })).toEqual({
    isPlaced: true,
  });
});

// claude-code/index.d.ts:10629 declares `requestId: string` on every `ui.render` input; the value of
// a one-instance site the host names none for is the kit's (spec/judgments.md, `instanceRequestId`).
test('a site with one instance keeps the id the host gave, else its name; the other sites need theirs', () => {
  expect(renderEvent({ site: 'PromptHint', surface: 'terminal', requestId: 'x' })).toEqual({
    event: { component: 'PromptHint', surface: 'terminal', props: {}, requestId: 'x' },
  });
  expect(renderEvent({ site: 'PromptHint', surface: 'terminal' })).toEqual({
    event: { component: 'PromptHint', surface: 'terminal', props: {}, requestId: 'PromptHint' },
  });
  expect(renderEvent({ site: 'Spinner', surface: 'terminal' })).toEqual({
    problem: 'Spinner needs a requestId',
  });
  expect(renderEvent({ site: 'ToolProgress', surface: 'desktop', requestId: 't' })).toEqual({
    problem: 'ToolProgress is not raised in the desktop app',
  });
});

test('a gesture on a control of another kind, or with no callback, is an issue or does nothing and never throws', async () => {
  const h = uiChain();
  const tree = node('Button', { key: 'b' });
  const options = {
    chain: h.chain,
    tree,
    surface: 'terminal',
    signal: new AbortController().signal,
    report: () => undefined,
  } as const;
  expect(await routeControl(options, 'press', 'b')).toEqual({ issues: [], ran: false });
  expect((await routeControl(options, 'select', 'b', 'x')).issues).toHaveLength(1);
});

test('the refusals the docs do not state: an Input rows that is not a whole number of 1 or more, a Link with no href, an Svg source over 131,072 characters', () => {
  expect(problemOf(node('Input', { key: 'i', rows: 1 }))).toBeUndefined();
  for (const rows of [0, 1.5, '2']) {
    expect(problemOf(node('Input', { key: 'i', rows }))).toContain('Input prop "rows"');
  }
  expect(problemOf(node('Link', {}))).toBe('a tree Pane refuses: Link needs an href');
  expect(treeProblem('Pane', 'desktop', node('Svg', { source: 'x'.repeat(131_073) }))).toContain(
    'Svg prop "source" is longer than 131072 characters',
  );
});

test('$.ui.resolve with something that is not the event of a ui.render hook throws, and $.ui.invalidate takes only the events the declarations name', async () => {
  const { h } = await judgmentApi();
  expect(() => h.api.ui.resolve({})).toThrow('$.ui.resolve: takes the event of a ui.render hook');
  expect(() => h.api.ui.invalidate('x')).toThrow(
    "$.ui.invalidate: takes 'ui.render', 'prompt.section', 'prompt.context', 'prompt.attachment', 'tool.describe', 'command.describe', 'config.describe'",
  );
});
