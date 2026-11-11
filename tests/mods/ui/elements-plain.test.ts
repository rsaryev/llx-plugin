/**
 * Judgment (spec/judgments.md, `src/mods/ui/elements/plain.ts`): a drawn tree splits into plain
 * data and its controls' callbacks by key, and joins back. plugins/mods/interface.md, "Which
 * controls need a `key`" (a `Button` without a `key` is addressed by its `label` or single string
 * child); test.md, "Test a drawing" (`{ type, props, children }`).
 */
import { describe, expect, test } from 'bun:test';
import {
  joinHandlers,
  splitHandlers,
  type ElementNode,
} from '../../../src/mods/ui/elements/index.ts';

const press = (): string => 'pressed';
const submit = (value: string): string => `sent ${value}`;
const node = (
  type: ElementNode['type'],
  props: ElementNode['props'],
  children: ElementNode['children'] = [],
): ElementNode => ({
  type,
  props,
  children,
});

const TREE = node('Box', { flexDirection: 'column' }, [
  node('Text', {}, ['Count: 1']),
  node('Button', { onPress: press }, ['Add one']),
  node('Input', { key: 'name', onSubmit: submit, placeholder: 'Name' }),
  node('Box', { onPress: press }),
  { type: 'engine', ref: { opaque: true } },
]);

describe('splitHandlers and joinHandlers', () => {
  test('the tree becomes JSON, with each callback under its control key', () => {
    const { tree, handlers } = splitHandlers(TREE);
    expect(JSON.parse(JSON.stringify(tree))).toEqual(tree);
    expect(tree.children[1]).toEqual(node('Button', {}, ['Add one']));
    expect(tree.children[2]).toEqual(node('Input', { key: 'name', placeholder: 'Name' }));
    expect([...handlers.keys()]).toEqual(['Add one', 'name']);
    expect(handlers.get('name')).toEqual({ onSubmit: submit });
  });

  test('joining puts each callback back; one of an element with no key is gone', () => {
    const { tree, handlers } = splitHandlers(TREE);
    const joined = joinHandlers(JSON.parse(JSON.stringify(tree)), handlers);
    expect(joined.children.slice(0, 3)).toEqual(TREE.children.slice(0, 3));
    expect(joined.children[3]).toEqual(node('Box', {}));
    expect(joined.children[4]).toEqual({ type: 'engine', ref: { opaque: true } });
  });
});
