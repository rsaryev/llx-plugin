/**
 * host-marketplace.md § Authenticate archive downloads (the table of places and when the command
 * runs); § When Claude Code skips a headersHelper command or drops its output; § How users accept
 * a headersHelper command; § Installs and updates that refuse a command instead of asking;
 * § When a marketplace `url` source's command runs. settings-reference.md § extraKnownMarketplaces
 * (add-dir, header filter by file), § allowManagedHooksOnly and § disableCommandPluginSources.
 */
import { describe, expect, test } from 'bun:test';
import { helperAllowed } from '../../src/marketplace/header-policy.ts';
import { ARCHIVE_URL, layerOfEntry, setting, sourceLayer } from '../support/marketplace-headers.ts';
import { spec } from '../support/spec.ts';

const helper = './mint.sh';

spec('marketplace.sourceField.headersHelper', () => {
  test('a url source on an https:// marketplace URL runs its command from user settings without asking', () => {
    expect(helperAllowed(sourceLayer({ headersHelper: helper }), setting())).toEqual({
      allowed: true,
    });
  });

  test('a marketplace URL that does not start with https:// never runs the command', () => {
    const layer = sourceLayer({ url: 'http://plugins.example.com/marketplace.json' });
    const verdict = helperAllowed({ ...layer, headersHelper: helper }, setting());
    expect(verdict).toMatchObject({ allowed: false, reason: 'not-https', effect: 'skip-helper' });
  });

  test('a --settings file and a managed settings file run it without asking', () => {
    for (const origin of ['cli-settings', 'managed'] as const) {
      expect(helperAllowed(sourceLayer({ headersHelper: helper }, origin), setting())).toEqual({
        allowed: true,
      });
    }
  });

  test('project settings run it only after the folder is trusted', () => {
    const layer = sourceLayer({ headersHelper: helper }, 'project');
    expect(helperAllowed(layer, setting())).toMatchObject({
      allowed: false,
      reason: 'folder-not-trusted',
      effect: 'skip-helper',
    });
    expect(helperAllowed(layer, setting({ folderTrusted: true }))).toEqual({ allowed: true });
  });

  test('server-managed settings run it only after the user approves them', () => {
    const layer = sourceLayer({ headersHelper: helper }, 'server-managed');
    expect(helperAllowed(layer, setting())).toMatchObject({
      allowed: false,
      reason: 'settings-not-approved',
    });
    expect(helperAllowed(layer, setting({ settingsApproved: true }))).toEqual({ allowed: true });
  });

  test('an --add-dir directory never runs it, even when the folder is trusted', () => {
    const layer = sourceLayer({ headersHelper: helper }, 'add-dir');
    expect(helperAllowed(layer, setting({ folderTrusted: true, settingsApproved: true }))).toEqual({
      allowed: false,
      reason: 'ignored-add-dir',
      effect: 'skip-helper',
      message: expect.stringContaining('--add-dir'),
    });
  });
});

describe('managed policy blocks', () => {
  const layer = sourceLayer({ headersHelper: helper });

  spec(['marketplace.sourceField.headersHelper', 'marketplace.entry.headersHelper'], () => {
    test('disableCommandPluginSources true blocks the command', () => {
      expect(helperAllowed(layer, setting({ disableCommandPluginSources: true }))).toMatchObject({
        allowed: false,
        reason: 'blocked-by-policy',
        effect: 'skip-helper',
      });
    });

    test('allowManagedHooksOnly blocks it too unless disableCommandPluginSources is explicitly false', () => {
      const blocked = setting({ allowManagedHooksOnly: true });
      expect(helperAllowed(layer, blocked)).toMatchObject({ reason: 'blocked-by-policy' });
      expect(helperAllowed(layer, { ...blocked, disableCommandPluginSources: false })).toEqual({
        allowed: true,
      });
      expect(helperAllowed(layer, setting({ allowManagedHooksOnly: false }))).toEqual({
        allowed: true,
      });
    });

    test('under either block the command still runs for a marketplace that managed settings declare', () => {
      for (const policy of [
        { disableCommandPluginSources: true },
        { allowManagedHooksOnly: true },
      ]) {
        expect(helperAllowed(layer, setting({ ...policy, managedMarketplace: true }))).toEqual({
          allowed: true,
        });
        const entry = layerOfEntry({ headersHelper: helper });
        expect(helperAllowed(entry, setting({ ...policy, managedMarketplace: true }))).toEqual({
          allowed: true,
        });
      }
    });
  });
});

spec('marketplace.entry.headersHelper', () => {
  test('an entry command runs when a user installs or updates that one plugin and accepts it', () => {
    for (const operation of ['install', 'update'] as const) {
      expect(
        helperAllowed(layerOfEntry({ headersHelper: helper }, { operation }), setting()),
      ).toEqual({ allowed: true });
    }
  });

  test('without the user accepting the command it does not run and the archive is not downloaded', () => {
    const verdict = helperAllowed(
      layerOfEntry({ headersHelper: helper }, { accepted: undefined }),
      setting(),
    );
    expect(verdict).toMatchObject({
      allowed: false,
      reason: 'not-accepted',
      effect: 'refuse-download',
    });
  });

  test('only the command and archive URL the user was shown run: a changed command or path refuses', () => {
    const changedCommand = layerOfEntry(
      { headersHelper: helper },
      { accepted: { command: '/opt/bin/other.sh', archiveUrl: ARCHIVE_URL } },
    );
    const changedPath = layerOfEntry(
      { headersHelper: helper },
      {
        accepted: {
          command: helper,
          archiveUrl: 'https://plugins.example.com/p/formatter-1.0.0.zip',
        },
      },
    );
    for (const layer of [changedCommand, changedPath]) {
      expect(helperAllowed(layer, setting())).toMatchObject({
        allowed: false,
        reason: 'not-accepted',
        effect: 'refuse-download',
      });
    }
  });

  test('a change in the query string alone does not count, unless the host says it does', () => {
    const accepted = { command: helper, archiveUrl: `${ARCHIVE_URL}?sig=old` };
    const drifted = layerOfEntry({ headersHelper: helper }, { accepted });
    expect(helperAllowed(drifted, setting())).toEqual({ allowed: true });
    const strict = layerOfEntry(
      { headersHelper: helper },
      { accepted: { ...accepted, queryCounts: true } },
    );
    expect(helperAllowed(strict, setting())).toMatchObject({
      allowed: false,
      reason: 'not-accepted',
    });
  });

  test('installing several plugins, a suggestion or a dependency refuses the plugin and points at its own view', () => {
    for (const operation of ['bulk-install', 'suggestion', 'dependency'] as const) {
      const verdict = helperAllowed(
        layerOfEntry({ headersHelper: helper }, { operation }),
        setting(),
      );
      expect(verdict).toMatchObject({
        allowed: false,
        reason: 'needs-own-view',
        effect: 'refuse-download',
        message: expect.stringContaining('/plugin'),
      });
    }
  });

  test('background auto-update and session start list the plugin in the /plugin Errors tab', () => {
    for (const operation of ['background-update', 'session-start'] as const) {
      const verdict = helperAllowed(
        layerOfEntry({ headersHelper: helper }, { operation }),
        setting(),
      );
      expect(verdict).toMatchObject({
        allowed: false,
        reason: 'listed-in-errors',
        effect: 'refuse-download',
        message: expect.stringContaining('Errors'),
      });
    }
  });

  test('an entry in project settings also needs the trusted folder; one in --add-dir settings never runs', () => {
    const project = layerOfEntry({ headersHelper: helper }, { origin: 'project' });
    expect(helperAllowed(project, setting())).toMatchObject({ reason: 'folder-not-trusted' });
    expect(helperAllowed(project, setting({ folderTrusted: true }))).toEqual({ allowed: true });
    const addDir = layerOfEntry({ headersHelper: helper }, { origin: 'add-dir' });
    expect(helperAllowed(addDir, setting({ folderTrusted: true }))).toMatchObject({
      reason: 'ignored-add-dir',
    });
  });
});

describe('where a refused command leaves the fixed headers (judgment)', () => {
  test('a policy block and a missing trust skip the command only; the entry operations refuse the download', () => {
    const effects = [
      helperAllowed(
        sourceLayer({ headersHelper: helper }),
        setting({ disableCommandPluginSources: true }),
      ),
      helperAllowed(sourceLayer({ headersHelper: helper }, 'project'), setting()),
      helperAllowed(layerOfEntry({ headersHelper: helper }, { accepted: undefined }), setting()),
    ].map((verdict) => ('effect' in verdict ? verdict.effect : 'ran'));
    expect(effects).toEqual(['skip-helper', 'skip-helper', 'refuse-download']);
  });
});
