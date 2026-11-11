/**
 * `session.skillCatalog()`: every skill and command the session can invoke, with the names it
 * answers to, where it came from, its frontmatter as read, its `skillOverrides` state and what the
 * model listing and the `/` menu show of it (skills.md, "How a skill gets its command name",
 * "Override skill visibility from settings", "Control who invokes a skill"; frontmatter reference,
 * `paths`). The rows are the ones `skills()`, `expandSkill` and `expandMessage` use, so a name a row
 * lists is a name `expandSkill` finds. Integration tests of the host, outside `spec()`.
 */
import { describe, expect, test } from 'bun:test';
import type { PluginSession } from '../../src/host/index.ts';
import { loaded, signal } from '../support/host.ts';
import { viewOf } from '../support/plugin-settings.ts';
import { HOME, PROJECT, folderHostOf, skillText } from '../support/scan.ts';

const json = (value: unknown): string => JSON.stringify(value);
const skillFile = (root: string, name: string) => `${root}/.claude/skills/${name}/SKILL.md`;

async function pluginOf() {
  return loaded({
    '.claude-plugin/plugin.json': json({ name: 'kit', skills: ['./skills/', './extra/review'] }),
    'skills/lint/SKILL.md': skillText(
      'Lint',
      'argument-hint: <path>',
      'allowed-tools: Bash(npm *)',
    ),
    'skills/ship/SKILL.md': skillText('Ship', 'disable-model-invocation: true'),
    'extra/review/SKILL.md': skillText('Review', 'name: fancy'),
  });
}

async function sessionOf(files: Record<string, string>, overrides?: Record<string, string>) {
  const plugins = [{ id: 'kit@acme', plugin: await pluginOf() }];
  const host = folderHostOf(files, {
    plugins,
    ...(overrides === undefined
      ? {}
      : { settings: viewOf(['user', { skillOverrides: overrides }]) }),
  });
  await host.session.reloadSkills({ signal: signal() });
  return host.session;
}

const rowOf = (session: PluginSession, command: string) =>
  session.skillCatalog().skills.find((row) => row.invocable.command === command);

describe('the rows', () => {
  test('a plugin skill: its names, its plugin, its frontmatter as read', async () => {
    const session = await sessionOf({});
    const lint = rowOf(session, 'kit:lint');
    expect(lint?.names).toEqual(['kit:lint']);
    expect(lint?.source).toEqual({ kind: 'plugin', pluginId: 'kit@acme' });
    expect(lint?.invocable).toMatchObject({
      kind: 'skill',
      path: 'skills/lint/SKILL.md',
      description: 'Lint',
      argumentHint: '<path>',
      allowedTools: ['Bash(npm *)'],
      origin: { kind: 'plugin', plugin: 'kit' },
    });
    expect(lint?.override).toBe('on');
    expect(lint?.listed).toBe('description');
    expect(lint?.policy).toMatchObject({ user: true, model: true, inMenu: true });
  });

  test('a skill a manifest path renamed with `name` also answers to its bare name', async () => {
    const session = await sessionOf({});
    expect(rowOf(session, 'kit:fancy')?.names).toEqual(['kit:fancy', 'fancy']);
  });

  test('a bare name another command holds is not listed: expandSkill runs the other one', async () => {
    const session = await sessionOf({ [skillFile(PROJECT, 'fancy')]: skillText('Local') });
    expect(rowOf(session, 'kit:fancy')?.names).toEqual(['kit:fancy']);
    const local = rowOf(session, 'fancy');
    expect(local?.source).toEqual({ kind: 'folder', scope: 'project' });
    expect(local?.invocable.path).toBe(skillFile(PROJECT, 'fancy'));
  });

  test('a folder skill renamed with `name` answers to its folder name too', async () => {
    const session = await sessionOf({
      [skillFile(HOME, 'deploy-staging')]: skillText('D', 'name: deploy'),
    });
    const row = rowOf(session, 'deploy');
    expect(row?.names).toEqual(['deploy', 'deploy-staging']);
    expect(row?.source).toEqual({ kind: 'folder', scope: 'user' });
  });

  test('disable-model-invocation: invocable by the user, not listed to the model', async () => {
    const session = await sessionOf({});
    const ship = rowOf(session, 'kit:ship');
    expect(ship?.listed).toBe('hidden');
    expect(ship?.policy).toMatchObject({ user: true, model: false, inMenu: true });
  });

  test('skillOverrides: the state in force, and what it leaves listed', async () => {
    const session = await sessionOf(
      {
        [skillFile(HOME, 'one')]: skillText('One'),
        [skillFile(HOME, 'two')]: skillText('Two'),
      },
      { one: 'name-only', two: 'off', lint: 'off' },
    );
    expect(rowOf(session, 'one')).toMatchObject({ override: 'name-only', listed: 'name' });
    expect(rowOf(session, 'two')).toMatchObject({ override: 'off', listed: 'hidden' });
    expect(rowOf(session, 'two')?.policy).toMatchObject({ user: false, inMenu: false });
    // A plugin skill is never overridden.
    expect(rowOf(session, 'kit:lint')?.override).toBe('on');
  });

  test('a `paths` skill is dormant until a touched file activates it', async () => {
    const session = await sessionOf({
      [skillFile(PROJECT, 'api')]: skillText('Api', 'paths: src/**'),
    });
    expect(rowOf(session, 'api')).toMatchObject({ dormant: true, listed: 'name' });
    await session.touchFile(`${PROJECT}/src/a.ts`, { signal: signal() });
    expect(rowOf(session, 'api')).toMatchObject({ dormant: false, listed: 'description' });
  });
});

describe('one source with skills() and expandSkill', () => {
  test('skills() lists the rows: the menu is the rows in the menu, the listing the rows listed', async () => {
    const session = await sessionOf({ [skillFile(HOME, 'two')]: skillText('Two') }, { two: 'off' });
    const rows = session.skillCatalog().skills;
    const { model, menu } = session.skills();
    expect(menu.map((entry) => entry.name)).toEqual(
      rows.filter((row) => row.policy.inMenu).map((row) => row.invocable.command),
    );
    expect(model.entries.map((entry) => entry.name)).toEqual(
      rows.filter((row) => row.listed !== 'hidden').map((row) => row.invocable.command),
    );
  });

  test('every name of every row expands that row', async () => {
    const session = await sessionOf({
      [skillFile(PROJECT, 'fancy')]: skillText('Local'),
      [skillFile(HOME, 'deploy-staging')]: skillText('D', 'name: deploy'),
    });
    for (const row of session.skillCatalog().skills) {
      for (const name of row.names) {
        const expansion = await session.expandSkill(name, { signal: signal() });
        expect(expansion.ok && expansion.text).toContain(
          `Do the ${row.invocable.description} work.`,
        );
      }
    }
  });
});
