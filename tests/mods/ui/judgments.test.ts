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
  measureTree,
  renderEvent,
} from '../../../src/mods/ui/index.ts';
import { uiChain, node, text } from '../../support/mods-ui.ts';

const problemOf = (tree: unknown) => treeProblem('Pane', 'terminal', tree);

test('a Box takes the flexbox layout props the table calls "flex layout"', () => {
  const props = {
    flexDirection: 'row',
    flexWrap: 'wrap',
    flexGrow: 1,
    flexShrink: 0,
    flexBasis: 2,
    alignItems: 'center',
    alignSelf: 'center',
    justifyContent: 'center',
  };
  expect(problemOf(node('Box', props))).toBeUndefined();
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

test('a site with one instance has no request id in its event, and the other sites need theirs', () => {
  expect(renderEvent({ site: 'PromptHint', surface: 'terminal', requestId: 'x' })).toEqual({
    event: { component: 'PromptHint', surface: 'terminal', props: {} },
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
