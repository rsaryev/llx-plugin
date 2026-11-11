/**
 * settings-reference.md § `enabledPlugins` (keyed by `plugin-name@marketplace-name`; "A plugin with
 * no entry at any scope falls back to its `defaultEnabled` value"; Scope: Any file; "A plugin set to
 * `false` [in managed settings] is blocked from installation at every scope and hidden from the
 * marketplace"; "Project settings take precedence over user settings ... To opt out of a
 * project-enabled plugin on your machine, set it to `false` in `.claude/settings.local.json`. Plugins
 * force-enabled by managed settings can't be disabled this way"), plugins/org.md § "Control matrix"
 * (`true` force-enables, `false` blocks at every scope and hides the plugin), plugins/loading.md §
 * "Find where a plugin came from" (`<name>@synced` is on unless the manifest sets
 * `defaultEnabled: false` or a settings file sets `"<name>@synced": false`) and plugins/manifest-reference.md
 * § `defaultEnabled` (defaults to `true`), § "hooks" in settings-reference.md (force-enabled plugins
 * are matched on the full `plugin@marketplace` id).
 */
import { describe, expect, test } from 'bun:test';
import { enabledPlugin, forceEnabledByManaged } from '../../../src/settings/plugins/index.ts';
import { spec } from '../../support/spec.ts';
import { plain } from '../../support/settings-layers.ts';
import { viewOf } from '../../support/plugin-settings.ts';

const docsExample = {
  enabledPlugins: {
    'code-formatter@team-tools': true,
    'deployment-tools@team-tools': true,
    'experimental-features@personal': false,
  },
};

spec(
  [
    'settings.key.enabledPlugins',
    'policy.org.Control matrix.enabledPlugins',
    'policy.org.Require plugins per repository',
  ],
  () => {
    test('the docs example turns two plugins on and one off', () => {
      const view = viewOf(['user', docsExample]);
      expect(enabledPlugin(view, 'code-formatter@team-tools').on).toBe(true);
      expect(enabledPlugin(view, 'deployment-tools@team-tools').on).toBe(true);
      const off = enabledPlugin(view, 'experimental-features@personal');
      expect(plain(off)).toEqual({
        on: false,
        decidedBy: 'user',
        blockedByManaged: false,
        hiddenInMarketplace: false,
      });
    });

    test('a plugin with no entry at any scope follows its defaultEnabled value, true when absent', () => {
      const view = viewOf(['user', docsExample]);
      expect(plain(enabledPlugin(view, 'other@team-tools'))).toEqual({
        on: true,
        decidedBy: 'defaultEnabled',
        blockedByManaged: false,
        hiddenInMarketplace: false,
      });
      expect(enabledPlugin(view, 'other@team-tools', false).on).toBe(false);
      expect(enabledPlugin(view, 'other@team-tools', false).decidedBy).toBe('defaultEnabled');
    });

    test('an entry beats the manifest default in either direction', () => {
      const view = viewOf(['user', { enabledPlugins: { 'a@m': true, 'b@m': false } }]);
      expect(enabledPlugin(view, 'a@m', false).on).toBe(true);
      expect(enabledPlugin(view, 'b@m', true).on).toBe(false);
    });

    test('project settings take precedence over user settings: a user false does not disable it', () => {
      const view = viewOf(
        ['user', { enabledPlugins: { 'shared@team': false } }],
        ['project', { enabledPlugins: { 'shared@team': true } }],
      );
      const decision = enabledPlugin(view, 'shared@team');
      expect(decision.on).toBe(true);
      expect(decision.decidedBy).toBe('project');
    });

    test('a project-enabled plugin is opted out of with a false in the local settings', () => {
      const view = viewOf(
        ['project', { enabledPlugins: { 'shared@team': true } }],
        ['local', { enabledPlugins: { 'shared@team': false } }],
      );
      const decision = enabledPlugin(view, 'shared@team');
      expect(decision.on).toBe(false);
      expect(decision.decidedBy).toBe('local');
    });

    test('a plugin force-enabled by managed settings cannot be disabled in local, project or user', () => {
      const view = viewOf(
        ['managed', { enabledPlugins: { 'guard@acme': true } }],
        ['local', { enabledPlugins: { 'guard@acme': false } }],
        ['project', { enabledPlugins: { 'guard@acme': false } }],
        ['user', { enabledPlugins: { 'guard@acme': false } }],
      );
      expect(enabledPlugin(view, 'guard@acme').on).toBe(true);
      expect(enabledPlugin(view, 'guard@acme').decidedBy).toBe('managed');
      expect(forceEnabledByManaged(view, 'guard@acme')).toBe(true);
    });

    test('a false in managed settings blocks the plugin at every scope and hides it in the marketplace', () => {
      const view = viewOf(
        ['managed', { enabledPlugins: { 'risky@market': false } }],
        ['user', { enabledPlugins: { 'risky@market': true } }],
        ['project', { enabledPlugins: { 'risky@market': true } }],
        ['local', { enabledPlugins: { 'risky@market': true } }],
      );
      expect(plain(enabledPlugin(view, 'risky@market'))).toEqual({
        on: false,
        decidedBy: 'managed',
        blockedByManaged: true,
        hiddenInMarketplace: true,
      });
      expect(forceEnabledByManaged(view, 'risky@market')).toBe(false);
    });

    test('a false in any other scope neither blocks nor hides the plugin', () => {
      for (const scope of ['user', 'project', 'local', 'flag'] as const) {
        const decision = enabledPlugin(
          viewOf([scope, { enabledPlugins: { 'p@m': false } }]),
          'p@m',
        );
        expect(decision.blockedByManaged).toBe(false);
        expect(decision.hiddenInMarketplace).toBe(false);
      }
    });

    test('every file carries the key: user, project, local, managed, --settings and --add-dir', () => {
      for (const scope of ['user', 'project', 'local', 'managed', 'flag', 'addDir'] as const) {
        const decision = enabledPlugin(
          viewOf([scope, { enabledPlugins: { 'p@m': true } }]),
          'p@m',
          false,
        );
        expect(decision.on).toBe(true);
        expect(decision.decidedBy).toBe(scope);
      }
    });

    test('--add-dir is the lowest source: a user false beats its true, and its false changes nothing', () => {
      const addDirTrue = ['addDir', { enabledPlugins: { 'p@m': true } }] as const;
      const addDirFalse = ['addDir', { enabledPlugins: { 'p@m': false } }] as const;
      const userTrue = ['user', { enabledPlugins: { 'p@m': true } }] as const;
      const userFalse = ['user', { enabledPlugins: { 'p@m': false } }] as const;

      const falseBelow = enabledPlugin(viewOf(addDirTrue, userFalse), 'p@m');
      expect(falseBelow.on).toBe(false);
      expect(falseBelow.decidedBy).toBe('user');

      const ignored = enabledPlugin(viewOf(addDirFalse, userTrue), 'p@m', false);
      expect(ignored.on).toBe(true);
      expect(ignored.decidedBy).toBe('user');
    });

    test('a --add-dir true alone turns the plugin on; its false alone leaves the manifest default', () => {
      const on = enabledPlugin(
        viewOf(['addDir', { enabledPlugins: { 'p@m': true } }]),
        'p@m',
        false,
      );
      expect(on.on).toBe(true);
      expect(on.decidedBy).toBe('addDir');
      const off = enabledPlugin(
        viewOf(['addDir', { enabledPlugins: { 'p@m': false } }]),
        'p@m',
        true,
      );
      expect(plain(off)).toEqual({
        on: true,
        decidedBy: 'defaultEnabled',
        blockedByManaged: false,
        hiddenInMarketplace: false,
      });
      expect(
        enabledPlugin(viewOf(['addDir', { enabledPlugins: { 'p@m': false } }]), 'p@m', false).on,
      ).toBe(false);
    });

    test('each plugin id is decided on its own: another id in a higher file does not shadow it', () => {
      const view = viewOf(
        ['user', { enabledPlugins: { 'a@m': false } }],
        ['project', { enabledPlugins: { 'b@m': true } }],
      );
      expect(enabledPlugin(view, 'a@m').on).toBe(false);
      expect(enabledPlugin(view, 'b@m').on).toBe(true);
    });

    test('force-enabled matches the full plugin@marketplace id, never the name alone', () => {
      const view = viewOf(['managed', { enabledPlugins: { 'formatter@acme': true } }]);
      expect(forceEnabledByManaged(view, 'formatter@acme')).toBe(true);
      expect(forceEnabledByManaged(view, 'formatter@other')).toBe(false);
      expect(forceEnabledByManaged(view, 'formatter')).toBe(false);
    });

    test('only managed settings force-enable: a true elsewhere is a preference', () => {
      const view = viewOf(['user', { enabledPlugins: { 'p@m': true } }]);
      expect(forceEnabledByManaged(view, 'p@m')).toBe(false);
    });

    test('"<name>@synced": false turns a synced plugin off in user settings and in the committed project file', () => {
      expect(
        enabledPlugin(
          viewOf(['user', { enabledPlugins: { 'notes@synced': false } }]),
          'notes@synced',
        ).on,
      ).toBe(false);
      expect(
        enabledPlugin(
          viewOf(['project', { enabledPlugins: { 'notes@synced': false } }]),
          'notes@synced',
        ).on,
      ).toBe(false);
    });

    test('a synced plugin is on unless the manifest sets defaultEnabled false or a file sets false', () => {
      const view = viewOf(['user', { enabledPlugins: { 'other@synced': false } }]);
      expect(enabledPlugin(view, 'notes@synced').on).toBe(true);
      expect(enabledPlugin(view, 'notes@synced', false).on).toBe(false);
    });

    test('a skills-dir plugin follows the manifest default unless a file sets true or false', () => {
      const view = viewOf(['project', { enabledPlugins: { 'on-by-file@skills-dir': true } }]);
      expect(enabledPlugin(view, 'on-by-file@skills-dir', false).on).toBe(true);
      expect(enabledPlugin(view, 'tool@skills-dir', false).on).toBe(false);
      expect(enabledPlugin(view, 'tool@skills-dir').on).toBe(true);
    });
  },
);

describe('what the docs leave open (spec/judgments.md)', () => {
  test('a value that is a list or an object (version constraints in the SDK type) counts as enabled', () => {
    const view = viewOf([
      'user',
      { enabledPlugins: { 'pinned@m': ['>=1.2.0'], 'ranged@m': { version: '^2' } } },
    ]);
    expect(enabledPlugin(view, 'pinned@m', false).on).toBe(true);
    expect(enabledPlugin(view, 'ranged@m', false).on).toBe(true);
  });

  test('a --settings file ranks between managed and local, as settings.md orders the levels', () => {
    const view = viewOf(
      ['local', { enabledPlugins: { 'p@m': false } }],
      ['flag', { enabledPlugins: { 'p@m': true } }],
    );
    expect(enabledPlugin(view, 'p@m').decidedBy).toBe('flag');
  });
});
