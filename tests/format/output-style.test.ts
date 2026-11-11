/**
 * output-styles.md § Frontmatter reference (name, description, keep-coding-instructions,
 * force-for-plugin) and § Create a custom output style; plugins/components.md § Output styles
 * (`<plugin>:<name>`). How a bad value or a YAML error is reported is the kit's judgment
 * (spec/judgments.md) and is tested outside spec().
 */
import { describe, expect, test } from 'bun:test';
import { readOutputStyle } from '../../src/format/output-style.ts';
import { spec } from '../support/spec.ts';

const DIAGRAMS = `---
name: Diagrams first
description: Lead every explanation with a diagram
keep-coding-instructions: true
---

When explaining code, architecture, or data flow, start with a Mermaid diagram showing the structure, then explain in prose.

## Diagram conventions

Use \`flowchart TD\` for control flow and \`sequenceDiagram\` for request paths. Keep diagrams under 15 nodes.
`;

const TERSE = `---
name: terse
description: Answer in as few words as possible
keep-coding-instructions: true
---

Keep every reply short. Skip preambles and summaries.
`;

spec('outputStyles.frontmatter.name', () => {
  test('the docs example: the name comes from the frontmatter, the body is the instructions', () => {
    const { style, issues } = readOutputStyle('.claude/output-styles/diagrams.md', DIAGRAMS);
    expect(style.name).toBe('Diagrams first');
    expect(style.id).toBe('Diagrams first');
    expect(style.instructions.startsWith('When explaining code, architecture')).toBe(true);
    expect(style.instructions.endsWith('under 15 nodes.')).toBe(true);
    expect(issues).toEqual([]);
  });

  test('the file name is the name when `name` is not set', () => {
    for (const path of [
      '~/.claude/output-styles/review.md',
      'output-styles/review.md',
      'C:\\Users\\me\\.claude\\output-styles\\review.md',
      'review.md',
    ]) {
      expect(readOutputStyle(path, '---\ndescription: d\n---\nBody').style.name).toBe('review');
    }
    expect(readOutputStyle('review.md', 'No frontmatter at all').style.name).toBe('review');
  });

  test('a plugin style is offered as <plugin>:<name> (the docs example: file name and name agree)', () => {
    const declared = readOutputStyle('output-styles/terse.md', TERSE, { plugin: 'my-plugin' });
    expect(declared.style.name).toBe('terse');
    expect(declared.style.id).toBe('my-plugin:terse');
    const byFile = readOutputStyle('output-styles/brief.md', 'Be brief.', { plugin: 'my-plugin' });
    expect(byFile.style.id).toBe('my-plugin:brief');
  });

  test('a user, project or managed style is not prefixed', () => {
    expect(readOutputStyle('output-styles/terse.md', TERSE).style.id).toBe('terse');
  });

  test('YAML that does not parse: the style still loads under its file name with no fields set', () => {
    const text = '---\nname: "unclosed\nkeep-coding-instructions: true\n---\nStay formal.';
    const { style } = readOutputStyle('output-styles/formal.md', text, { plugin: 'p' });
    expect(style.name).toBe('formal');
    expect(style.id).toBe('p:formal');
    expect(style.description).toBeUndefined();
    expect(style.keepCodingInstructions).toBe(false);
    expect(style.forceForPlugin).toBe(false);
    expect(style.instructions).toBe('Stay formal.');
  });

  test('a misspelled field is ignored without an error', () => {
    const { style, issues } = readOutputStyle(
      'output-styles/x.md',
      '---\nnmae: Wrong\nDescription: nope\n---\nBody',
    );
    expect(style.name).toBe('x');
    expect(style.description).toBeUndefined();
    expect(issues).toEqual([]);
  });
});

spec('outputStyles.frontmatter.description', () => {
  test('is read from the frontmatter; it is optional', () => {
    expect(readOutputStyle('a.md', DIAGRAMS).style.description).toBe(
      'Lead every explanation with a diagram',
    );
    expect(readOutputStyle('a.md', 'Body only').style.description).toBeUndefined();
    expect(readOutputStyle('a.md', '---\nname: a\n---\nBody').style.description).toBeUndefined();
  });

  test('the body is not borrowed as a description', () => {
    expect(
      readOutputStyle('a.md', '---\nname: a\n---\nFirst line').style.description,
    ).toBeUndefined();
  });
});

spec('outputStyles.frontmatter.keep-coding-instructions', () => {
  test('defaults to false; true keeps the coding instructions', () => {
    expect(readOutputStyle('a.md', 'Body').style.keepCodingInstructions).toBe(false);
    expect(readOutputStyle('a.md', '---\nname: a\n---\nBody').style.keepCodingInstructions).toBe(
      false,
    );
    expect(readOutputStyle('a.md', DIAGRAMS).style.keepCodingInstructions).toBe(true);
    expect(
      readOutputStyle('a.md', '---\nkeep-coding-instructions: false\n---\nB').style
        .keepCodingInstructions,
    ).toBe(false);
  });
});

spec('outputStyles.frontmatter.force-for-plugin', () => {
  const FORCED = '---\nforce-for-plugin: true\n---\nAlways on.';

  test('a plugin style sets it; the default is false', () => {
    expect(readOutputStyle('s.md', FORCED, { plugin: 'p' }).style.forceForPlugin).toBe(true);
    expect(readOutputStyle('s.md', TERSE, { plugin: 'p' }).style.forceForPlugin).toBe(false);
    expect(readOutputStyle('s.md', 'Body', { plugin: 'p' }).style.forceForPlugin).toBe(false);
  });

  test('"Plugin output styles only": a user, project or managed style never forces itself', () => {
    expect(readOutputStyle('s.md', FORCED).style.forceForPlugin).toBe(false);
  });

  test('a misspelled key forces nothing', () => {
    const text = '---\nforce-for-plugins: true\nforce_for_plugin: true\n---\nB';
    expect(readOutputStyle('s.md', text, { plugin: 'p' }).style.forceForPlugin).toBe(false);
  });
});

describe('judgments (spec/judgments.md)', () => {
  test('a YAML error is a warning that names the file, the line and the parse error', () => {
    const { issues } = readOutputStyle('output-styles/bad.md', '---\na: 1\nb: "c\n---\nB');
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe('warning');
    expect(issues[0]?.path).toBe('output-styles/bad.md');
    expect(issues[0]?.message).toContain('line 3');
    expect(issues[0]?.message).toContain('Missing closing "quote');
  });

  test('a flag that is not a flag is dropped with a warning and reads as the default', () => {
    const { style, issues } = readOutputStyle(
      's.md',
      '---\nkeep-coding-instructions: maybe\nforce-for-plugin: [x]\n---\nB',
      { plugin: 'p' },
    );
    expect(style.keepCodingInstructions).toBe(false);
    expect(style.forceForPlugin).toBe(false);
    expect(issues.map((issue) => issue.severity)).toEqual(['warning', 'warning']);
    expect(issues[0]?.message).toStartWith('keep-coding-instructions ');
  });

  test('a name or description that is not text falls back; the instructions are trimmed', () => {
    const { style, issues } = readOutputStyle(
      's.md',
      '---\nname: [a]\ndescription: {}\n---\n\n\n  Body \n\n',
    );
    expect(style.name).toBe('s');
    expect(style.description).toBeUndefined();
    expect(style.instructions).toBe('Body');
    expect(issues).toHaveLength(2);
  });

  test('a number is a name; a blank name falls back to the file name', () => {
    expect(readOutputStyle('s.md', '---\nname: 42\n---\nB').style.name).toBe('42');
    expect(readOutputStyle('s.md', '---\nname: "  "\n---\nB').style.name).toBe('s');
  });

  test('a plugin style whose declared name differs from its file name is `<plugin>:<declared name>`', () => {
    const { style } = readOutputStyle('output-styles/diagrams.md', DIAGRAMS, {
      plugin: 'my-plugin',
    });
    expect(style.name).toBe('Diagrams first');
    expect(style.id).toBe('my-plugin:Diagrams first');
  });

  // skills.md § Frontmatter reference documents these spellings for skills only; output-styles.md
  // says just "Set to `true`". The kit reuses the skill coercion for output styles.
  test('keep-coding-instructions reuses the skill flag spellings, true and false, in any case', () => {
    for (const spelling of ['true', 'yes', 'on', '1', 'True', 'YES', 'On']) {
      const text = `---\nkeep-coding-instructions: ${spelling}\n---\nB`;
      expect(readOutputStyle('a.md', text).style.keepCodingInstructions).toBe(true);
    }
    for (const spelling of ['false', 'no', 'off', '0', 'False', 'NO', 'Off']) {
      const text = `---\nkeep-coding-instructions: ${spelling}\n---\nB`;
      const { style, issues } = readOutputStyle('a.md', text);
      expect(style.keepCodingInstructions).toBe(false);
      expect(issues).toEqual([]);
    }
  });
});
