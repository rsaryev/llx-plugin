/**
 * skills.md § Frontmatter reference (description, when_to_use, argument-hint, arguments) and
 * § Angle brackets in a skill description show as `&lt;` and `&gt;`. Each block proves what the
 * kit reads from the field; how a bad value is reported is the kit's judgment (spec/judgments.md)
 * and is tested outside spec().
 */
import { describe, expect, test } from 'bun:test';
import { escapeAngleBrackets, firstContentLine } from '../../src/format/skill-fields.ts';
import { messages, readFields } from '../support/skill-read.ts';
import { spec } from '../support/spec.ts';

spec('skills.frontmatter.description', () => {
  test('the docs example: the description is what the skill does and when to use it', () => {
    const { skill, issues } = readFields(
      'name: summarize-changes\ndescription: Summarizes uncommitted changes and flags anything risky. Use when the user asks what changed, wants a commit message, or asks to review their diff.',
      '## Current changes\n\n!`git diff HEAD`',
    );
    expect(skill.description).toBe(
      'Summarizes uncommitted changes and flags anything risky. Use when the user asks what changed, wants a commit message, or asks to review their diff.',
    );
    expect(issues).toEqual([]);
  });

  test('"If omitted, uses the first non-empty line of the markdown content"', () => {
    const { skill } = readFields(
      'name: api-conventions',
      '\n\n  \nWhen writing API endpoints:\n- Use REST',
    );
    expect(skill.description).toBe('When writing API endpoints:');
  });

  test('a description in the frontmatter wins over the body', () => {
    expect(readFields('description: From the frontmatter', 'From the body').skill.description).toBe(
      'From the frontmatter',
    );
  });

  test('a folded YAML description is one line of text', () => {
    const { skill } = readFields('description: >-\n  Deploys the app\n  to production');
    expect(skill.description).toBe('Deploys the app to production');
  });

  test('a skill with no body line and no description has none', () => {
    expect(readFields('name: empty', '').skill.description).toBeUndefined();
  });

  test('"Angle brackets in the text show as `&lt;` and `&gt;`"; square brackets display as typed', () => {
    expect(escapeAngleBrackets('Deploy <branch> to <env>')).toBe(
      'Deploy &lt;branch&gt; to &lt;env&gt;',
    );
    expect(escapeAngleBrackets('Deploy [branch]')).toBe('Deploy [branch]');
    expect(readFields('description: Deploy <branch>').skill.description).toBe('Deploy <branch>');
  });
});

describe('the first non-empty line (judgment: as written, trimmed, no Markdown stripped)', () => {
  test('keeps a heading marker and trims the line', () => {
    expect(firstContentLine('\n  # Title  \nmore')).toBe('# Title');
    expect(readFields('name: x', '# Title\ntext').skill.description).toBe('# Title');
  });

  test('reads CRLF text like LF', () => {
    expect(firstContentLine('\r\n\r\nFirst\r\nSecond')).toBe('First');
  });

  test('a blank description falls back like an omitted one', () => {
    expect(readFields('description: ""', 'Body line').skill.description).toBe('Body line');
  });

  test('a description that is not text is dropped with a warning and the body line is used', () => {
    const { skill, issues } = readFields('description: [a, b]', 'Body line');
    expect(skill.description).toBe('Body line');
    expect(messages(issues)).toEqual(['description is not text']);
  });
});

spec('skills.frontmatter.when_to_use', () => {
  test('is kept apart from the description (the listing appends it)', () => {
    const { skill } = readFields(
      'description: Reviews a diff\nwhen_to_use: When the user says "review my changes" or asks for a code review',
    );
    expect(skill.description).toBe('Reviews a diff');
    expect(skill.whenToUse).toBe(
      'When the user says "review my changes" or asks for a code review',
    );
  });

  test('"Field names use lowercase words separated by hyphens, except `when_to_use`"', () => {
    expect(readFields('when-to-use: hyphenated').skill.whenToUse).toBeUndefined();
    expect(readFields('when_to_use: underscored').skill.whenToUse).toBe('underscored');
  });

  test('without it, the description does not borrow from the body', () => {
    expect(readFields('description: d', 'Body').skill.whenToUse).toBeUndefined();
  });

  test('keeps angle brackets as written; the display escapes them like the description', () => {
    expect(readFields('when_to_use: Use on <branch>').skill.whenToUse).toBe('Use on <branch>');
  });
});

spec('skills.frontmatter.argument-hint', () => {
  test('the table examples, quoted: `[issue-number]` and `[filename] [format]`', () => {
    expect(readFields('argument-hint: "[issue-number]"').skill.argumentHint).toBe('[issue-number]');
    expect(readFields('argument-hint: "[filename] [format]"').skill.argumentHint).toBe(
      '[filename] [format]',
    );
  });

  test('the troubleshooting example: `argument-hint: <branch>` is kept as typed', () => {
    const { skill, issues } = readFields('argument-hint: <branch>');
    expect(skill.argumentHint).toBe('<branch>');
    expect(issues).toEqual([]);
  });

  test('absent means no hint', () => {
    expect(readFields('description: d').skill.argumentHint).toBeUndefined();
  });
});

describe('argument-hint written without quotes (judgment)', () => {
  test('`[issue-number]` is a YAML list: it is put back in its brackets', () => {
    expect(readFields('argument-hint: [issue-number]').skill.argumentHint).toBe('[issue-number]');
    expect(readFields('argument-hint: [filename, format]').skill.argumentHint).toBe(
      '[filename, format]',
    );
  });

  test('`[filename] [format]` is not YAML: the skill loads with no fields and says why', () => {
    const { skill, issues } = readFields(
      'argument-hint: [filename] [format]\ndescription: lost',
      'Body',
    );
    expect(skill.argumentHint).toBeUndefined();
    expect(skill.description).toBe('Body');
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe('warning');
  });

  test('an empty list is no hint', () => {
    expect(readFields('argument-hint: []').skill.argumentHint).toBeUndefined();
  });
});

spec('skills.frontmatter.arguments', () => {
  test('a space-separated string names the arguments in order', () => {
    expect(readFields('arguments: issue branch').skill.arguments).toEqual(['issue', 'branch']);
  });

  test('the docs example: a YAML list, `arguments: [issue, branch]`', () => {
    expect(readFields('arguments: [issue, branch]').skill.arguments).toEqual(['issue', 'branch']);
    expect(readFields('arguments:\n  - issue\n  - branch').skill.arguments).toEqual([
      'issue',
      'branch',
    ]);
  });

  test('"Names map to argument positions in order": the order is kept, repeats included', () => {
    expect(readFields('arguments: c a b').skill.arguments).toEqual(['c', 'a', 'b']);
  });

  test('absent declares no names', () => {
    expect(readFields('description: d').skill.arguments).toEqual([]);
  });

  test('a table where names belong is dropped with a warning', () => {
    const { skill, issues } = readFields('arguments: {a: b}');
    expect(skill.arguments).toEqual([]);
    expect(messages(issues)).toEqual([
      'arguments is not a list: use a comma-separated string or a YAML list',
    ]);
  });
});
