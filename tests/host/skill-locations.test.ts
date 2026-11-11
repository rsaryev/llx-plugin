/**
 * Where a session's skill lives: `SessionSkill.file` and `SessionSkill.directory`, absolute for
 * every source, and the directory is the value `${CLAUDE_SKILL_DIR}` expands to (skills.md,
 * "Available string substitutions": "the directory containing the skill's SKILL.md file. For plugin
 * skills, this is the skill's subdirectory within the plugin, not the plugin root"). A command file
 * has no `SKILL.md`, so it has a file and no directory (judgment, spec/judgments.md). Integration
 * tests of the host.
 */
import { describe, expect, test } from 'bun:test';
import type { PluginSession } from '../../src/host/index.ts';
import { loaded, signal } from '../support/host.ts';
import { locations } from '../support/ports.ts';
import { HOME, PROJECT, folderHostOf, skillText } from '../support/scan.ts';
import { spec } from '../support/spec.ts';

const json = (value: unknown): string => JSON.stringify(value);

async function plugins() {
  return [
    {
      id: 'kit@acme',
      plugin: await loaded({
        '.claude-plugin/plugin.json': json({ name: 'kit' }),
        'skills/lint/SKILL.md': skillText('Lint'),
        'commands/hello.md': '---\ndescription: Hello\n---\nSay hello.',
      }),
    },
    {
      id: 'inline@acme',
      plugin: await loaded({
        '.claude-plugin/plugin.json': json({
          name: 'inline',
          commands: { hi: { content: 'Say hi.', description: 'Hi' } },
        }),
      }),
    },
  ];
}

const FILES = {
  [`${HOME}/.claude/skills/one/SKILL.md`]: skillText('One'),
  [`${PROJECT}/.claude/commands/db.md`]: skillText('Db'),
};

async function sessionOf(session: Parameters<typeof folderHostOf>[1] = {}) {
  const host = folderHostOf(FILES, { plugins: await plugins(), ...session });
  await host.session.reloadSkills({ signal: signal() });
  return host.session;
}

const rowOf = (session: PluginSession, command: string) =>
  session.skillCatalog().skills.find((row) => row.invocable.command === command);

const skillDirOf = async (session: PluginSession, command: string) => {
  const expansion = await session.expandSkill(command, {
    arguments: '${CLAUDE_SKILL_DIR}',
    signal: signal(),
  });
  return expansion.ok ? expansion.text : expansion.issues;
};

describe('the file and the directory of each row', () => {
  spec('skills.substitution.${CLAUDE_SKILL_DIR}', () => {
    test('a plugin skill: below the plugin root, and `${CLAUDE_SKILL_DIR}` is that directory', async () => {
      const session = await sessionOf();
      const lint = rowOf(session, 'kit:lint');
      expect(lint?.invocable.path).toBe('skills/lint/SKILL.md');
      expect(lint?.file).toBe('/plugins/kit@acme/skills/lint/SKILL.md');
      expect(lint?.directory).toBe('/plugins/kit@acme/skills/lint');
      const text = await skillDirOf(session, 'kit:lint');
      expect(text).toContain(`Base directory for this skill: ${lint?.directory}`);
    });

    test('a folder skill: the path it was read from', async () => {
      const session = await sessionOf();
      const one = rowOf(session, 'one');
      expect(one?.file).toBe(`${HOME}/.claude/skills/one/SKILL.md`);
      expect(one?.directory).toBe(`${HOME}/.claude/skills/one`);
      expect(await skillDirOf(session, 'one')).toContain(
        `Base directory for this skill: ${one?.directory}`,
      );
    });

    test("the session's own locations place its plugins' skills", async () => {
      const session = await sessionOf({
        session: { locations: locations({ plugins: '/session-plugins' }) },
      });
      expect(rowOf(session, 'kit:lint')?.directory).toBe('/session-plugins/kit@acme/skills/lint');
    });
  });

  test('a command file has a file and no directory; an inline manifest command has neither', async () => {
    const session = await sessionOf();
    expect(rowOf(session, 'kit:hello')?.file).toBe('/plugins/kit@acme/commands/hello.md');
    expect(rowOf(session, 'kit:hello')?.directory).toBeUndefined();
    expect(rowOf(session, 'db')?.file).toBe(`${PROJECT}/.claude/commands/db.md`);
    expect(rowOf(session, 'db')?.directory).toBeUndefined();
    const hi = rowOf(session, 'inline:hi');
    expect(hi).toBeDefined();
    expect(hi?.file).toBeUndefined();
    expect(hi?.directory).toBeUndefined();
  });
});
