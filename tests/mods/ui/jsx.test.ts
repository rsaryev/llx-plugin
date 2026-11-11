/**
 * What JSX compiles against and how an element's children are normalised, declarations 2.1.321
 * (AGENTS.md, E2a; claude-code/index.d.ts):
 * - `h` (:16460): "The JSX factory ...: a plain-data element from a string tag or a component";
 *   "every tag is a constructor from `$.ui.resolve(e)`" (:16471).
 * - `Fragment` (:16469): "`<>...</>`: a column Box around the children."
 * - `RenderChildren` (:10224): "a node, a number (drawn as its string), a value the factory drops, or
 *   a list that may nest. `false`, `null` and `undefined` are dropped ... The element holds the flat,
 *   normalized list of RenderNode."
 * - `JSX.IntrinsicAttributes` (:16486): `key?: string` on every tag, and `ElementChildrenAttribute`
 *   (:16483) `children`: an element whose props declare no `key` (`TextProps`, `LinkProps`, ...)
 *   takes one as JSX does and drops it (spec/judgments.md, `jsxKey`); `ref` is not declared.
 * `elementNameOf` is a kit judgment (spec/judgments.md): the constructors are pure, so a host hands
 * one across a boundary by its name.
 */
import { describe, expect, test } from 'bun:test';
import { treeProblem } from '../../../src/mods/ui/elements/index.ts';
import {
  Fragment,
  defaultElementTable,
  elementFn,
  elementNameOf,
  h,
} from '../../../src/entry/mod-isolate.ts';

describe('h and Fragment', () => {
  test('a constructor tag builds its element, the children flat and normalised', () => {
    const [Box, Text] = [elementFn('Box'), elementFn('Text')];
    expect(h(Box, { gap: 1 }, h(Text, null, 'n = ', 3), [false, null, ['x']], undefined)).toEqual({
      type: 'Box',
      props: { gap: 1 },
      children: [{ type: 'Text', props: {}, children: ['n = ', '3'] }, 'x'],
    });
  });

  test('a string tag names an element; a name that is none is refused', () => {
    expect(h('Text', null, 'hi')).toEqual({ type: 'Text', props: {}, children: ['hi'] });
    expect(() => h('div', null)).toThrow('h: "div" is not an element');
  });

  test('a component tag is called with its props and children', () => {
    const Greeting = (props: { name: string; children?: unknown }) =>
      h('Text', null, `hello ${props.name}`, props.children);
    expect(h(Greeting, { name: 'ada' }, '!')).toEqual({
      type: 'Text',
      props: {},
      children: ['hello ada', '!'],
    });
  });

  test('Fragment is a column Box around the children', () => {
    expect(h(Fragment, null, 'a', 'b')).toEqual({
      type: 'Box',
      props: { flexDirection: 'column' },
      children: ['a', 'b'],
    });
  });
});

describe('the JSX attributes every tag takes', () => {
  test('a key on an element whose props declare none is taken and dropped, as in the sample mods', () => {
    const [Box, Text, Link] = [elementFn('Box'), elementFn('Text'), elementFn('Link')];
    const rows = ['a', 'b'].map((id) => h(Text, { key: id, bold: true }, id));
    const tree = h(Box, { key: 'list' }, rows, h(Link, { key: 'docs', href: 'https://x.dev' }));
    expect(tree).toEqual({
      type: 'Box',
      props: { key: 'list' },
      children: [
        { type: 'Text', props: { bold: true }, children: ['a'] },
        { type: 'Text', props: { bold: true }, children: ['b'] },
        { type: 'Link', props: { href: 'https://x.dev' }, children: [] },
      ],
    });
    expect(treeProblem('Pane', 'terminal', tree)).toBeUndefined();
  });

  test('a string tag and a component take a key too; children may come as a prop', () => {
    expect(h('Text', { key: 'k', children: 'hi' })).toEqual({
      type: 'Text',
      props: {},
      children: ['hi'],
    });
    const Row = (props: { key?: string; label: string }) =>
      h('Text', { key: props.key, bold: true }, props.label);
    expect(h(Row, { key: 'r', label: 'x' })).toEqual({
      type: 'Text',
      props: { bold: true },
      children: ['x'],
    });
  });

  test('a ref is no declared attribute: the tree is refused', () => {
    const tree = h('Text', { ref: 'r' }, 'x');
    expect(treeProblem('Pane', 'terminal', tree)).toBe(
      'a tree Pane refuses: Text prop "ref" is not allowed',
    );
  });
});

describe('elementNameOf', () => {
  test("names the element one of the kit's constructors builds, and nothing else", () => {
    const table = defaultElementTable('desktop');
    expect(elementNameOf(table.Box)).toBe('Box');
    expect(elementNameOf(elementFn('Markdown'))).toBe('Markdown');
    expect(elementNameOf(() => ({ type: 'Box', props: {}, children: [] }))).toBeUndefined();
    expect(elementNameOf('Box')).toBeUndefined();
  });

  test('a constructor rebuilt from its name builds the same element', () => {
    const Text = defaultElementTable('terminal').Text;
    const name = elementNameOf(Text);
    expect(name).toBe('Text');
    expect(name && elementFn(name)({ children: 'x' })).toEqual(Text?.({ children: 'x' }));
  });
});
