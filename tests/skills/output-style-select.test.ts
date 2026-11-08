/**
 * output-styles.md § Change your output style (the `outputStyle` value is case-sensitive, the
 * `/output-style` command ignores case), § Frontmatter reference (`force-for-plugin` overrides the
 * setting; the first loaded wins) and § How output styles work (`keep-coding-instructions` acts on
 * the full prompt only). Choices the docs leave open are judgments (spec/judgments.md).
 */
import { describe, expect, test } from 'bun:test';
import { readOutputStyle, type OutputStyle } from '../../src/format/output-style.ts';
import {
  includeCodingInstructions,
  listOutputStyles,
  resolveOutputStyle,
  type StyleSelection,
} from '../../src/skills/output-style-select.ts';
import { spec } from '../support/spec.ts';

const style = (path: string, text: string, plugin?: string): OutputStyle =>
  readOutputStyle(path, text, plugin === undefined ? {} : { plugin }).style;

const DIAGRAMS = style(
  'diagrams.md',
  '---\nname: Diagrams first\ndescription: Lead every explanation with a diagram\nkeep-coding-instructions: true\n---\nB',
);
const WRITER = style('writer.md', '---\ndescription: A writing assistant\n---\nWrite prose.');
const TERSE = style('terse.md', '---\nname: terse\n---\nShort.', 'my-plugin');

spec('outputStyles.frontmatter.name', () => {
  test('the outputStyle setting names a custom style exactly, by its frontmatter or file name', () => {
    expect(resolveOutputStyle({ setting: 'Diagrams first', styles: [DIAGRAMS, WRITER] }).id).toBe(
      'Diagrams first',
    );
    expect(resolveOutputStyle({ setting: 'writer', styles: [DIAGRAMS, WRITER] }).style).toBe(
      WRITER,
    );
  });

  test('a plugin style is selected as <plugin>:<name>, not by its bare name', () => {
    expect(resolveOutputStyle({ setting: 'my-plugin:terse', styles: [TERSE] }).style).toBe(TERSE);
    expect(resolveOutputStyle({ setting: 'terse', styles: [TERSE] }).id).toBe('default');
    expect(resolveOutputStyle({ command: 'My-Plugin:Terse', styles: [TERSE] }).style).toBe(TERSE);
  });
});

spec('outputStyles.frontmatter.description', () => {
  test('the picker lists each custom style by its name with its description', () => {
    const rows = listOutputStyles([DIAGRAMS, WRITER, TERSE], resolveOutputStyle({ styles: [] }));
    const custom = rows.filter(
      (row) => !['default', 'Proactive', 'Concise', 'Explanatory', 'Learning'].includes(row.id),
    );
    expect(custom).toEqual([
      {
        id: 'Diagrams first',
        name: 'Diagrams first',
        description: 'Lead every explanation with a diagram',
        current: false,
      },
      { id: 'writer', name: 'writer', description: 'A writing assistant', current: false },
      { id: 'my-plugin:terse', name: 'terse', current: false },
    ]);
  });
});

const full = (selection: StyleSelection) => includeCodingInstructions(selection, 'full');

const forced = (plugin: string, name: string) =>
  style(`${name}.md`, `---\nforce-for-plugin: true\n---\n${name}`, plugin);

spec('outputStyles.frontmatter.keep-coding-instructions', () => {
  test('on the full prompt a custom style leaves out the coding instructions unless kept', () => {
    expect(full(resolveOutputStyle({ setting: 'writer', styles: [WRITER] }))).toBe(false);
    expect(full(resolveOutputStyle({ setting: 'Diagrams first', styles: [DIAGRAMS] }))).toBe(true);
  });

  test('Default and the four built-in styles keep them', () => {
    expect(full(resolveOutputStyle({ styles: [] }))).toBe(true);
    for (const name of ['Proactive', 'Concise', 'Explanatory', 'Learning']) {
      expect(full(resolveOutputStyle({ setting: name, styles: [] }))).toBe(true);
    }
  });

  test('the shorter system prompt has no such section: the field has no effect there', () => {
    for (const only of [WRITER, DIAGRAMS]) {
      const selection = resolveOutputStyle({ setting: only.id, styles: [only] });
      expect(includeCodingInstructions(selection, 'short')).toBe(false);
    }
    expect(includeCodingInstructions(resolveOutputStyle({ styles: [] }), 'short')).toBe(false);
  });
});

spec('outputStyles.frontmatter.force-for-plugin', () => {
  test('a forced plugin style overrides the outputStyle setting', () => {
    const house = forced('acme', 'house');
    expect(resolveOutputStyle({ setting: 'Concise', styles: [house, WRITER] }).style).toBe(house);
    expect(resolveOutputStyle({ setting: 'writer', styles: [WRITER, house] }).style).toBe(house);
    expect(resolveOutputStyle({ styles: [house] }).id).toBe('acme:house');
  });

  test('when several enabled plugins set it, the first loaded is used', () => {
    const first = forced('one', 'a');
    const second = forced('two', 'b');
    expect(resolveOutputStyle({ styles: [first, second] }).style).toBe(first);
    expect(resolveOutputStyle({ styles: [second, first] }).style).toBe(second);
  });

  test('a style that is not forced, or not from a plugin, never overrides the setting', () => {
    const notPlugin = style('x.md', '---\nforce-for-plugin: true\n---\nX');
    expect(resolveOutputStyle({ setting: 'Concise', styles: [notPlugin, TERSE] }).id).toBe(
      'Concise',
    );
  });

  test('a forced style keeps its own keep-coding-instructions', () => {
    const house = forced('acme', 'house');
    expect(includeCodingInstructions(resolveOutputStyle({ styles: [house] }), 'full')).toBe(false);
  });
});

describe('the outputStyle setting and the /output-style command', () => {
  test('the setting is case-sensitive: `explanatory` gives Default', () => {
    expect(resolveOutputStyle({ setting: 'Explanatory', styles: [] }).id).toBe('Explanatory');
    expect(resolveOutputStyle({ setting: 'explanatory', styles: [] }).id).toBe('default');
    expect(resolveOutputStyle({ setting: 'diagrams first', styles: [DIAGRAMS] }).id).toBe(
      'default',
    );
    expect(resolveOutputStyle({ setting: 'Nonexistent', styles: [] }).id).toBe('default');
    expect(resolveOutputStyle({ styles: [] }).id).toBe('default');
  });

  test('the command ignores case', () => {
    expect(resolveOutputStyle({ command: 'concise', styles: [] }).id).toBe('Concise');
    expect(resolveOutputStyle({ command: 'LEARNING', styles: [] }).id).toBe('Learning');
    expect(resolveOutputStyle({ command: 'diagrams FIRST', styles: [DIAGRAMS] }).style).toBe(
      DIAGRAMS,
    );
    expect(resolveOutputStyle({ command: 'Default', setting: 'Concise', styles: [] }).id).toBe(
      'default',
    );
  });

  test('the list always has Default, then the four built-in styles, and marks the current one', () => {
    const rows = listOutputStyles([], resolveOutputStyle({ setting: 'Concise', styles: [] }));
    expect(rows.map((row) => row.id)).toEqual([
      'default',
      'Proactive',
      'Concise',
      'Explanatory',
      'Learning',
    ]);
    expect(rows.filter((row) => row.current).map((row) => row.id)).toEqual(['Concise']);
  });
});

describe('judgments (spec/judgments.md)', () => {
  test('a command that matches no style leaves the setting in force', () => {
    expect(resolveOutputStyle({ command: 'nope', setting: 'Concise', styles: [] }).id).toBe(
      'Concise',
    );
  });

  test('the command wins over the setting', () => {
    expect(resolveOutputStyle({ command: 'learning', setting: 'Concise', styles: [] }).id).toBe(
      'Learning',
    );
  });

  test('a forced style also wins over the command, which only writes the setting', () => {
    const house = style('h.md', '---\nforce-for-plugin: true\n---\nH', 'acme');
    expect(resolveOutputStyle({ command: 'concise', styles: [house] }).style).toBe(house);
  });

  test('of two styles with one id the first in the list wins; a built-in name is not shadowed', () => {
    const near = style('s.md', '---\nname: shared\n---\nnear');
    const far = style('s.md', '---\nname: shared\n---\nfar');
    expect(resolveOutputStyle({ setting: 'shared', styles: [near, far] }).style).toBe(near);
    const shadow = style('c.md', '---\nname: Concise\n---\nmine');
    expect(resolveOutputStyle({ setting: 'Concise', styles: [shadow] }).style).toBeUndefined();
  });
});
