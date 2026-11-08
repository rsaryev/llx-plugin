/**
 * The composed policy over layered sources, with the scenarios the docs work through: settings.md
 * § Precedence examples (team settings over personal ones, organization settings over everything, the
 * command line over the files), plugins/org.md § Allow the official marketplace and your own (the
 * managed policy that allows two marketplaces, registers both, force-enables two plugins), and the
 * locks of settings-reference.md § `strictPluginOnlyCustomization` read through the hook policy.
 */
import { describe, expect, test } from 'bun:test';
import { error } from '../../src/format/issues.ts';
import { fromFrontmatter, fromManaged, fromSettings } from '../support/hook-policy.ts';
import { resolved } from '../support/policy-context.ts';
import { spec } from '../support/spec.ts';

const typed = { surface: 'interactive', text: 'plan this with ultracode' } as const;
const triggers = (...sources: Parameters<typeof resolved>[0]): boolean =>
  resolved(sources).workflows.keyword(typed).triggers;

const off = { workflowKeywordTriggerEnabled: false };
const on = { workflowKeywordTriggerEnabled: true };

describe('settings.md precedence examples, through the composed policy', () => {
  test('team settings override personal settings, and local settings win it back for you', () => {
    expect(triggers(['user', off], ['project', on])).toBe(true);
    expect(triggers(['user', off], ['project', on], ['local', off])).toBe(false);
  });

  test('organization settings override everything, --settings included', () => {
    expect(triggers(['managed', on], ['user', off], ['project', off], ['local', off])).toBe(true);
    expect(triggers(['managed', on], ['flag', off])).toBe(true);
    expect(triggers(['managed', off], ['flag', on], ['local', on])).toBe(false);
  });

  test('the command line overrides every file except managed settings, for that run', () => {
    expect(triggers(['user', off], ['project', off], ['local', off], ['flag', on])).toBe(true);
  });

  test('the order the sources are given in does not matter, the scope does', () => {
    expect(triggers(['flag', on], ['local', off], ['user', off])).toBe(true);
    expect(triggers(['user', off], ['local', off], ['flag', on])).toBe(true);
  });
});

describe('plugins/org.md "Allow the official marketplace and your own"', () => {
  const policy = {
    strictKnownMarketplaces: [
      { source: 'github', repo: 'anthropics/claude-plugins-official' },
      { source: 'github', repo: 'your-org/*' },
      { source: 'skills-dir' },
    ],
    extraKnownMarketplaces: {
      'claude-plugins-official': {
        source: { source: 'github', repo: 'anthropics/claude-plugins-official' },
      },
      'your-marketplace': { source: { source: 'github', repo: 'your-org/your-marketplace' } },
    },
    enabledPlugins: {
      'code-formatter@your-marketplace': true,
      'deploy-helper@your-marketplace': true,
    },
    disableSideloadFlags: true,
  };
  const machine = resolved([['managed', policy]], { hasManagedSettings: true });

  test('adding a source outside the list fails with the policy message and the allowed sources', () => {
    const verdict = machine.marketplaces.gate.check({
      source: 'git',
      url: 'https://example.com/other-marketplace.git',
    });
    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) {
      expect(verdict.message).toContain('is blocked by enterprise policy');
      expect(verdict.message).toContain(
        'Allowed sources: github:anthropics/claude-plugins-official',
      );
    }
  });

  test('the official marketplace and any repository of the organization are allowed', () => {
    const repos = ['anthropics/claude-plugins-official', 'your-org/anything', 'other-org/anything'];
    expect(
      repos.map((repo) => machine.marketplaces.gate.check({ source: 'github', repo }).allowed),
    ).toEqual([true, true, false]);
  });

  test('both marketplaces register, from managed settings', () => {
    const plan = machine.marketplaces.registry.registrations();
    expect(plan.map((each) => [each.name, each.from, each.status])).toEqual([
      ['claude-plugins-official', 'managed', 'register'],
      ['your-marketplace', 'managed', 'register'],
    ]);
  });

  test('the two plugins are force-enabled and cannot be turned off by the user', () => {
    const withUser = resolved(
      [
        ['managed', policy],
        ['user', { enabledPlugins: { 'code-formatter@your-marketplace': false } }],
      ],
      { hasManagedSettings: true },
    );
    expect(withUser.plugins.enabled('code-formatter@your-marketplace').on).toBe(true);
    expect(withUser.plugins.forceEnabledByManaged('deploy-helper@your-marketplace')).toBe(true);
  });

  test('skills-directory plugins keep loading: the allowlist has the skills-dir entry', () => {
    expect(machine.customization.skillsDirPlugins()).toEqual({ admitted: true });
    expect(machine.marketplaces.gate.skillsDirectoryPlugins()).toEqual({ admitted: true });
  });
});

spec('settings.key.strictPluginOnlyCustomization.hooks', () => {
  describe('the composed policy wires the lock into the hook policy', () => {
    const locked = resolved([['managed', { strictPluginOnlyCustomization: ['hooks'] }]]);

    test("hooks of the user's own files stop with the lock as the reason", () => {
      expect(locked.hooks.runs(fromSettings('project'))).toEqual({
        run: false,
        reason: 'strictPluginOnlyCustomization.hooks',
      });
      expect(locked.hooks.runs(fromFrontmatter('skill', 'user')).run).toBe(false);
    });

    test('managed hooks keep running, and the customization policy agrees', () => {
      expect(locked.hooks.runs(fromManaged).run).toBe(true);
      expect(locked.customization.loads('hooks', fromSettings('project'))).toBe(false);
      expect(locked.customization.loads('hooks', fromManaged)).toBe(true);
    });

    test('without the lock the same hooks run', () => {
      const open = resolved([['managed', { strictPluginOnlyCustomization: ['skills'] }]]);
      expect(open.hooks.runs(fromSettings('project')).run).toBe(true);
    });

    test('a lock from a parent the administrator does not let in neither stops hooks nor loads anything less', () => {
      const parent = resolved([['parent', { strictPluginOnlyCustomization: ['hooks'] }]], {
        hasManagedSettings: true,
      });
      expect(parent.hooks.runs(fromSettings('user')).run).toBe(true);
      expect(parent.customization.locked.size).toBe(0);
    });
  });
});

spec('settings.key.pluginSuggestionMarketplaces', () => {
  test('the composed plugin policy answers which suggestion marketplaces take effect', () => {
    const source = { source: 'github', repo: 'your-org/your-marketplace' } as const;
    const policy = resolved([
      [
        'managed',
        {
          extraKnownMarketplaces: { 'your-marketplace': { source } },
          pluginSuggestionMarketplaces: ['your-marketplace'],
        },
      ],
    ]);
    expect(policy.plugins.suggestionMarketplaces({ 'your-marketplace': source })).toEqual([
      'your-marketplace',
    ]);
    expect(policy.plugins.suggestionMarketplaces({})).toEqual([]);
  });
});

describe('parent settings across the areas', () => {
  const parentList = [
    'parent',
    { strictKnownMarketplaces: [{ source: 'github', repo: 'a/b' }] },
  ] as const;
  const adminOnly = ['managed', { disableAllHooks: false }] as const;

  test('a parent allowlist counts on a machine with no administrator', () => {
    const policy = resolved([parentList]);
    expect(policy.marketplaces.gate.check({ source: 'github', repo: 'x/y' }).allowed).toBe(false);
  });

  test('it is ignored where an administrator deploys managed settings without opting in, and counts when they merge', () => {
    const ignored = resolved([adminOnly, parentList], { hasManagedSettings: true });
    expect(ignored.marketplaces.gate.check({ source: 'github', repo: 'x/y' }).allowed).toBe(true);
    const merged = resolved([adminOnly, parentList], {
      hasManagedSettings: true,
      parentMerge: true,
    });
    expect(merged.marketplaces.gate.check({ source: 'github', repo: 'x/y' }).allowed).toBe(false);
  });
});

describe('what the composed policy collects', () => {
  test("the issues of reading the files pass through, then the registry's own", () => {
    const readIssue = error('strictKnownMarketplaces', 'dropped');
    const refused = resolved(
      [
        [
          'managed',
          {
            strictKnownMarketplaces: [{ source: 'github', repo: 'your-org/*' }],
            extraKnownMarketplaces: { rogue: { source: { source: 'github', repo: 'evil/rogue' } } },
          },
        ],
      ],
      {},
      [readIssue],
    );
    expect(refused.issues[0]).toBe(readIssue);
    expect(
      refused.issues.some((issue) => issue.path === 'extraKnownMarketplaces.rogue.source'),
    ).toBe(true);
  });

  test('a machine with no settings has no issues and every area answers', () => {
    const none = resolved([]);
    expect(none.issues).toEqual([]);
    expect(none.plugins.enabled('x@y').decidedBy).toBe('defaultEnabled');
    expect(none.marketplaces.gate.restrictionActive()).toBe(false);
    expect(none.hooks.runs(fromSettings('user')).run).toBe(true);
    expect(none.skills.bundledSkillsDisabled).toBe(false);
    expect(none.workflows.workflowsEnabled).toBe(true);
    expect(none.channels.gate().open).toBe(true);
    expect(none.customization.locked.size).toBe(0);
  });

  test("the host's context reaches each area: Pro turns workflows off, an untrusted folder hides the status line command", () => {
    expect(resolved([], { plan: { pro: true } }).workflows.workflowsEnabled).toBe(false);
    expect(resolved([], { isFolderTrusted: () => false }).hooks.commandsDisabled.statusLine).toBe(
      true,
    );
  });
});
