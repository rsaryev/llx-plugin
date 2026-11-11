/**
 * The readers of a `SessionSkill` row and the fixtures `@rsaryev/llx-plugin/testing` builds rows
 * with (docs/API.md, "Testing kit"). A fixture row is the row a session lists for the same file;
 * the readers read the row's source and frontmatter. `keywords` is no frontmatter field Claude Code
 * knows (skills.md, "Frontmatter reference": a field it doesn't recognize is ignored), so the
 * reader is a judgment (spec/judgments.md, `skillKeywords`), outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import { skillKeywords, skillPlugin, skillScope } from '../../src/host/index.ts';
import { catalogAgentFixture, sessionSkillFixture } from '../../src/testing/index.ts';
import { signal } from '../support/host.ts';
import { HOME, folderHostOf } from '../support/scan.ts';

describe('sessionSkillFixture', () => {
  test('a personal skill row is the row a session lists for the same frontmatter', async () => {
    const text =
      '---\ndescription: "Triage issues"\nkeywords: ["bugs","triage"]\n---\nRun triage.\n';
    const { session } = folderHostOf({ [`${HOME}/.claude/skills/triage/SKILL.md`]: text });
    await session.reloadSkills({ signal: signal() });
    const [listed] = session.skillCatalog().skills;
    const fixture = sessionSkillFixture({
      name: 'triage',
      description: 'Triage issues',
      frontmatter: { keywords: ['bugs', 'triage'] },
      body: 'Run triage.',
    });
    const {
      invocable: listedHead,
      file: _file,
      directory: _dir,
      ...listedRest
    } = listed ?? fixture;
    const { invocable: fixtureHead, file: _fixtureFile, ...fixtureRest } = fixture;
    expect(fixtureRest).toEqual(listedRest);
    expect({ ...fixtureHead, path: '', dir: '' }).toEqual({ ...listedHead, path: '', dir: '' });
  });

  test('a plugin skill is scoped by the plugin name its id carries', () => {
    const row = sessionSkillFixture({
      name: 'deploy',
      source: { kind: 'plugin', pluginId: 'ops@acme' },
    });
    expect(row.invocable.command).toBe('ops:deploy');
    expect(row.names).toEqual(['ops:deploy']);
  });
});

describe('catalogAgentFixture', () => {
  test('a folder agent and a plugin agent, as the catalog holds them', () => {
    const helper = catalogAgentFixture({ name: 'helper', frontmatter: { model: 'haiku' } });
    expect(helper.name).toBe('helper');
    expect(helper.source).toEqual({ kind: 'folder', scope: 'user' });
    expect(helper.definition.model).toBe('haiku');
    const review = catalogAgentFixture({ name: 'review', source: { pluginId: 'ops@acme' } });
    expect(review.name).toBe('ops:review');
    expect(review.source).toEqual({ kind: 'plugin', pluginId: 'ops@acme' });
  });

  test('a definition Claude Code would skip is a thrown error, never a half row', () => {
    expect(() => catalogAgentFixture({ name: 'bad', frontmatter: { name: '' } })).toThrow('bad');
  });
});

describe('the readers of a row', () => {
  test('skillPlugin gives the id and the name of a plugin skill, nothing for a folder skill', () => {
    const row = sessionSkillFixture({
      name: 'deploy',
      source: { kind: 'plugin', pluginId: 'ops@acme' },
    });
    expect(skillPlugin(row)).toEqual({ id: 'ops@acme', name: 'ops' });
    expect(skillPlugin(sessionSkillFixture({ name: 'mine' }))).toBeUndefined();
  });

  test('skillScope is the folder scope, or plugin, or host', () => {
    expect(skillScope(sessionSkillFixture({ name: 'a' }))).toBe('user');
    expect(
      skillScope(sessionSkillFixture({ name: 'a', source: { kind: 'folder', scope: 'project' } })),
    ).toBe('project');
    expect(
      skillScope(sessionSkillFixture({ name: 'a', source: { kind: 'plugin', pluginId: 'p@m' } })),
    ).toBe('plugin');
    expect(skillScope(sessionSkillFixture({ name: 'a', source: { kind: 'host' } }))).toBe('host');
  });

  test('skillKeywords reads a list or a comma string, and nothing else', () => {
    const keywords = (value: unknown) =>
      skillKeywords(sessionSkillFixture({ name: 'a', frontmatter: { keywords: value } }));
    expect(keywords(['bugs', ' triage ', 3, ''])).toEqual(['bugs', 'triage']);
    expect(keywords('bugs, triage,')).toEqual(['bugs', 'triage']);
    expect(keywords(42)).toEqual([]);
    expect(skillKeywords(sessionSkillFixture({ name: 'a' }))).toEqual([]);
  });
});
