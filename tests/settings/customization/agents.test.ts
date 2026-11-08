/**
 * settings-reference.md § `strictPluginOnlyCustomization.agents` ("Claude Code stops loading agents
 * from `~/.claude/agents/`, `.claude/agents/`, and `--add-dir` directories. It keeps loading built-in
 * agents, agents in the managed policy directory, and agents from plugins other than
 * skills-directory plugins"), plugins/loading.md § Skills-directory plugins blocked by managed
 * settings ("The whole plugin is skipped when any one kind is locked").
 */
import { describe, expect, test } from 'bun:test';
import { PLUGIN_ONLY_SURFACES } from '../../../src/protocol/settings-keys.ts';
import { customizationOf, locking } from '../../support/customization.ts';
import { spec } from '../../support/spec.ts';

const STOPPED = ['userAgents', 'projectAgents', 'addDir'] as const;
const KEPT = ['builtIn', 'managedDirectory', 'plugin'] as const;

spec('settings.key.strictPluginOnlyCustomization.agents', () => {
  describe('with agents locked', () => {
    const locked = customizationOf(locking(['agents']));

    test.each(STOPPED)('%s does not load', (origin) => {
      expect(locked.loads('agents', origin)).toBe(false);
    });

    test.each(KEPT)('%s keeps loading', (origin) => {
      expect(locked.loads('agents', origin)).toBe(true);
    });

    test('an agent of a skills-directory plugin does not load', () => {
      expect(locked.loads('agents', 'skillsDirPlugin')).toBe(false);
    });

    test('true locks the surface as the array does', () => {
      const all = customizationOf(locking(true));
      for (const origin of STOPPED) expect(all.loads('agents', origin)).toBe(false);
      for (const origin of KEPT) expect(all.loads('agents', origin)).toBe(true);
    });
  });

  describe('without the agents lock', () => {
    test.each(PLUGIN_ONLY_SURFACES.filter((surface) => surface !== 'agents'))(
      'locking only %s leaves agents of every user and project source loading',
      (surface) => {
        const policy = customizationOf(locking([surface]));
        for (const origin of [...STOPPED, ...KEPT]) {
          expect(policy.loads('agents', origin)).toBe(true);
        }
      },
    );

    test('nothing locked: every source loads', () => {
      const open = customizationOf([]);
      for (const origin of [...STOPPED, ...KEPT, 'skillsDirPlugin'] as const) {
        expect(open.loads('agents', origin)).toBe(true);
      }
    });
  });
});
