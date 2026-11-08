/**
 * A session that reads the scope folders (skills.md, "Choose where skills load", "Load skills in
 * monorepos and subdirectories", `strictPluginOnlyCustomization`): the plugins' skills and the
 * folders' side by side, `reloadSkills` as `/reload-skills`, a touched file as the trigger of the
 * nested ones. End-to-end over the real loader, the scan, the resolution and the fakes of the ports:
 * integration tests of the host, outside `spec()`.
 */
import { describe, expect, test } from 'bun:test';
import { createPolicyView } from '../../src/settings/index.ts';
import { standardPlugins, signal } from '../support/host.ts';
import { HOME, MANAGED, PROJECT, folderHostOf, menuOf, skillText } from '../support/scan.ts';
import { layerOf } from '../support/settings-layers.ts';

const skillFile = (root: string, name: string) => `${root}/.claude/skills/${name}/SKILL.md`;
const reload = (session: { reloadSkills(o: { signal: AbortSignal }): Promise<unknown> }) =>
  session.reloadSkills({ signal: signal() });

describe('folder skills in a session', () => {
  test('without a folder-scan port a session lists the plugins skills only and says so', async () => {
    const { session } = folderHostOf(
      { [skillFile(HOME, 'triage')]: skillText('Triage') },
      { plugins: await standardPlugins(), withoutFolders: true },
    );
    const outcome = await session.reloadSkills({ signal: signal() });
    expect(outcome.issues.map((issue) => issue.severity)).toEqual(['warning']);
    expect(menuOf(session)).toContain('formatter:review');
    expect(menuOf(session)).not.toContain('triage');
  });

  test('before the first reload nothing of the folders is listed; after it they are, next to the plugins', async () => {
    const files = {
      [skillFile(HOME, 'triage')]: skillText('Triage'),
      [skillFile(PROJECT, 'ship')]: skillText('Ship'),
      [skillFile(MANAGED, 'policy')]: skillText('Policy'),
      [`${PROJECT}/.claude/commands/lint.md`]: skillText('Lint'),
    };
    const { session } = folderHostOf(files, { plugins: await standardPlugins() });
    expect(menuOf(session)).not.toContain('triage');
    await reload(session);
    const menu = menuOf(session);
    for (const name of ['triage', 'ship', 'policy', 'lint', 'formatter:review']) {
      expect(menu).toContain(name);
    }
    expect(session.skills().model.entries.map((entry) => entry.name)).toContain('triage');
  });

  test('a folder skill expands with its arguments, by its command and by its folder name', async () => {
    const files = {
      [skillFile(PROJECT, 'deploy-staging')]: [
        '---',
        'name: deploy',
        'description: Deploy',
        '---',
        'Deploy $ARGUMENTS now.',
      ].join('\n'),
    };
    const { session } = folderHostOf(files);
    await reload(session);
    for (const name of ['deploy', 'deploy-staging']) {
      const expansion = await session.expandSkill(name, { arguments: 'to eu', signal: signal() });
      expect(expansion.ok && expansion.text).toContain('Deploy to eu now.');
    }
  });

  test('a skill that lost its name to another is typed by its directory name', async () => {
    const files = {
      [skillFile(HOME, 'deploy')]: skillText('personal'),
      [skillFile(PROJECT, 'deploy-staging')]: skillText('project', 'name: deploy'),
    };
    const { session } = folderHostOf(files);
    await reload(session);
    const unknown = await session.expandSkill('nope', { signal: signal() });
    expect(unknown.ok).toBe(false);
    const byFolder = await session.expandSkill('deploy-staging', { signal: signal() });
    expect(byFolder.ok && byFolder.text).toContain('project');
  });

  test('strictPluginOnlyCustomization for skills stops the personal and project folders, never the managed one', async () => {
    const settings = createPolicyView([
      layerOf('managed', { strictPluginOnlyCustomization: ['skills'] }),
    ]);
    const files = {
      [skillFile(HOME, 'triage')]: skillText('Triage'),
      [skillFile(PROJECT, 'ship')]: skillText('Ship'),
      [skillFile(MANAGED, 'policy')]: skillText('Policy'),
    };
    const { session } = folderHostOf(files, { settings });
    await reload(session);
    expect(menuOf(session)).toEqual(['policy']);
  });

  test('a skill of the managed directory keeps its hooks and grant under the plugin-only locks', async () => {
    const files = {
      [skillFile(MANAGED, 'policy')]: skillText('Policy', 'allowed-tools: Read'),
      [skillFile(PROJECT, 'ship')]: skillText('Ship', 'allowed-tools: Read'),
    };
    const settings = createPolicyView([
      layerOf('managed', { allowManagedPermissionRulesOnly: true }),
    ]);
    const { session } = folderHostOf(files, { settings });
    await reload(session);
    const managed = await session.expandSkill('policy', { signal: signal() });
    const project = await session.expandSkill('ship', { signal: signal() });
    expect(managed.ok && managed.grants).toEqual(['Read']);
    expect(project.ok && project.grants).toEqual([]);
  });

  test('a file touched below the working directory loads that directory skills, once', async () => {
    const files = { [skillFile(`${PROJECT}/apps/web`, 'lint')]: skillText('Web lint') };
    const { session } = folderHostOf(files);
    await reload(session);
    expect(menuOf(session)).toEqual([]);
    const first = await session.touchFile(`${PROJECT}/apps/web/src/page.ts`, { signal: signal() });
    expect(first.issues).toEqual([]);
    expect(menuOf(session)).toEqual(['lint']);
    await session.touchFile(`${PROJECT}/apps/web/src/other.ts`, { signal: signal() });
    expect(menuOf(session)).toEqual(['lint']);
    await reload(session);
    expect(menuOf(session)).toEqual(['lint']);
  });
});
