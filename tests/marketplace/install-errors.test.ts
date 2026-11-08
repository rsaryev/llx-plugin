/**
 * plugins/troubleshooting.md § Install a plugin (not found, with and without a hint, in any
 * marketplace, already installed globally, `Marketplace "<name>" is already added from a different
 * source`, `Failed to install: <plugin> (<reason>)`), § Plugin installed but not working (`Run
 * /reload-plugins to apply.`, `Plugin "<name>" not cached at <path>`, `Plugin directory does not
 * exist: <path>`, `Plugin "<name>" is enabled in project settings but isn't installed here`), §
 * No plugins available or No marketplaces configured, § Plugin directory not found at path. Quoted
 * texts are asserted verbatim; the joins the docs do not show are in spec/judgments.md.
 */
import { closePanel } from '../../src/marketplace/install-plans.ts';
import { describe, expect, test } from 'bun:test';
import {
  alreadyAddedFromDifferentSource,
  alreadyInstalledAtScope,
  alreadyInstalledGlobally,
  enabledNotInstalled,
  failedToInstall,
  failureOnce,
  installActivation,
  isInstalledGlobally,
  marketplaceDirectoryNotFound,
  nameTheMarketplace,
  noMarketplaces,
  notCached,
  PLUGINS_CHANGED,
  pluginDirectoryMissingAtRun,
  pluginDirectoryNotFound,
  pluginNotFound,
  pluginNotFoundAnywhere,
  reinstallCommand,
} from '../../src/marketplace/install-errors.ts';
import { spec } from '../support/spec.ts';

spec('install.troubleshooting.not found in marketplace with a refresh hint', () => {
  test('a catalog that was not refreshed carries the "may be out of date" hint', () => {
    expect(pluginNotFound('formatter', 'acme', { done: false })).toEqual({
      message: 'Plugin "formatter" not found in marketplace "acme"',
      hint: 'Your local copy may be out of date — try claude plugin marketplace update acme',
    });
  });

  test('a refresh that failed says so with the reason', () => {
    expect(pluginNotFound('formatter', 'acme', { done: false, failure: 'offline' }).hint).toBe(
      "The marketplace couldn't be refreshed (offline)",
    );
  });
});

spec('install.troubleshooting.not found in marketplace with no hint', () => {
  test('after a refresh the message has no hint: the name is the likeliest problem', () => {
    const found = pluginNotFound('formatter', 'acme', { done: true });
    expect(found).toEqual({ message: 'Plugin "formatter" not found in marketplace "acme"' });
    expect(found.hint).toBeUndefined();
  });
});

spec(`install.troubleshooting.Plugin "<name>" not found in any marketplace`, () => {
  test('a session says "any marketplace"; claude plugin install says "any configured marketplace"', () => {
    expect(pluginNotFoundAnywhere('formatter', 'session')).toBe(
      'Plugin "formatter" not found in any marketplace',
    );
    expect(pluginNotFoundAnywhere('formatter', 'shell')).toBe(
      'Plugin "formatter" not found in any configured marketplace',
    );
  });

  test('the fix names the marketplace so Claude Code refreshes it first', () => {
    expect(nameTheMarketplace('formatter')).toBe('/plugin install formatter@<marketplace>');
  });
});

spec(`install.troubleshooting.Plugin '<name>@<marketplace>' is already installed globally`, () => {
  test('refuses with the manage hint, and omits "globally" when typed without a marketplace', () => {
    expect(alreadyInstalledGlobally('formatter@acme', true)).toBe(
      "Plugin 'formatter@acme' is already installed globally. Use '/plugin' to manage existing plugins.",
    );
    expect(alreadyInstalledGlobally('formatter', false)).toBe(
      "Plugin 'formatter' is already installed. Use '/plugin' to manage existing plugins.",
    );
  });

  test('user scope and managed settings count; project or local only do not', () => {
    expect(isInstalledGlobally(['user'])).toBe(true);
    expect(isInstalledGlobally(['project', 'managed'])).toBe(true);
    expect(isInstalledGlobally(['project', 'local'])).toBe(false);
    expect(isInstalledGlobally([])).toBe(false);
  });

  test('the shell prints a different message for the target scope, with its scope', () => {
    expect(alreadyInstalledAtScope('formatter@acme', 'user')).toBe(
      'Plugin "formatter@acme" is already installed (scope: user)',
    );
  });
});

spec(
  `install.troubleshooting.Marketplace "<name>" is already added from a different source`,
  () => {
    test('names the existing source and the remove command', () => {
      expect(
        alreadyAddedFromDifferentSource('acme-tools', {
          kind: 'github',
          repo: 'acme/plugins',
          path: '.claude-plugin/marketplace.json',
        }),
      ).toBe(
        'Marketplace "acme-tools" is already added from a different source (github:acme/plugins). To use this source instead, remove that marketplace first with /plugin marketplace remove acme-tools.',
      );
    });
  },
);

spec('install.troubleshooting.No plugins available or No marketplaces configured', () => {
  test('with no marketplace, Discover is empty and the list command says none are configured', () => {
    expect(noMarketplaces([], 'discover')?.message).toBe('No plugins available');
    expect(noMarketplaces([], 'marketplace-list')?.message).toBe('No marketplaces configured');
  });

  test('the fix adds the official marketplace', () => {
    expect(noMarketplaces([], 'discover')?.guidance).toBe(
      '/plugin marketplace add anthropics/claude-plugins-official',
    );
  });

  test('a registered marketplace is a catalog: nothing to say', () => {
    expect(noMarketplaces(['claude-plugins-official'], 'discover')).toBeUndefined();
  });
});

spec('install.troubleshooting.Failed to install: <plugin> (<reason>)', () => {
  test('names each plugin and its reason', () => {
    expect(failedToInstall([{ plugin: 'formatter', reason: 'network down' }])).toBe(
      'Failed to install: formatter (network down)',
    );
  });

  test('a reason of several lines shows its first, and the summary points to the details', () => {
    expect(
      failedToInstall([
        { plugin: 'formatter', reason: 'git clone failed\nfatal: unable to access' },
      ]),
    ).toBe(
      'Failed to install: formatter (git clone failed) Installing a plugin from its details (Enter) in /plugin shows its full error.',
    );
  });

  test('without a shortened reason there is no pointer', () => {
    expect(
      failedToInstall([
        { plugin: 'a', reason: 'x' },
        { plugin: 'b', reason: 'y' },
      ]),
    ).not.toContain('Enter');
  });
});

spec('install.troubleshooting.Run /reload-plugins to apply.', () => {
  test('an install that activated ends "Plugin is now active."', () => {
    expect(installActivation({ invalidatesPromptCache: false, activationFailed: false })).toEqual({
      activated: true,
      ending: 'Plugin is now active.',
    });
  });

  test.each([
    ['activating it would invalidate the prompt cache', true, false],
    ['the activation attempt failed', false, true],
    ['both', true, true],
  ])('not activated because %s: the summary ends with the reload line', (_why, cache, failed) => {
    expect(installActivation({ invalidatesPromptCache: cache, activationFailed: failed })).toEqual({
      activated: false,
      ending: 'Run /reload-plugins to apply.',
    });
  });

  test('the panel closes and runs /reload-plugins for you, or queues it until the streaming response finishes', () => {
    const closed = { pending: true, invalidatesPromptCache: false };
    expect(closePanel({ ...closed, streaming: false })).toEqual({ reload: 'run' });
    expect(closePanel({ ...closed, streaming: true })).toEqual({
      reload: 'queue-until-response-ends',
    });
  });

  test('the notice that can appear above the prompt at the same time', () => {
    expect(PLUGINS_CHANGED).toBe('Plugins changed. Run /reload-plugins to activate.');
  });
});

spec(`install.troubleshooting.Plugin "<name>" not cached at <path>`, () => {
  test('the Errors tab pairs the message with "Run /plugin to refresh the plugin cache"', () => {
    expect(notCached('formatter', '/p/cache/acme/formatter/1.0.0')).toEqual({
      message: 'Plugin "formatter" not cached at /p/cache/acme/formatter/1.0.0',
      guidance: 'Run /plugin to refresh the plugin cache',
    });
  });

  test('the shell fix re-downloads: claude plugin install <name>@<marketplace>', () => {
    expect(reinstallCommand('formatter', 'acme')).toBe('claude plugin install formatter@acme');
  });
});

spec(
  `install.troubleshooting.Plugin "<name>" is enabled in project settings but isn't installed here`,
  () => {
    test('the Errors tab entry and its guidance line', () => {
      expect(enabledNotInstalled('formatter', 'acme')).toEqual({
        message: `Plugin "formatter" is enabled in project settings but isn't installed here`,
        guidance:
          'Run claude plugin install formatter@acme --scope project to install it for this project',
      });
    });
  },
);

spec('install.troubleshooting.Plugin directory not found at path: <path>', () => {
  test('a relative-path entry with no directory, and the marketplace directory that moved', () => {
    expect(pluginDirectoryNotFound('/m/plugins/my-plugin')).toBe(
      'Plugin directory not found at path: /m/plugins/my-plugin',
    );
    expect(marketplaceDirectoryNotFound('/m')).toBe('Marketplace directory not found at path: /m');
  });
});

spec('install.troubleshooting.Plugin directory does not exist: <path>', () => {
  test('a hook fails with the path and the plugin to reinstall', () => {
    expect(pluginDirectoryMissingAtRun('/p/cache/acme/f/1.0.0', 'f@acme')).toBe(
      'Failed to run: Plugin directory does not exist: /p/cache/acme/f/1.0.0 (f@acme — run /plugin to reinstall)',
    );
  });

  test('the failure is shown once per session for each hook event and command', () => {
    const first = failureOnce();
    expect(first('PreToolUse', 'a.sh')).toBe(true);
    expect(first('PreToolUse', 'a.sh')).toBe(false);
    expect(first('PreToolUse', 'b.sh')).toBe(true);
    expect(first('Stop', 'a.sh')).toBe(true);
    expect(failureOnce()('PreToolUse', 'a.sh')).toBe(true);
  });
});

describe('the pieces compose into one line the host can print', () => {
  test('a hint is not folded into the message', () => {
    expect(pluginNotFound('p', 'm', { done: false }).message).not.toContain('out of date');
  });
});
