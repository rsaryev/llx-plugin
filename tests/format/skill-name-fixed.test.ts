/**
 * A skill whose folder name is final (oracle 2.1.319, spec/judgments.md; docs/SPEC.md, "Where
 * Claude Code differs from its docs"): plugins/components.md, "Skills" says a frontmatter `name`
 * replaces the folder in the last segment; a session names a skill a scan finds after its folder,
 * so the host's catalog sets `SkillLayout.fixedName`. Outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import { readSkill } from '../../src/format/skill.ts';
import { resolveSkillName } from '../../src/format/skill-name.ts';
import type { SkillLayout } from '../../src/format/skill-types.ts';
import { skillFile } from '../support/skill-read.ts';

const fixed = (dirName: string): SkillLayout => ({
  origin: { kind: 'plugin', plugin: 'my-plugin' },
  dirName,
  fixedName: true,
});

describe('SkillLayout.fixedName', () => {
  test('a frontmatter `name` renames nothing', () => {
    expect(resolveSkillName(fixed('review'), 'fancy')).toMatchObject({
      name: 'review',
      command: 'my-plugin:review',
      issues: [],
    });
    const read = readSkill('skills/review/SKILL.md', skillFile('name: fancy'), fixed('review'));
    expect(read.skill.command).toBe('my-plugin:review');
  });

  test('an invalid `name` is not read, so it is not reported', () => {
    expect(resolveSkillName(fixed('review'), 'a​b').issues).toEqual([]);
  });
});
