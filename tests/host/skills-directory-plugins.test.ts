/**
 * A skill folder that holds a plugin manifest (plugins/loading.md, "Skills-directory plugins blocked
 * by managed settings": "Claude Code skips them when your administrator sets one of these
 * restrictions": `strictPluginOnlyCustomization` set to `true` or to an array naming a kind, and a
 * `strictKnownMarketplaces` allowlist without a `{ "source": "skills-dir" }` entry or a
 * `blockedMarketplaces` list with one. "Unless skills are among the locked kinds, a `SKILL.md` at the
 * folder's root still loads as a plain skill."). The session's `reloadSkills` reports the plugin only
 * when the settings admit it; integration tests of the host, outside `spec()`.
 */
import { describe, expect, test } from 'bun:test';
import { signal } from '../support/host.ts';
import { github, skillsDir } from '../support/marketplace-sources.ts';
import { viewOf } from '../support/plugin-settings.ts';
import { HOME, folderHostOf, menuOf, skillText } from '../support/scan.ts';

const files = {
  [`${HOME}/.claude/skills/toolbox/SKILL.md`]: skillText('Toolbox'),
  [`${HOME}/.claude/skills/toolbox/.claude-plugin/plugin.json`]: '{"name":"toolbox"}',
};

async function reloaded(managed: Record<string, unknown> | undefined) {
  const settings = managed === undefined ? undefined : viewOf(['managed', managed]);
  const { session } = folderHostOf(files, settings === undefined ? {} : { settings });
  const outcome = await session.reloadSkills({ signal: signal() });
  return { ids: outcome.plugins.map((plugin) => plugin.id), menu: menuOf(session) };
}

describe('the skills-directory gate in a session', () => {
  test('nothing restricts it: the folder is a plugin and its SKILL.md a skill', async () => {
    expect(await reloaded(undefined)).toEqual({ ids: ['toolbox@skills-dir'], menu: ['toolbox'] });
  });

  test.each([
    [
      'strictPluginOnlyCustomization naming one kind other than skills',
      { strictPluginOnlyCustomization: ['mcp'] },
    ],
    [
      'a strictKnownMarketplaces allowlist without skills-dir',
      { strictKnownMarketplaces: [github('acme/tools')] },
    ],
    ['a blockedMarketplaces list with skills-dir', { blockedMarketplaces: [skillsDir] }],
  ])(
    '%s skips the plugin and the SKILL.md still loads as a plain skill',
    async (_name, managed) => {
      expect(await reloaded(managed)).toEqual({ ids: [], menu: ['toolbox'] });
    },
  );

  test('strictPluginOnlyCustomization with skills among the locked kinds skips the plugin and the plain skill', async () => {
    expect(await reloaded({ strictPluginOnlyCustomization: ['skills'] })).toEqual({
      ids: [],
      menu: [],
    });
  });

  test('strictPluginOnlyCustomization true locks every kind: neither the plugin nor the plain skill loads', async () => {
    expect(await reloaded({ strictPluginOnlyCustomization: true })).toEqual({ ids: [], menu: [] });
  });

  test('the allowlist with a skills-dir entry, and a blocklist without one, keep the plugin', async () => {
    const allowed = { strictKnownMarketplaces: [github('acme/tools'), skillsDir] };
    expect((await reloaded(allowed)).ids).toEqual(['toolbox@skills-dir']);
    const blocked = { blockedMarketplaces: [github('acme/tools')] };
    expect((await reloaded(blocked)).ids).toEqual(['toolbox@skills-dir']);
  });
});
