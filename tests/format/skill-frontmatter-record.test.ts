/**
 * The frontmatter of a skill or command as the YAML parsed it (`InvocableFrontmatter.frontmatter`).
 * skills.md, "Frontmatter reference": "Claude Code ignores a field it doesn't recognize without
 * reporting an error", and "If the YAML between the markers doesn't parse, the skill still loads with
 * no fields set". The kit gives no meaning to a key it does not know; it keeps the record so a host
 * with its own key (`keywords:`) needs no second parse. Exposing the record is a judgment
 * (spec/judgments.md), tested outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import { readCommand, readCommandEntry } from '../../src/format/command.ts';
import { readFields, skillFile } from '../support/skill-read.ts';

describe('the frontmatter record of a skill', () => {
  test('every key as parsed, an unknown one included, with no issue and no typed field changed', () => {
    const { skill, issues } = readFields(
      ['description: Ship it', 'keywords: [deploy, release]', 'Description: other'].join('\n'),
    );
    expect(skill.frontmatter).toEqual({
      description: 'Ship it',
      keywords: ['deploy', 'release'],
      Description: 'other',
    });
    expect(issues).toEqual([]);
    expect(skill.description).toBe('Ship it');
    expect(Object.keys(skill)).not.toContain('keywords');
  });

  test('values stay as written: no default and no reading applied', () => {
    const { skill } = readFields('user-invocable: no\nallowed-tools: Read Grep');
    expect(skill.frontmatter).toEqual({ 'user-invocable': 'no', 'allowed-tools': 'Read Grep' });
    expect(skill.userInvocable).toBe(false);
    expect(skill.allowedTools).toEqual(['Read', 'Grep']);
  });

  test('a YAML block that does not parse is an empty record, as "no fields set"', () => {
    expect(readFields('description: "unclosed').skill.frontmatter).toEqual({});
  });
});

describe('the frontmatter record of a command', () => {
  test('a command file keeps `name` and `paths` in the record though it does not take them', () => {
    const text = skillFile('name: other\npaths: src/**\nkeywords: db');
    const { command } = readCommand('/c/db.md', text, {
      origin: { kind: 'project' },
      relativePath: 'db.md',
    });
    expect(command?.frontmatter).toEqual({ name: 'other', paths: 'src/**', keywords: 'db' });
    expect(command?.name).toBe('db');
    expect(command?.paths).toEqual([]);
  });

  test('a manifest entry with inline content has no frontmatter', () => {
    const { command } = readCommandEntry(
      'hello',
      { content: 'Say hello.', description: 'Greets' },
      undefined,
      { origin: { kind: 'plugin', plugin: 'kit' } },
    );
    expect(command?.frontmatter).toEqual({});
  });
});
