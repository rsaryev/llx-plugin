/**
 * output-styles.md § How output styles work, § Create a custom output style and § Frontmatter.
 * The host owns its actual private system prompt; the kit applies the artifact's instructions and
 * keep-coding-instructions rule to the prompt parts the host supplies.
 */
import { expect, test } from 'bun:test';
import { readOutputStyle } from '../../src/format/output-style.ts';
import { outputStyleSystem, resolveOutputStyle } from '../../src/format/index.ts';
import { spec } from '../support/spec.ts';

const base = { general: ['General instructions'], coding: ['Coding-specific instructions'] };
const styleOf = (path: string, keep = false) =>
  readOutputStyle(
    path,
    `---\nname: Review\ndescription: A careful reviewer\nkeep-coding-instructions: ${keep}\n---\nReview before answering.`,
  ).style;

spec('outputStyles.behavior.Create a custom output style', () => {
  test('a user or project Markdown style supplies metadata and instructions, not a built-in style', () => {
    for (const path of ['~/.claude/output-styles/review.md', '.claude/output-styles/review.md']) {
      const style = styleOf(path);
      const selection = resolveOutputStyle({ styles: [style], setting: 'Review' });
      expect(selection.style).toMatchObject({
        name: 'Review',
        description: 'A careful reviewer',
        instructions: 'Review before answering.',
        keepCodingInstructions: false,
      });
    }
  });
});

spec('outputStyles.behavior.How output styles work', () => {
  test('a custom style replaces coding instructions, preserves other instructions and applies every request', () => {
    const selection = resolveOutputStyle({ styles: [styleOf('review.md')], setting: 'Review' });
    for (let request = 0; request < 2; request += 1) {
      expect(outputStyleSystem(selection, base)).toEqual([
        'General instructions',
        'Review before answering.',
      ]);
    }
    expect(base.coding).toEqual(['Coding-specific instructions']);
  });

  test('keep-coding-instructions opts back in; no selected custom style preserves the defaults', () => {
    const selection = resolveOutputStyle({
      styles: [styleOf('review.md', true)],
      setting: 'Review',
    });
    expect(outputStyleSystem(selection, base)).toEqual([
      'General instructions',
      'Coding-specific instructions',
      'Review before answering.',
    ]);
    expect(outputStyleSystem(resolveOutputStyle({ styles: [] }), base)).toEqual([
      'General instructions',
      'Coding-specific instructions',
    ]);
  });

  test('keep-coding-instructions has no effect on a short prompt without a coding section', () => {
    for (const keep of [false, true]) {
      const selection = resolveOutputStyle({
        styles: [styleOf('review.md', keep)],
        setting: 'Review',
      });
      expect(outputStyleSystem(selection, { ...base, promptKind: 'short' })).toEqual([
        'General instructions',
        'Review before answering.',
      ]);
    }
  });
});
