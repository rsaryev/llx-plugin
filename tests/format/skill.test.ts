/**
 * skills.md § Configure skills, § Frontmatter reference ("Claude Code reads the frontmatter only
 * when the opening `---` is the file's first line. Otherwise it treats the whole file, `---`
 * markers included, as skill content. If the YAML between the markers doesn't parse, the skill
 * still loads with no fields set") and § How a skill gets its command name. These tests are
 * outside spec(): the frontmatter rule has no requirement of its own, and the command name is
 * `resolveSkillName`'s (skills.frontmatter.name). How a YAML error is reported is the kit's
 * judgment (spec/judgments.md).
 */
import { describe, expect, test } from 'bun:test';
import { readSkill } from '../../src/format/skill.ts';
import { ORIGIN_TRAITS, type SkillLayout } from '../../src/format/skill-types.ts';
import { PROJECT_LAYOUT, skillFile } from '../support/skill-read.ts';

const SUMMARIZE = `---
name: summarize-changes
description: Summarizes uncommitted changes and flags anything risky. Use when the user asks what changed, wants a commit message, or asks to review their diff.
---

## Current changes

!\`git diff HEAD\`

## Instructions

Summarize the changes above in two or three bullet points.
`;

describe('readSkill', () => {
  test('the docs example: fields, body and where the file is', () => {
    const { skill, issues } = readSkill('.claude/skills/summarize-changes/SKILL.md', SUMMARIZE, {
      origin: { kind: 'project' },
      dirName: 'summarize-changes',
    });
    expect(issues).toEqual([]);
    expect(skill.kind).toBe('skill');
    expect(skill.name).toBe('summarize-changes');
    expect(skill.dir).toBe('.claude/skills/summarize-changes');
    expect(skill.path).toBe('.claude/skills/summarize-changes/SKILL.md');
    expect(skill.description?.startsWith('Summarizes uncommitted changes')).toBe(true);
    expect(skill.body.startsWith('\n## Current changes')).toBe(true);
    expect(skill.body).toContain('!`git diff HEAD`');
    expect(skill.body).not.toContain('description:');
  });

  test('a file without frontmatter is all body and loads with the defaults', () => {
    const { skill, issues } = readSkill(
      'skills/plain/SKILL.md',
      'Just\ninstructions.\n',
      PROJECT_LAYOUT,
    );
    expect(issues).toEqual([]);
    expect(skill.body).toBe('Just\ninstructions.\n');
    expect(skill.description).toBe('Just');
    expect(skill.userInvocable).toBe(true);
  });

  test('the opening `---` must be the first line: otherwise the markers are skill content', () => {
    const text = '\n---\ndisable-model-invocation: true\n---\nBody\n';
    const { skill, issues } = readSkill('skills/late/SKILL.md', text, PROJECT_LAYOUT);
    expect(issues).toEqual([]);
    expect(skill.disableModelInvocation).toBe(false);
    expect(skill.body).toBe(text);
    expect(skill.description).toBe('---');
  });

  test('YAML that does not parse: the skill loads with its body and no fields, and a warning says where', () => {
    const text =
      '---\nname: broken\ndescription: [unclosed\nallowed-tools: Read\n---\nUse this when asked.\n';
    const { skill, issues } = readSkill('skills/broken/SKILL.md', text, PROJECT_LAYOUT);
    expect(skill.body).toBe('Use this when asked.\n');
    expect(skill.name).toBe('my-skill');
    expect(skill.allowedTools).toEqual([]);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe('warning');
    expect(issues[0]?.path).toBe('skills/broken/SKILL.md');
    expect(issues[0]?.message).toMatch(
      /^frontmatter .*\(line \d+\); the skill loads with its body and no fields set$/,
    );
  });

  test('with no fields set the description is the first body line, as for an omitted one (judgment)', () => {
    const text = '---\ndescription: [unclosed\n---\nUse this when asked.\n';
    expect(readSkill('s/SKILL.md', text, PROJECT_LAYOUT).skill.description).toBe(
      'Use this when asked.',
    );
  });

  test('frontmatter that is a list or a scalar loads like a YAML error', () => {
    for (const block of ['- a\n- b', 'just text']) {
      const { skill, issues } = readSkill(
        's/SKILL.md',
        `---\n${block}\n---\nBody\n`,
        PROJECT_LAYOUT,
      );
      expect(skill.body).toBe('Body\n');
      expect(issues.map((found) => found.severity)).toEqual(['warning']);
      expect(issues[0]?.message).toContain('is a list or a single value, not a table');
    }
  });

  test('CRLF files read like LF ones', () => {
    const text = skillFile('name: crlf\ndescription: d\nallowed-tools: Read Grep').replaceAll(
      '\n',
      '\r\n',
    );
    const { skill, issues } = readSkill('s/SKILL.md', text, PROJECT_LAYOUT);
    expect(issues).toEqual([]);
    expect(skill.name).toBe('crlf');
    expect(skill.allowedTools).toEqual(['Read', 'Grep']);
  });

  test('issues name the file and the field', () => {
    const { issues } = readSkill(
      'skills/odd/SKILL.md',
      skillFile('effort: extreme\nshell: zsh'),
      PROJECT_LAYOUT,
    );
    expect(issues.map((found) => found.path)).toEqual([
      'skills/odd/SKILL.md',
      'skills/odd/SKILL.md',
    ]);
    expect(issues.map((found) => found.message.split(' ')[0])).toEqual(['effort', 'shell']);
  });

  test('never throws on any text', () => {
    for (const text of [
      '',
      '---',
      '---\n',
      '---\n---',
      '\uFEFF---\na: 1\n---\nx',
      '---\n&a [*a]\n---\n',
    ]) {
      expect(() => readSkill('s/SKILL.md', text, PROJECT_LAYOUT)).not.toThrow();
    }
  });
});

describe('the skill folder and the name (the minimum; skills.frontmatter.name refines it)', () => {
  test('the directory of the file is the skill folder, with either separator (judgment)', () => {
    expect(readSkill('skills/review/SKILL.md', 'x', PROJECT_LAYOUT).skill.dir).toBe(
      'skills/review',
    );
    expect(readSkill('C:\\p\\skills\\review\\SKILL.md', 'x', PROJECT_LAYOUT).skill.dir).toBe(
      'C:\\p\\skills\\review',
    );
    expect(readSkill('SKILL.md', 'x', PROJECT_LAYOUT).skill.dir).toBe('.');
  });

  test('`name` is the frontmatter name, else the folder name', () => {
    expect(readSkill('a/SKILL.md', skillFile('name: fancy'), PROJECT_LAYOUT).skill.name).toBe(
      'fancy',
    );
    expect(readSkill('a/SKILL.md', skillFile('description: d'), PROJECT_LAYOUT).skill.name).toBe(
      'my-skill',
    );
  });

  test('a plugin skill is typed under its plugin: /my-plugin:review, or /my-plugin:fancy with name: fancy', () => {
    const layout: SkillLayout = {
      origin: { kind: 'plugin', plugin: 'my-plugin' },
      dirName: 'review',
    };
    expect(readSkill('skills/review/SKILL.md', 'x', layout).skill.command).toBe('my-plugin:review');
    expect(
      readSkill('skills/review/SKILL.md', skillFile('name: fancy'), layout).skill.command,
    ).toBe('my-plugin:fancy');
    expect(readSkill('skills/review/SKILL.md', 'x', PROJECT_LAYOUT).skill.command).toBe('my-skill');
  });

  test('the origin travels with the skill', () => {
    const layout: SkillLayout = { origin: { kind: 'synced' }, dirName: 'deploy' };
    expect(readSkill('deploy/SKILL.md', 'x', layout).skill.origin).toEqual({ kind: 'synced' });
  });
});

describe('what an origin allows (skills.md § Available string substitutions, § synced skills)', () => {
  test('plugin variables are substituted in plugin skills only', () => {
    expect(ORIGIN_TRAITS.plugin.substitutesPluginVariables).toBe(true);
    for (const kind of ['user', 'project', 'synced'] as const) {
      expect(ORIGIN_TRAITS[kind].substitutesPluginVariables).toBe(false);
    }
  });

  test('a synced skill gets no session variables on the owner machine, every other origin does', () => {
    expect(ORIGIN_TRAITS.synced.substitutesSessionVariables).toBe(false);
    for (const kind of ['plugin', 'user', 'project'] as const) {
      expect(ORIGIN_TRAITS[kind].substitutesSessionVariables).toBe(true);
    }
  });

  test('a skill synced from claude.ai does not run `!` commands in a local session', () => {
    expect(ORIGIN_TRAITS.synced.runsShell).toBe(false);
    for (const kind of ['plugin', 'user', 'project'] as const) {
      expect(ORIGIN_TRAITS[kind].runsShell).toBe(true);
    }
  });
});
