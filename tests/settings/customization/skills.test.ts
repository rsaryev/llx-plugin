/**
 * settings-reference.md § `strictPluginOnlyCustomization.skills` ("Claude Code stops loading skills
 * from `~/.claude/skills/` and `.claude/skills/`, custom commands from `~/.claude/commands/` and
 * `.claude/commands/`, skills and commands under `--add-dir` directories, and skills synced from your
 * claude.ai account. It keeps loading bundled skills, skills in the managed policy directory, and
 * skills from plugins other than skills-directory plugins"), § `strictPluginOnlyCustomization` ("If
 * you lock any surface, Claude Code also stops loading skills-directory plugins"), admin-setup.md ("Locking skills
 * also stops the skills your developers enable on claude.ai from syncing").
 */
import { describe, expect, test } from 'bun:test';
import { PLUGIN_ONLY_SURFACES } from '../../../src/protocol/settings-keys.ts';
import { customizationOf, locking } from '../../support/customization.ts';
import { spec } from '../../support/spec.ts';

const STOPPED = [
  'userSkills',
  'projectSkills',
  'userCommands',
  'projectCommands',
  'addDir',
  'synced',
] as const;
const KEPT = ['bundled', 'managedDirectory', 'plugin'] as const;

spec('settings.key.strictPluginOnlyCustomization.skills', () => {
  const locked = customizationOf(locking(['skills']));

  describe('with skills locked', () => {
    test.each(STOPPED)('%s does not load', (origin) => {
      expect(locked.loads('skills', origin)).toBe(false);
    });

    test.each(KEPT)('%s keeps loading', (origin) => {
      expect(locked.loads('skills', origin)).toBe(true);
    });

    test("a skills-directory plugin does not load: its folder is the user's own", () => {
      expect(locked.loads('skills', 'skillsDirPlugin')).toBe(false);
    });

    test('true locks the surface as the array does', () => {
      const all = customizationOf(locking(true));
      for (const origin of STOPPED) expect(all.loads('skills', origin)).toBe(false);
      for (const origin of KEPT) expect(all.loads('skills', origin)).toBe(true);
    });
  });

  describe('without the skills lock', () => {
    test('every source loads when nothing is locked', () => {
      const open = customizationOf([]);
      for (const origin of [...STOPPED, ...KEPT]) expect(open.loads('skills', origin)).toBe(true);
    });

    test.each(PLUGIN_ONLY_SURFACES.filter((surface) => surface !== 'skills'))(
      'locking only %s leaves skills and commands of every source loading',
      (surface) => {
        const policy = customizationOf(locking([surface]));
        for (const origin of [...STOPPED, ...KEPT]) {
          expect(policy.loads('skills', origin)).toBe(true);
        }
      },
    );

    test("a skills-directory plugin is skipped under a lock on another surface: it is not among the user's own skills", () => {
      const hooksOnly = customizationOf(locking(['hooks']));
      expect(hooksOnly.loads('skills', 'skillsDirPlugin')).toBe(false);
    });
  });
});
