/**
 * settings.md § Settings precedence ("managed settings, command line, project local, shared project,
 * user"; "a key set at a higher level overrides the same key anywhere below it") and § Precedence
 * examples (the `spinnerTipsEnabled` scenarios), § Change a setting for one session (`--settings`
 * "applies it above your user, project, and local files and below managed settings. It can set any
 * key your user settings file can set; it can't set `Managed` or `Global config` keys"),
 * § A value you set is ignored ("A higher level sets it"). The view's `get` is the answer the docs
 * give for a key set in several files.
 */
import { describe, expect, test } from 'bun:test';
import { createGeneralView, issuesOfFlag } from '../../support/settings-general.ts';
import { spec } from '../../support/spec.ts';
import { layerOf } from '../../support/settings-layers.ts';

const tips = (scope: 'user' | 'project' | 'local' | 'flag' | 'managed', value: boolean) =>
  layerOf(scope, { spinnerTipsEnabled: value });

spec(
  ['settingsMerge.settings.Settings precedence.User settings', 'cli.debug.Check resolved settings'],
  () => {
    describe('user settings are the lowest of the four levels', () => {
      test('a key only the user file sets applies in every project', () => {
        const view = createGeneralView([tips('user', false)]);
        expect(view.get('spinnerTipsEnabled')).toBe(false);
      });

      test('every other level sets the key above it', () => {
        for (const above of ['project', 'local', 'flag', 'managed'] as const) {
          const view = createGeneralView([tips('user', false), tips(above, true)]);
          expect(view.get('spinnerTipsEnabled')).toBe(true);
          expect(view.winner('spinnerTipsEnabled')?.scope).toBe(above);
        }
      });
    });
  },
);

spec('settingsMerge.settings.Settings precedence.Shared project settings', () => {
  describe('shared project settings override user settings and give way to local', () => {
    test('team settings override personal settings (the docs example)', () => {
      const view = createGeneralView([tips('user', false), tips('project', true)]);
      expect(view.get('spinnerTipsEnabled')).toBe(true);
      expect(view.winner('spinnerTipsEnabled')?.scope).toBe('project');
    });

    test('the order the host hands the layers in does not matter', () => {
      const view = createGeneralView([tips('project', true), tips('user', false)]);
      expect(view.get('spinnerTipsEnabled')).toBe(true);
    });

    test('a key the project file leaves out keeps the user value', () => {
      const view = createGeneralView([
        layerOf('user', { spinnerTipsEnabled: false, model: 'opus' }),
        layerOf('project', { spinnerTipsEnabled: true }),
      ]);
      expect(view.get('model')).toBe('opus');
    });
  });
});

spec('settingsMerge.settings.Settings precedence.Project local settings', () => {
  describe('project local settings sit above shared project settings', () => {
    test('local gets your personal value back without changing the project file (the docs example)', () => {
      const user = tips('user', false);
      const project = tips('project', true);
      const local = tips('local', false);
      expect(createGeneralView([user, project]).get('spinnerTipsEnabled')).toBe(true);
      expect(createGeneralView([user, project, local]).get('spinnerTipsEnabled')).toBe(false);
    });

    test('the local file beats the project file for a model, as in the docs', () => {
      const view = createGeneralView([
        layerOf('project', { model: 'claude-sonnet-5' }),
        layerOf('local', { model: 'claude-opus-5-5' }),
      ]);
      expect(view.get('model')).toBe('claude-opus-5-5');
    });

    test('and it still gives way to --settings and to managed settings', () => {
      const local = tips('local', true);
      expect(createGeneralView([local, tips('flag', false)]).get('spinnerTipsEnabled')).toBe(false);
      expect(createGeneralView([local, tips('managed', false)]).get('spinnerTipsEnabled')).toBe(
        false,
      );
    });
  });
});

spec('settingsMerge.settings.Settings precedence.Command line', () => {
  describe('--settings sits above every file except managed', () => {
    test('a key set there overrides the same key in the user, project and local files (the docs example)', () => {
      const view = createGeneralView([
        tips('user', false),
        tips('project', false),
        tips('local', false),
        tips('flag', true),
      ]);
      expect(view.get('spinnerTipsEnabled')).toBe(true);
      expect(view.winner('spinnerTipsEnabled')?.scope).toBe('flag');
    });

    test('a key left out keeps its value from the files', () => {
      const view = createGeneralView([
        layerOf('user', { model: 'opus', spinnerTipsEnabled: false }),
        layerOf('flag', { spinnerTipsEnabled: true }),
      ]);
      expect(view.get('model')).toBe('opus');
    });

    test('it is one session: the files are untouched, so without the layer the files answer again', () => {
      const files = [tips('user', false)];
      expect(createGeneralView([...files, tips('flag', true)]).get('spinnerTipsEnabled')).toBe(
        true,
      );
      expect(createGeneralView(files).get('spinnerTipsEnabled')).toBe(false);
    });
  });
});

spec('settingsMerge.settings.Settings precedence.Managed settings', () => {
  describe('managed settings are the top level', () => {
    test('nothing in user, project, local settings or --settings overrides a managed key (the docs example)', () => {
      const view = createGeneralView([
        tips('user', false),
        tips('project', false),
        tips('local', false),
        tips('flag', false),
        tips('managed', true),
      ]);
      expect(view.get('spinnerTipsEnabled')).toBe(true);
      expect(view.winner('spinnerTipsEnabled')?.scope).toBe('managed');
    });

    test('availableModels is a lock: the managed list applies as-is and the files add nothing', () => {
      const view = createGeneralView([
        layerOf('user', { availableModels: ['opus'] }),
        layerOf('project', { availableModels: ['haiku'] }),
        layerOf('local', { availableModels: ['sonnet'] }),
        layerOf('managed', { availableModels: ['sonnet', 'opus'] }),
      ]);
      expect(view.get('availableModels')).toEqual(['sonnet', 'opus']);
    });

    test('a managed `model` is a starting default: it is read like any other key, and it is availableModels that locks', () => {
      const view = createGeneralView([
        layerOf('user', { model: 'haiku' }),
        layerOf('managed', { model: 'opus', availableModels: ['opus', 'sonnet'] }),
      ]);
      expect(view.get('model')).toBe('opus');
      expect(view.get('availableModels')).toEqual(['opus', 'sonnet']);
    });
  });
});

spec('settingsMerge.settings.Change a setting for one session.--settings', () => {
  describe('--settings can set any key a user file can set, and neither a Managed nor a Global config key', () => {
    test('a key every file accepts is read from --settings', () => {
      expect(createGeneralView([layerOf('flag', { model: 'opus' })]).get('model')).toBe('opus');
    });

    test('a key whose entry reads --settings beside user and managed settings (modelPicker) is read from it', () => {
      const picker = { options: [{ model: 'opus' }] };
      expect(
        createGeneralView([layerOf('flag', { modelPicker: picker })]).get('modelPicker'),
      ).toEqual(picker);
      expect(
        createGeneralView([layerOf('project', { modelPicker: picker })]).get('modelPicker'),
      ).toBeUndefined();
    });

    test('a Managed key is dropped from --settings with a warning', () => {
      const issues = issuesOfFlag({ allowManagedHooksOnly: true });
      expect(issues.map((one) => one.severity)).toEqual(['warning']);
      expect(issues[0]?.message).toContain('allowManagedHooksOnly');
      expect(
        createGeneralView([layerOf('flag', { allowManagedHooksOnly: true })]).get(
          'allowManagedHooksOnly',
        ),
      ).toBeUndefined();
    });

    test('a Global config key is dropped from --settings, and from every file, with a warning', () => {
      for (const scope of ['flag', 'user', 'project', 'local', 'managed'] as const) {
        const read = issuesOfFlag({ autoConnectIde: true }, scope);
        expect(read.map((one) => one.severity)).toEqual(['warning']);
        expect(read[0]?.message).toContain('~/.claude.json');
        expect(layerOf(scope, { autoConnectIde: true }).settings).toEqual({});
      }
    });
  });
});
