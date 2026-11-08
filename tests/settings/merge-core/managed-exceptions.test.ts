/**
 * settings.md § Exceptions to managed settings precedence (the table: for a few keys whose values
 * restrict a session, Claude Code "honors a restrictive value from a scope that otherwise couldn't
 * override managed settings"), § A value you set is ignored ("A security key keeps its strict
 * value"; "A higher level sets it"), and settings-reference.md for each key's Scope line.
 */
import { describe, expect, test } from 'bun:test';
import { createGeneralView } from '../../support/settings-general.ts';
import { layerOf } from '../../support/settings-layers.ts';
import { spec } from '../../support/spec.ts';

const view = (...layers: Parameters<typeof layerOf>[]) =>
  createGeneralView(layers.map(([scope, raw]) => layerOf(scope, raw)));

const block = (value: boolean) => ({ autoMode: { classifyAllShell: value } });
const EXCEPTIONS = 'settingsMerge.settings.Exceptions to managed settings precedence';

spec(`${EXCEPTIONS}.disableClaudeAiConnectors`, () => {
  describe('`true` from any scope, even when a managed source sets `false`', () => {
    test('a project true stays on under a managed false', () => {
      const connectors = view(
        ['managed', { disableClaudeAiConnectors: false }],
        ['project', { disableClaudeAiConnectors: true }],
      );
      expect(connectors.get('disableClaudeAiConnectors')).toBe(true);
    });

    test('every scope can turn it on, and no scope turns it off', () => {
      for (const scope of ['user', 'project', 'local', 'flag'] as const) {
        expect(
          view(
            ['managed', { disableClaudeAiConnectors: false }],
            [scope, { disableClaudeAiConnectors: true }],
          ).get('disableClaudeAiConnectors'),
        ).toBe(true);
      }
      expect(
        view(
          ['managed', { disableClaudeAiConnectors: true }],
          ['user', { disableClaudeAiConnectors: false }],
        ).get('disableClaudeAiConnectors'),
      ).toBe(true);
    });
  });
});

spec(`${EXCEPTIONS}.enableArtifact`, () => {
  describe('`false` from any scope, and `disableArtifact: true`, even when a managed source sets `true`', () => {
    test('a user false stays under a managed true', () => {
      expect(
        view(['managed', { enableArtifact: true }], ['user', { enableArtifact: false }]).get(
          'enableArtifact',
        ),
      ).toBe(false);
    });

    test('disableArtifact: true counts as enableArtifact: false, and its false is ignored', () => {
      expect(
        view(['managed', { enableArtifact: true }], ['project', { disableArtifact: true }]).get(
          'enableArtifact',
        ),
      ).toBe(false);
      expect(view(['user', { disableArtifact: false }]).get('enableArtifact')).toBeUndefined();
    });

    test('nothing turns the tool back on: a true never overrides a false from another file', () => {
      expect(
        view(['user', { enableArtifact: false }], ['local', { enableArtifact: true }]).get(
          'enableArtifact',
        ),
      ).toBe(false);
      expect(
        view(['managed', { enableArtifact: true }], ['flag', { enableArtifact: true }]).get(
          'enableArtifact',
        ),
      ).toBe(true);
    });
  });
});

spec(`${EXCEPTIONS}.isolatePeerMachines`, () => {
  describe('`true` from any scope, even when a managed source sets `false`', () => {
    test('a checked-in project file can turn the requirement on but not off', () => {
      expect(
        view(
          ['managed', { isolatePeerMachines: false }],
          ['project', { isolatePeerMachines: true }],
        ).get('isolatePeerMachines'),
      ).toBe(true);
      expect(
        view(
          ['user', { isolatePeerMachines: true }],
          ['project', { isolatePeerMachines: false }],
        ).get('isolatePeerMachines'),
      ).toBe(true);
    });
  });
});

spec(`${EXCEPTIONS}.autoMode.classifyAllShell`, () => {
  describe('`true` from ~/.claude/settings.json or --settings, even when a managed source sets `false`', () => {
    test('user and --settings win over a managed false', () => {
      for (const scope of ['user', 'flag'] as const) {
        expect(
          view(['managed', block(false)], [scope, block(true)]).get('autoMode.classifyAllShell'),
        ).toBe(true);
      }
    });

    test('a project or local true does not count: the key is read from user, --settings and managed only', () => {
      for (const scope of ['project', 'local'] as const) {
        expect(view([scope, block(true)]).get('autoMode.classifyAllShell')).toBeUndefined();
        expect(
          view(['managed', block(false)], [scope, block(true)]).get('autoMode.classifyAllShell'),
        ).toBe(false);
      }
    });

    test('the merged settings carry the value the exception decided, not the project file one', () => {
      const merged = view(
        ['managed', block(false)],
        ['user', block(true)],
        ['project', block(true)],
      ).merged();
      expect(merged.autoMode).toEqual({ classifyAllShell: true });
      expect(view(['project', block(true)]).merged()).toEqual({});
    });
  });
});

spec(`${EXCEPTIONS}.remoteControlAtStartup`, () => {
  describe('`false` from .claude/settings.json or .claude/settings.local.json, even when a managed source sets `true`', () => {
    test('a project or local false beats a managed true', () => {
      for (const scope of ['project', 'local'] as const) {
        expect(
          view(
            ['managed', { remoteControlAtStartup: true }],
            [scope, { remoteControlAtStartup: false }],
          ).get('remoteControlAtStartup'),
        ).toBe(false);
      }
    });

    test('a project or local true is ignored: it neither turns auto-connect on nor beats a lower false', () => {
      for (const scope of ['project', 'local'] as const) {
        expect(
          view([scope, { remoteControlAtStartup: true }]).get('remoteControlAtStartup'),
        ).toBeUndefined();
        expect(
          view(
            ['user', { remoteControlAtStartup: false }],
            [scope, { remoteControlAtStartup: true }],
          ).get('remoteControlAtStartup'),
        ).toBe(false);
      }
    });

    test('a user true applies', () => {
      expect(view(['user', { remoteControlAtStartup: true }]).get('remoteControlAtStartup')).toBe(
        true,
      );
    });
  });
});

spec(`${EXCEPTIONS}.crossSessionInbound`, () => {
  describe('a stricter value from the project or local file, on the accept < hold < refuse ladder', () => {
    test('a stricter project value beats managed, --settings and user values', () => {
      expect(
        view(
          ['managed', { crossSessionInbound: 'accept' }],
          ['project', { crossSessionInbound: 'hold' }],
        ).get('crossSessionInbound'),
      ).toBe('hold');
      expect(
        view(
          ['flag', { crossSessionInbound: 'hold' }],
          ['local', { crossSessionInbound: 'refuse' }],
        ).get('crossSessionInbound'),
      ).toBe('refuse');
      expect(
        view(
          ['user', { crossSessionInbound: 'accept' }],
          ['project', { crossSessionInbound: 'refuse' }],
        ).get('crossSessionInbound'),
      ).toBe('refuse');
    });

    test('a project or local value that is not stricter is ignored', () => {
      expect(
        view(
          ['managed', { crossSessionInbound: 'refuse' }],
          ['project', { crossSessionInbound: 'hold' }],
        ).get('crossSessionInbound'),
      ).toBe('refuse');
      expect(
        view(
          ['user', { crossSessionInbound: 'hold' }],
          ['local', { crossSessionInbound: 'hold' }],
        ).get('crossSessionInbound'),
      ).toBe('hold');
    });

    test('managed settings are read first, then --settings, then user settings', () => {
      expect(
        view(
          ['user', { crossSessionInbound: 'refuse' }],
          ['flag', { crossSessionInbound: 'accept' }],
          ['managed', { crossSessionInbound: 'hold' }],
        ).get('crossSessionInbound'),
      ).toBe('hold');
    });

    test('when none of the trusted sources sets a value, a project hold or refuse still applies and an accept does not', () => {
      expect(view(['project', { crossSessionInbound: 'hold' }]).get('crossSessionInbound')).toBe(
        'hold',
      );
      expect(view(['local', { crossSessionInbound: 'refuse' }]).get('crossSessionInbound')).toBe(
        'refuse',
      );
      expect(
        view(['project', { crossSessionInbound: 'accept' }]).get('crossSessionInbound'),
      ).toBeUndefined();
    });
  });
});

for (const key of ['useAutoModeDuringPlan', 'syncClaudeAiSkills', 'syncClaudeAiPlugins'] as const) {
  spec(`${EXCEPTIONS}.${key}`, () => {
    describe(`\`false\` from any managed source, --settings, user or local settings, even under a managed true: ${key}`, () => {
      test('a false of each of those scopes beats the winning managed true', () => {
        for (const scope of ['flag', 'user', 'local'] as const) {
          expect(view(['managed', { [key]: true }], [scope, { [key]: false }]).get(key)).toBe(
            false,
          );
        }
      });

      test('a false in the shared project file is ignored', () => {
        expect(view(['managed', { [key]: true }], ['project', { [key]: false }]).get(key)).toBe(
          true,
        );
        expect(view(['project', { [key]: false }]).get(key)).toBeUndefined();
      });

      test('a true turns nothing on under a false', () => {
        expect(view(['user', { [key]: false }], ['managed', { [key]: true }]).get(key)).toBe(false);
      });
    });
  });
}

spec(`${EXCEPTIONS}.maxEffortLevel`, () => {
  describe('a lower cap from any scope, including --settings: the lowest cap applies', () => {
    test('a lower cap beats the higher cap managed settings apply, from every scope', () => {
      for (const scope of ['user', 'project', 'local', 'flag'] as const) {
        expect(
          view(['managed', { maxEffortLevel: 'high' }], [scope, { maxEffortLevel: 'medium' }]).get(
            'maxEffortLevel',
          ),
        ).toBe('medium');
      }
    });

    test('a higher cap in another scope cannot raise the cap', () => {
      expect(
        view(['managed', { maxEffortLevel: 'medium' }], ['user', { maxEffortLevel: 'xhigh' }]).get(
          'maxEffortLevel',
        ),
      ).toBe('medium');
      expect(
        view(
          ['user', { maxEffortLevel: 'low' }],
          ['flag', { maxEffortLevel: 'high' }],
          ['managed', { maxEffortLevel: 'xhigh' }],
        ).get('maxEffortLevel'),
      ).toBe('low');
    });

    test('"max" sets no cap: any other cap is lower', () => {
      expect(
        view(['managed', { maxEffortLevel: 'max' }], ['project', { maxEffortLevel: 'xhigh' }]).get(
          'maxEffortLevel',
        ),
      ).toBe('xhigh');
    });
  });
});
