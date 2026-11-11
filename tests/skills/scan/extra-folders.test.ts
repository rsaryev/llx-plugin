/**
 * Extra scope folders a host names (`ScopeContext.extraScopeFolders`, `PluginHostOptions.extraScopeFolders`).
 * skills.md, "Choose where skills load" names `.claude/skills` and `.claude/commands` only, and memory.md
 * says nothing under a `.agents/` directory is read: reading another folder is a host extension, a
 * judgment (spec/judgments.md), so every test here is outside `spec(...)`. What it must keep is the
 * documented precedence: "Resolve skills that share a name" (enterprise over personal over project; a
 * skill over a command file) and "Skill folder as a plugin".
 */
import { describe, expect, test } from 'bun:test';
import { resolveFolderSkills, scanFolders } from '../../../src/skills/index.ts';
import { HOME, PROJECT, portOf, skillText } from '../../support/scan.ts';

const files = {
  [`${PROJECT}/.agents/skills/lint/SKILL.md`]: skillText('Lint'),
  [`/work/.agents/skills/root-only/SKILL.md`]: skillText('Root'),
  [`${PROJECT}/.claude/skills/deploy/SKILL.md`]: skillText('Claude deploy'),
  [`${PROJECT}/.agents/skills/deploy/SKILL.md`]: skillText('Agents deploy'),
  // The project's .agents copy of `ship` is nearer than the parent's .claude one, and still loses.
  [`${PROJECT}/.agents/skills/ship/SKILL.md`]: skillText('Agents ship'),
  [`/work/.claude/skills/ship/SKILL.md`]: skillText('Claude ship'),
  [`${HOME}/.agents/skills/mine/SKILL.md`]: skillText('Personal agents mine'),
  [`${PROJECT}/.claude/skills/mine/SKILL.md`]: skillText('Project mine'),
  [`${PROJECT}/.agents/commands/notes.md`]: 'Write notes.',
  [`${PROJECT}/.agents/skills/kit/SKILL.md`]: skillText('Kit'),
  [`${PROJECT}/.agents/skills/kit/.claude-plugin/plugin.json`]: '{"name":"kit"}',
};

async function resolve(extra?: readonly string[]) {
  const outcome = await scanFolders({
    folders: portOf(files, { disk: { repositories: ['/work'] } }),
    request: { home: HOME, cwd: PROJECT },
    ...(extra === undefined ? {} : { extraScopeFolders: extra }),
  });
  const resolution = resolveFolderSkills(outcome.entries, { cwd: PROJECT });
  const described = Object.fromEntries(
    resolution.resolved.map((each) => [each.invocable.command, each.invocable.description]),
  );
  return { outcome, resolution, described };
}

describe('judgment: extra scope folders beside .claude', () => {
  test('absent, only .claude folders are read, as Claude Code does', async () => {
    const { described } = await resolve();
    expect(Object.keys(described).toSorted()).toEqual(['deploy', 'mine', 'ship']);
  });

  test('named, its skills and commands load in every base of the scope: the project chain and the home', async () => {
    const { described, outcome } = await resolve(['.agents']);
    expect(Object.keys(described).toSorted()).toEqual([
      'deploy',
      'kit',
      'lint',
      'mine',
      'notes',
      'root-only',
      'ship',
    ]);
    expect(outcome.entries.find((entry) => entry.invocable.command === 'lint')?.scope).toBe(
      'project',
    );
    expect(outcome.watch).toContain(`${PROJECT}/.agents/skills`);
  });

  test('within a scope every .claude folder wins a shared name, even one further up the chain', async () => {
    const { described, resolution } = await resolve(['.agents']);
    expect(described['deploy']).toBe('Claude deploy');
    expect(described['ship']).toBe('Claude ship');
    expect(
      resolution.shadowed.map((each) => String(each.path)).toSorted((a, b) => a.localeCompare(b)),
    ).toEqual([
      `${PROJECT}/.agents/skills/deploy/SKILL.md`,
      `${PROJECT}/.agents/skills/ship/SKILL.md`,
      // Shadowed by the personal skill of the next test.
      `${PROJECT}/.claude/skills/mine/SKILL.md`,
    ]);
  });

  test('the scopes keep their documented order: a personal skill of an extra folder wins over a project one', async () => {
    const { described } = await resolve(['.agents']);
    expect(described['mine']).toBe('Personal agents mine');
  });

  test('a skill folder below an extra folder is never a skills-directory plugin', async () => {
    const { outcome } = await resolve(['.agents']);
    expect(outcome.plugins).toEqual([]);
  });

  test('.claude named again, or a folder named twice, is read once', async () => {
    const once = await resolve(['.agents']);
    const repeated = await resolve(['.claude', '.agents', '.agents']);
    expect(repeated.outcome.entries).toHaveLength(once.outcome.entries.length);
  });
});
