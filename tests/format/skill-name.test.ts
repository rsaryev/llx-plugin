/**
 * skills.md § Frontmatter reference (`name`), § How a skill gets its command name and
 * § Characters a skill name can't hold; plugins/components.md § Skills (a single skill at the
 * plugin root). What the docs leave open (what a refused frontmatter `name` in a plugin falls back
 * to, how a run of blanks turns into hyphens, a bare plugin-root name) is tested outside spec().
 */
import { describe, expect, test } from 'bun:test';
import { blocksLoading } from '../../src/format/issues.ts';
import { readSkill } from '../../src/format/skill.ts';
import { resolveSkillName } from '../../src/format/skill-name.ts';
import type { SkillLayout } from '../../src/format/skill-types.ts';
import { skillFile } from '../support/skill-read.ts';
import { spec } from '../support/spec.ts';

const project = (dirName: string): SkillLayout => ({ origin: { kind: 'project' }, dirName });
const user = (dirName: string): SkillLayout => ({ origin: { kind: 'user' }, dirName });
const plugin = (dirName: string): SkillLayout => ({
  origin: { kind: 'plugin', plugin: 'my-plugin' },
  dirName,
});
const pluginRoot = (dirName: string): SkillLayout => ({
  origin: { kind: 'plugin', plugin: 'my-plugin', rootSkill: true },
  dirName,
});
const namedAnthropicSkills = (dirName: string): SkillLayout => ({
  origin: { kind: 'plugin', plugin: 'anthropic-skills' },
  dirName,
});
const synced = (dirName: string): SkillLayout => ({ origin: { kind: 'synced' }, dirName });

/** One character of each kind the docs name, written as escapes so the file stays readable. */
const REFUSED: readonly (readonly [string, string])[] = [
  ['a zero-width space', 'a\u200Bb'],
  ['a zero-width joiner', 'a\u200Db'],
  ['a control character', 'a\u0007b'],
  ['a tab', 'a\tb'],
  ['a private-use glyph from an icon font', 'a\uE000b'],
  ['an unassigned character', 'a\u0378b'],
  ['a right-to-left override', 'a\u202Eb'],
  ['a bidi isolate', 'a\u2066b'],
  ['a no-break space', 'a\u00A0b'],
  ['an ideographic space', 'a\u3000b'],
  ['two spaces in a row', 'a  b'],
  ['a space at the start', ' ab'],
  ['a space at the end', 'ab '],
  ['an opening angle bracket', 'a<b'],
  ['a closing angle bracket', 'a>b'],
];

const errors = (layout: SkillLayout, declared?: string) =>
  resolveSkillName(layout, declared).issues.filter((found) => found.severity === 'error');

describe('resolveSkillName', () => {
  spec('skills.frontmatter.name', () => {
    test('a personal or project skill directory: the directory name, or `name` when set', () => {
      // The docs' own examples: `.claude/skills/deploy-staging/SKILL.md` -> `/deploy-staging`,
      // or `/deploy` with `name: deploy`.
      expect(resolveSkillName(project('deploy-staging'), undefined)).toMatchObject({
        name: 'deploy-staging',
        command: 'deploy-staging',
        issues: [],
      });
      expect(resolveSkillName(project('deploy-staging'), 'deploy')).toMatchObject({
        name: 'deploy',
        command: 'deploy',
        issues: [],
      });
      expect(resolveSkillName(user('deploy-staging'), 'deploy').command).toBe('deploy');
    });

    test('a plugin skill: `name` replaces the directory in the last segment, the prefix stays', () => {
      expect(resolveSkillName(plugin('review'), undefined).command).toBe('my-plugin:review');
      expect(resolveSkillName(plugin('review'), 'fancy')).toMatchObject({
        name: 'fancy',
        command: 'my-plugin:fancy',
        issues: [],
      });
    });

    test('a `name` that already starts with the plugin prefix is not prefixed again', () => {
      expect(resolveSkillName(plugin('review'), 'my-plugin:fancy').command).toBe('my-plugin:fancy');
      // Only the plugin's own prefix is recognised: another plugin's stays part of the segment.
      expect(resolveSkillName(plugin('review'), 'other:fancy').command).toBe(
        'my-plugin:other:fancy',
      );
      // `my-plugin-x:` is not `my-plugin:`.
      expect(resolveSkillName(plugin('review'), 'my-plugin-x:fancy').command).toBe(
        'my-plugin:my-plugin-x:fancy',
      );
    });

    test('a plugin-root SKILL.md: `name` is the whole final segment, else the plugin directory name', () => {
      // The docs' own example: `my-plugin/SKILL.md` with `name: review` is `/my-plugin:review`.
      // For a root skill `dirName` is the plugin directory (the caller's job, spec/judgments.md).
      expect(resolveSkillName(pluginRoot('my-plugin'), 'review')).toMatchObject({
        name: 'review',
        command: 'my-plugin:review',
        issues: [],
      });
      // With no `name` the plugin directory names the skill ("the plugin directory name as a
      // fallback").
      expect(resolveSkillName(pluginRoot('my-plugin-dir'), undefined)).toMatchObject({
        name: 'my-plugin-dir',
        command: 'my-plugin:my-plugin-dir',
      });
    });

    test('a skill synced from claude.ai is prefixed `anthropic-skills:`', () => {
      expect(resolveSkillName(synced('deploy'), undefined).command).toBe('anthropic-skills:deploy');
    });

    test('outside a plugin `anthropic-skills` and `anthropic-skills:<name>` are reserved and never load', () => {
      // skills.md, "Names reserved for synced skills": a skill folder or a frontmatter `name`.
      for (const layout of [project('ok'), user('ok'), synced('ok')]) {
        for (const name of ['anthropic-skills', 'anthropic-skills:pdf']) {
          expect(errors(layout, name)).toHaveLength(1);
          expect(blocksLoading(errors(layout, name))).toBe(true);
        }
      }
      for (const layout of [project, user, synced]) {
        for (const folder of ['anthropic-skills', 'anthropic-skills:pdf']) {
          expect(errors(layout(folder))).toHaveLength(1);
          expect(errors(layout(folder), 'ok')).toHaveLength(1);
        }
      }
      // Only the whole name or the namespace is reserved.
      expect(errors(project('anthropic-skillset'), 'anthropic-skills-x')).toEqual([]);
      expect(errors(project('anthropic'), 'anthropic:pdf')).toEqual([]);
    });

    test('a plugin named `anthropic-skills`, and a plugin skill with that name, still load', () => {
      expect(resolveSkillName(namedAnthropicSkills('review'), undefined)).toMatchObject({
        command: 'anthropic-skills:review',
        issues: [],
      });
      expect(blocksLoading(resolveSkillName(plugin('anthropic-skills'), undefined).issues)).toBe(
        false,
      );
      expect(errors(plugin('review'), 'anthropic-skills:pdf')).toEqual([]);
    });

    test('a user or project folder named `synced`, in any capitalization, does not load', () => {
      for (const folder of ['synced', 'Synced', 'SYNCED']) {
        expect(errors(project(folder))).toHaveLength(1);
        expect(errors(user(folder), 'ok')).toHaveLength(1);
      }
      expect(errors(project('synced-notes'))).toEqual([]);
      // The folder rule is about the folder: a frontmatter `name: synced` is an ordinary name.
      expect(errors(project('ok'), 'synced')).toEqual([]);
      // A plugin skill folder named `synced` loads: the docs reserve it outside plugins only.
      expect(errors(plugin('synced'))).toEqual([]);
    });

    test.each(REFUSED)('outside a plugin a frontmatter name with %s is refused', (_kind, name) => {
      for (const layout of [project('ok'), user('ok'), synced('ok')]) {
        const found = errors(layout, name);
        expect(found).toHaveLength(1);
        expect(blocksLoading(found)).toBe(true);
      }
    });

    test.each(REFUSED)('outside a plugin a folder name with %s is refused', (_kind, folder) => {
      expect(errors(project(folder))).toHaveLength(1);
      expect(errors(user(folder))).toHaveLength(1);
      // The folder alone refuses the skill, whatever valid `name` it declares.
      expect(errors(project(folder), 'ok')).toHaveLength(1);
      expect(errors(user(folder), 'ok')).toHaveLength(1);
    });

    test('ordinary names are accepted: one plain space between words, hyphens, any script, emoji', () => {
      for (const name of [
        'my skill',
        'my-skill',
        'déploy',
        '部署',
        'deploy_2',
        'a:b',
        '🚀 launch',
      ]) {
        expect(errors(project('ok'), name)).toEqual([]);
        expect(errors(project(name))).toEqual([]);
      }
    });

    test('in a plugin skill folder a refused character becomes a hyphen and the skill still loads', () => {
      const found = resolveSkillName(plugin('my\u200Bskill'), undefined);
      expect(found.command).toBe('my-plugin:my-skill');
      expect(blocksLoading(found.issues)).toBe(false);
      expect(resolveSkillName(plugin('a<b>c'), undefined).command).toBe('my-plugin:a-b-c');
      expect(resolveSkillName(plugin('a\u00A0b'), undefined).command).toBe('my-plugin:a-b');
      expect(resolveSkillName(plugin('a\u202Eb'), undefined).command).toBe('my-plugin:a-b');
      // The same for a plugin-root skill that takes its name from the plugin directory.
      expect(resolveSkillName(pluginRoot('a\u200Bb'), undefined).command).toBe('my-plugin:a-b');
    });

    test('in a plugin skill a refused frontmatter name does not load as that name', () => {
      // "the `/` menu doesn't show the `name` value and typing it doesn't invoke the skill"; the
      // skill still loads, so there is no error.
      const found = resolveSkillName(plugin('review'), 'fa\u200Bncy');
      expect(blocksLoading(found.issues)).toBe(false);
      expect(found).toMatchObject({ name: 'review', command: 'my-plugin:review' });
    });
  });

  describe('judgments (spec/judgments.md)', () => {
    test('a refused frontmatter name in a plugin skill falls back to the folder name, with a warning', () => {
      const found = resolveSkillName(plugin('review'), 'fa\u200Bncy');
      expect(found).toMatchObject({ name: 'review', command: 'my-plugin:review' });
      expect(found.issues.map((issue) => issue.severity)).toEqual(['warning']);
      expect(found.issues[0]?.path).toBe('name');
    });

    test('every character of a run of blanks becomes a hyphen; a lone inner space stays', () => {
      expect(resolveSkillName(plugin('a  b'), undefined).command).toBe('my-plugin:a--b');
      expect(resolveSkillName(plugin(' ab '), undefined).command).toBe('my-plugin:-ab-');
      expect(resolveSkillName(plugin('a b'), undefined).command).toBe('my-plugin:a b');
    });

    test('an issue names the field and the refused character, and a hyphenated folder is a warning', () => {
      const [issue] = resolveSkillName(project('ok'), 'a\u200Bb').issues;
      expect(issue).toMatchObject({ severity: 'error', path: 'name' });
      expect(issue?.message).toContain('U+200B');
      const [folder] = resolveSkillName(plugin('a<b'), undefined).issues;
      expect(folder).toMatchObject({ severity: 'warning', path: 'folder' });
      expect(folder?.message).toContain('a-b');
    });

    test('a refused name still returns the name as written, for the host to report', () => {
      expect(resolveSkillName(project('ok'), 'a<b')).toMatchObject({
        name: 'a<b',
        command: 'a<b',
      });
    });

    test('an empty final segment is not refused: a trailing colon and an empty name are kept as written', () => {
      expect(resolveSkillName(plugin('review'), 'my-plugin:')).toMatchObject({
        name: 'my-plugin:',
        command: 'my-plugin:',
        issues: [],
      });
      // `readSkill` reads `name: ''` as no name, so the folder names the skill.
      const read = readSkill('s/SKILL.md', skillFile("name: ''"), project('r'));
      expect(read.skill.name).toBe('r');
      expect(read.issues).toEqual([]);
    });

    test('`rootSkill` changes nothing: the caller passes the plugin directory as `dirName`', () => {
      expect(resolveSkillName(pluginRoot('review'), undefined)).toEqual(
        resolveSkillName(plugin('review'), undefined),
      );
    });

    test('a Unicode format character outside the documented ones (a soft hyphen) is refused too', () => {
      expect(errors(project('ok'), 'a\u00ADb')).toHaveLength(1);
    });
  });
});

describe('readSkill with the name rules', () => {
  test('a skill whose project folder name is refused reports an error naming the file', () => {
    const { issues } = readSkill('.claude/skills/a<b/SKILL.md', 'x', project('a<b'));
    expect(blocksLoading(issues)).toBe(true);
    expect(issues[0]?.path).toBe('.claude/skills/a<b/SKILL.md');
    // The field is named once: `folder name has ...`, not `folder folder name has ...`.
    expect(issues[0]?.message).toMatch(
      /^folder name has a character a command name can't hold \(U\+003C\)/,
    );
  });

  test('a refused frontmatter name is reported once by field, and a plugin warning too', () => {
    const refused = readSkill('s/SKILL.md', skillFile('name: a<b'), project('ok'));
    expect(refused.issues[0]?.message).toMatch(/^name has a character/);
    const warned = readSkill('s/SKILL.md', skillFile('name: a<b'), plugin('review'));
    expect(warned.issues[0]?.message).toMatch(/^name has a character/);
    const reserved = readSkill('s/synced/SKILL.md', 'x', project('synced'));
    expect(reserved.issues[0]?.message).toMatch(/^folder name uses "synced"/);
  });

  test('a plugin skill keeps loading with a hyphenated command and its frontmatter name wins when valid', () => {
    const odd = readSkill('skills/a\u200Bb/SKILL.md', 'x', plugin('a\u200Bb'));
    expect(odd.skill.command).toBe('my-plugin:a-b');
    expect(blocksLoading(odd.issues)).toBe(false);
    const named = readSkill(
      'skills/a\u200Bb/SKILL.md',
      skillFile('name: fancy'),
      plugin('a\u200Bb'),
    );
    expect(named.skill.command).toBe('my-plugin:fancy');
    expect(named.issues).toEqual([]);
  });

  test('the doubled prefix is not added and a root skill takes its name from the field', () => {
    const doubled = readSkill('skills/r/SKILL.md', skillFile('name: my-plugin:fancy'), plugin('r'));
    expect(doubled.skill.command).toBe('my-plugin:fancy');
    const root = readSkill('SKILL.md', skillFile('name: review'), pluginRoot('some-dir'));
    expect(root.skill.name).toBe('review');
    expect(root.skill.command).toBe('my-plugin:review');
  });
});
