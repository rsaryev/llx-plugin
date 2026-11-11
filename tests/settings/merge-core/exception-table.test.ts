/**
 * settings.md § Exceptions to managed settings precedence (the table's keys), § A value you set is
 * ignored ("A security key keeps its strict value"; "A higher level sets it"). The table of keys
 * that carry a managed exception, and the two `block...Outside...` keys that have no requirement id.
 */
import { describe, expect, test } from 'bun:test';
import { POLICY_KEYS } from '../../../src/protocol/settings-keys.ts';
import { GENERAL_KEYS } from '../../../src/settings/general/index.ts';
import { SPECS } from '../../../src/settings/index.ts';
import { createGeneralView } from '../../support/settings-general.ts';
import { layerOf, plain } from '../../support/settings-layers.ts';
import { spec } from '../../support/spec.ts';

const view = (...layers: Parameters<typeof layerOf>[]) =>
  createGeneralView(layers.map(([scope, raw]) => layerOf(scope, raw)));

describe('the table of exceptions', () => {
  test('exactly the keys of settings.md carry a managed exception', () => {
    const carrying = [...POLICY_KEYS, ...GENERAL_KEYS].filter(
      (key) => SPECS[key].exception !== undefined,
    );
    expect(plain(carrying.toSorted())).toEqual(
      [
        'autoMode.classifyAllShell',
        'crossSessionInbound',
        'disableClaudeAiConnectors',
        'enableArtifact',
        'isolatePeerMachines',
        'maxEffortLevel',
        'permissions.blockReadsOutsideWorkingDirectories',
        'permissions.blockWritesOutsideWorkingDirectories',
        'permissions.denyInsteadOfPrompting',
        'remoteControlAtStartup',
        'syncClaudeAiPlugins',
        'syncClaudeAiSkills',
        'useAutoModeDuringPlan',
      ].toSorted(),
    );
  });

  test('permissions.blockReadsOutsideWorkingDirectories and the writes key: `true` from any scope under a managed false', () => {
    for (const name of [
      'blockReadsOutsideWorkingDirectories',
      'blockWritesOutsideWorkingDirectories',
    ] as const) {
      const key = `permissions.${name}` as const;
      expect(
        view(
          ['managed', { permissions: { [name]: false } }],
          ['project', { permissions: { [name]: true } }],
        ).get(key),
      ).toBe(true);
    }
  });
});

describe('a value you set is ignored', () => {
  spec('settingsMerge.settings.A value you set is ignored.A higher level sets it', () => {
    test('the stack names the level that wins, whichever file the value was set in', () => {
      const layers = [
        layerOf('user', { spinnerTipsEnabled: false }),
        layerOf('project', { spinnerTipsEnabled: false }),
        layerOf('flag', { spinnerTipsEnabled: true }),
      ];
      const winner = createGeneralView(layers).winner('spinnerTipsEnabled');
      expect(winner).toMatchObject({ scope: 'flag', value: true });
      const holders = createGeneralView(layers).eachFromHighest('spinnerTipsEnabled');
      expect(holders.map((holder) => holder.scope)).toEqual(['flag', 'project', 'user']);
    });

    test('a managed source above the --settings flag outranks it', () => {
      const layers = [
        layerOf('flag', { spinnerTipsEnabled: false }),
        layerOf('managed', { spinnerTipsEnabled: true }),
      ];
      expect(createGeneralView(layers).winner('spinnerTipsEnabled')?.scope).toBe('managed');
    });
  });

  spec(
    'settingsMerge.settings.A value you set is ignored.A security key keeps its strict value',
    () => {
      test('a project true for disableClaudeAiConnectors stays on (the docs example)', () => {
        const connectors = view(
          ['user', { disableClaudeAiConnectors: false }],
          ['project', { disableClaudeAiConnectors: true }],
        );
        expect(connectors.get('disableClaudeAiConnectors')).toBe(true);
      });

      test('a security key keeps the restrictive value of any file, a non-security key does not', () => {
        expect(
          view(
            ['user', { isolatePeerMachines: true }],
            ['project', { isolatePeerMachines: false }],
          ).get('isolatePeerMachines'),
        ).toBe(true);
        expect(
          view(
            ['user', { spinnerTipsEnabled: true }],
            ['project', { spinnerTipsEnabled: false }],
          ).get('spinnerTipsEnabled'),
        ).toBe(false);
      });
    },
  );
});
