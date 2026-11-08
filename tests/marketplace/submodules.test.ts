/**
 * marketplace-reference.md § Relative path plugin source, sub-section "Git submodules in the
 * marketplace repository" (Claude Code v2.1.295 and later).
 */
import { describe, expect, test } from 'bun:test';
import type { MarketplaceSource, PluginSource } from '../../src/format/marketplace/types.ts';
import { planPluginFetch } from '../../src/marketplace/fetch-plan.ts';
import {
  selectSubmodules,
  submodulePaths,
  type SubmoduleEvidence,
} from '../../src/marketplace/submodules.ts';
import { spec } from '../support/spec.ts';

const evidence = (rest: Partial<SubmoduleEvidence> = {}): SubmoduleEvidence => ({
  submodules: ['vendor/tool', 'plugins/formatter/lib', 'plugins/linter', 'docs/theme'],
  plugin: 'plugins/formatter',
  linkTargets: [],
  componentDirectories: [],
  configPaths: [],
  texts: [],
  undecidable: false,
  ...rest,
});

const relative = (path: string): PluginSource => ({ kind: 'relative', path, bare: false });
const ruleOf = (path: string, marketplaceOrigin?: MarketplaceSource) => {
  const { plan } = planPluginFetch(relative(path), {
    platform: 'posix',
    ...(marketplaceOrigin === undefined ? {} : { marketplaceOrigin }),
  });
  return plan?.kind === 'local' ? plan.submodules : undefined;
};
const subtree = (rest: Partial<SubmoduleEvidence> = {}) =>
  selectSubmodules('plugin-subtree', evidence(rest));
const root = (rest: Partial<SubmoduleEvidence> = {}) =>
  selectSubmodules('whole-repository', evidence({ plugin: '.', ...rest }));

spec(
  [
    'marketplace.source.Relative path',
    'marketplace.rule.Git submodules in the marketplace repository',
    'marketplace.rule.Git submodules in the marketplace repository.A component directory',
    "marketplace.rule.Git submodules in the marketplace repository.A file Claude Code can't read",
    "marketplace.rule.Git submodules in the marketplace repository.A path in the plugin's configuration",
    'marketplace.rule.Git submodules in the marketplace repository.A SKILL.md at the root',
    'marketplace.rule.Git submodules in the marketplace repository.A symbolic link',
    "marketplace.rule.Git submodules in the marketplace repository.Text in the plugin's files",
    'marketplace.rule.Git submodules in the marketplace repository.The plugin is inside the submodule',
    'marketplace.rule.Git submodules in the marketplace repository.The submodule is inside the plugin',
    'marketplace.create.Keep unused submodules out of the clone',
    "marketplace.troubleshooting.A root plugin's files from a git submodule are missing after install",
  ],
  () => {
    describe('a plugin in a subdirectory', () => {
      test('fetches a submodule inside the plugin', () => {
        expect(subtree()).toEqual(['plugins/formatter/lib']);
      });

      test('fetches the submodule that is the plugin directory, or a directory above it', () => {
        expect(subtree({ submodules: ['plugins/formatter', 'other'] })).toEqual([
          'plugins/formatter',
        ]);
        expect(subtree({ submodules: ['plugins', 'other'] })).toEqual(['plugins']);
      });

      test('fetches a submodule a committed symbolic link points into', () => {
        expect(subtree({ linkTargets: ['vendor/tool/bin/run'] })).toEqual([
          'vendor/tool',
          'plugins/formatter/lib',
        ]);
        expect(subtree({ linkTargets: ['vendor/tool'] })).toContain('vendor/tool');
      });

      test('fetches nothing when nothing touches a submodule', () => {
        expect(subtree({ submodules: ['vendor/tool', 'docs/theme'] })).toEqual([]);
        expect(subtree({ submodules: [] })).toEqual([]);
      });

      test('a path that only shares a name prefix with the plugin is not inside it', () => {
        expect(
          subtree({ submodules: ['plugins/formatter-extra', 'plugins/formatters/x'] }),
        ).toEqual([]);
      });

      test('ignores what only a root plugin looks at', () => {
        expect(
          subtree({
            submodules: ['vendor/tool'],
            componentDirectories: ['vendor/tool'],
            configPaths: ['vendor/tool'],
            texts: ['vendor/tool'],
          }),
        ).toEqual([]);
      });
    });

    describe('a plugin at the marketplace root', () => {
      test('gets every submodule when a component directory points into one', () => {
        expect(root({ componentDirectories: ['vendor/tool'] })).toEqual(evidence().submodules);
      });

      test('gets every submodule when a configured path points into one', () => {
        expect(root({ configPaths: ['vendor/tool/hooks.json'] })).toHaveLength(4);
      });

      test('gets every submodule when a symbolic link points into one', () => {
        expect(root({ linkTargets: ['docs/theme/x'] })).toHaveLength(4);
      });

      test('gets every submodule when a file names a submodule path', () => {
        expect(root({ texts: ['{"command": "vendor/tool/run.sh"}'] })).toHaveLength(4);
      });

      test('gets none when none of them points into a submodule', () => {
        expect(
          root({
            componentDirectories: ['skills', 'hooks'],
            configPaths: ['skills/a'],
            texts: ['{"command": "bin/run.sh"}'],
          }),
        ).toEqual([]);
      });
    });

    describe('when the kit cannot tell', () => {
      test('a plugin in a subdirectory gets every submodule', () => {
        expect(subtree({ undecidable: true })).toEqual(evidence().submodules);
      });

      test('a plugin at the root (a root SKILL.md, an unreadable file) gets every submodule', () => {
        expect(root({ undecidable: true })).toEqual(evidence().submodules);
      });
    });

    test('a sparse checkout fetches no submodule, even when the plugin is inside one', () => {
      expect(
        selectSubmodules('none', evidence({ undecidable: true, plugin: 'vendor/tool' })),
      ).toEqual([]);
    });

    describe('the rule a fetch plan carries', () => {
      const git = { kind: 'git', url: 'https://h/r.git', path: 'm.json' } as const;

      test('a plugin in a subdirectory takes the subtree rule and the root the whole-repository rule', () => {
        expect(ruleOf('plugins/f')).toBe('plugin-subtree');
        expect(ruleOf('.')).toBe('whole-repository');
        expect(ruleOf('plugins/f', git)).toBe('plugin-subtree');
        expect(ruleOf('.', { kind: 'github', repo: 'o/r', path: 'm.json' })).toBe(
          'whole-repository',
        );
      });

      test('sparsePaths fetch no submodule', () => {
        expect(ruleOf('plugins/f', { ...git, sparsePaths: ['plugins'] })).toBe('none');
        expect(ruleOf('.', { ...git, sparsePaths: ['.claude-plugin'] })).toBe('none');
        expect(ruleOf('.', { ...git, sparsePaths: [] })).toBe('whole-repository');
      });
    });
  },
);

describe('judgments: submodules', () => {
  test('a marketplace that was not cloned has no submodule to fetch', () => {
    const { plan } = planPluginFetch(
      { kind: 'relative', path: 'plugins/f', bare: false },
      { platform: 'posix', marketplaceOrigin: { kind: 'directory', path: '/m' } },
    );
    expect(plan).toMatchObject({ kind: 'local', submodules: 'none' });
  });

  test('a path that holds a submodule counts like one inside it, so the rule errs toward fetching', () => {
    expect(root({ componentDirectories: ['vendor'] })).toHaveLength(4);
    expect(root({ configPaths: ['./vendor/'] })).toHaveLength(4);
  });

  test('paths are compared without a leading "./", a trailing "/" or a backslash', () => {
    expect(subtree({ submodules: ['./plugins/formatter/lib/'] })).toEqual([
      'plugins/formatter/lib',
    ]);
    expect(subtree({ submodules: ['plugins\\formatter\\lib'] })).toEqual(['plugins/formatter/lib']);
  });

  test('submodulePaths reads the path of every submodule in a .gitmodules file', () => {
    const text = [
      '[submodule "tool"]',
      '\tpath = vendor/tool',
      '\turl = https://example.com/tool.git',
      '[submodule "theme"]',
      '  Path=docs/theme  ',
      '  url = https://example.com/theme.git',
      '',
    ].join('\r\n');
    expect(submodulePaths(text)).toEqual(['vendor/tool', 'docs/theme']);
    expect(submodulePaths('')).toEqual([]);
  });
});
