/**
 * plugins/relevance.md § Understand how plugin relevance works, § `relevance.signals` (limits per
 * signal), § Working directory matching, § Command name matching, § Manifest dependency matching,
 * § Preview what the user sees. The glob dialect, an invalid regular expression and the annotations the
 * docs do not quote are judgments, tested last, outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import {
  MANIFEST_SIZE_LIMIT,
  commandHosts,
  commandName,
  cwdMatches,
  globMatches,
  matchesAtSessionStart,
  matchingSignals,
  type SessionFacts,
} from '../../src/marketplace/relevance-match.ts';
import {
  discoverAnnotation,
  pinInDiscover,
  sessionStartNoticeText,
  showSessionStartNotice,
  showSpinnerTip,
  spinnerTipText,
  type SuggestionContext,
} from '../../src/marketplace/relevance-surface.ts';
import { spec } from '../support/spec.ts';

const R = 'marketplace.relevance.';
const U = `${R}Understand how plugin relevance works.`;
const facts = (extra: Partial<SessionFacts> = {}): SessionFacts => ({
  cwd: '/work/repo/infra',
  repositoryRoot: '/work/repo',
  commands: [],
  filesTouched: [],
  manifests: [],
  ...extra,
});

spec(`${R}Working directory matching`, () => {
  test('a pattern is matched against the absolute working directory', () => {
    expect(cwdMatches('/work/repo/infra', '/work/repo/infra')).toBe(true);
    expect(cwdMatches('/other/**', '/work/repo/infra')).toBe(false);
  });
  test('inside a git repository it also matches the path relative to the repository root', () => {
    expect(cwdMatches('infra', '/work/repo/infra', '/work/repo')).toBe(true);
    expect(cwdMatches('infra', '/work/repo/infra')).toBe(false);
  });
  test('matching is forward-slash normalized and case-insensitive', () => {
    expect(cwdMatches('INFRA', 'C:\\work\\repo\\Infra', 'C:\\work\\repo')).toBe(true);
  });
  test('every pattern matches the directory itself and everything under it', () => {
    for (const pattern of ['infra', 'infra/', 'infra/**']) {
      expect(cwdMatches(pattern, '/work/repo/infra', '/work/repo')).toBe(true);
      expect(cwdMatches(pattern, '/work/repo/infra/modules/a', '/work/repo')).toBe(true);
      expect(cwdMatches(pattern, '/work/repo/infrastructure', '/work/repo')).toBe(false);
    }
  });
  test('cwd is the only signal that can match at session start', () => {
    expect(matchesAtSessionStart({ cwd: ['infra'] }, '/work/repo/infra', '/work/repo')).toBe(true);
    expect(matchesAtSessionStart({ cli: ['terraform'] }, '/work/repo/infra', '/work/repo')).toBe(
      false,
    );
  });
});

spec(`${R}Command name matching`, () => {
  test('the name is the first token', () => {
    expect(commandName('terraform plan')).toBe('terraform');
  });
  test('leading environment variable assignments and sudo are skipped', () => {
    expect(commandName('TF_LOG=debug terraform plan')).toBe('terraform');
    expect(commandName('sudo terraform apply')).toBe('terraform');
    expect(commandName('A=1 sudo B=2 terraform init')).toBe('terraform');
  });
  test('a compound command contributes only its leading command', () => {
    expect(commandName('cd infra && terraform plan')).toBe('cd');
    const found = matchingSignals(
      { cli: ['terraform'] },
      facts({ commands: ['cd infra && terraform plan'] }),
    );
    expect(found).toEqual([]);
    expect(
      matchingSignals({ cli: ['cd'] }, facts({ commands: ['cd infra && terraform plan'] })),
    ).toEqual(['cli']);
  });
  test('the match is exact', () => {
    expect(
      matchingSignals({ cli: ['terraform'] }, facts({ commands: ['terraform-docs .'] })),
    ).toEqual([]);
    expect(matchingSignals({ cli: ['terraform'] }, facts({ commands: ['terraform fmt'] }))).toEqual(
      ['cli'],
    );
  });
});

spec(`${R}Manifest dependency matching`, () => {
  const dep = { file: '[/\\\\]package\\.json$', pattern: '"your-sdk"\\s*:' };
  const manifest = (path: string, content: string, size?: number) => ({
    path,
    content,
    ...(size === undefined ? {} : { size }),
  });
  const run = (item: ReturnType<typeof manifest>) =>
    matchingSignals({ manifestDeps: [dep] }, facts({ manifests: [item] }));

  test('the file is a case-insensitive regular expression over the path; the pattern a case-sensitive one over the contents', () => {
    expect(run(manifest('/work/PACKAGE.JSON', '{"your-sdk": "1"}'))).toEqual(['manifestDeps']);
    expect(run(manifest('/work/package.json', '{"YOUR-SDK": "1"}'))).toEqual([]);
  });
  test('the documented file pattern matches forward-slash and backslash paths, with a literal dot', () => {
    expect(run(manifest('C:\\work\\package.json', '"your-sdk": 1'))).toEqual(['manifestDeps']);
    expect(run(manifest('/work/packageXjson', '"your-sdk": 1'))).toEqual([]);
  });
  test('manifest files larger than 512 KB are skipped', () => {
    expect(run(manifest('/w/package.json', '"your-sdk": 1', MANIFEST_SIZE_LIMIT))).toEqual([
      'manifestDeps',
    ]);
    expect(run(manifest('/w/package.json', '"your-sdk": 1', MANIFEST_SIZE_LIMIT + 1))).toEqual([]);
  });
});

spec(`${R}relevance`, () => {
  test('a plugin is suggested only if at least one signal is set', () => {
    expect(matchingSignals({}, facts())).toEqual([]);
    expect(matchingSignals(undefined, facts())).toEqual([]);
  });
  test('the signals each match what the docs say, and the matching ones are listed in order', () => {
    const all = facts({
      commands: ['curl https://Registry.Terraform.io/v1/x'],
      filesTouched: ['/work/repo/main.TF'],
    });
    const signals = {
      cwd: ['infra'],
      cli: ['curl'],
      hosts: ['registry.terraform.io'],
      filesRead: ['**/*.tf'],
    };
    expect(matchingSignals(signals, all)).toEqual(['cwd', 'cli', 'hosts', 'filesRead']);
    expect(commandHosts('curl https://Registry.Terraform.io/v1/x')).toEqual([
      'registry.terraform.io',
    ]);
  });
});

const plugin = {
  name: 'terraform-helpers',
  marketplace: 'your-marketplace',
  relevance: { topic: 'Terraform' },
};
const context = (extra: Partial<SuggestionContext> = {}): SuggestionContext => ({
  installed: false,
  matched: ['cwd'],
  history: { timesShown: 0, discoverPinned: false },
  ...extra,
});

spec(`${U}Spinner tip`, () => {
  test('the tip reads "Working with <topic>? Install the <name> plugin:" and the install command', () => {
    expect(spinnerTipText(plugin)).toBe(
      'Working with Terraform? Install the terraform-helpers plugin:\n/plugin install terraform-helpers@your-marketplace',
    );
  });
  test('without a topic it is the plugin name with each hyphen segment capitalized', () => {
    expect(spinnerTipText({ name: 'terraform-helpers', marketplace: 'm' })).toContain(
      'Working with Terraform Helpers?',
    );
  });
  test('it shows when a signal matches and the plugin is not installed, and not otherwise', () => {
    expect(showSpinnerTip(context({ matched: ['cli'] }))).toBe(true);
    expect(showSpinnerTip(context({ matched: [] }))).toBe(false);
    expect(showSpinnerTip(context({ installed: true }))).toBe(false);
  });
  test('it shows at most once every three sessions', () => {
    const since = (sessionsSinceShown: number) =>
      context({ history: { sessionsSinceShown, timesShown: 1, discoverPinned: false } });
    expect(showSpinnerTip(since(1))).toBe(false);
    expect(showSpinnerTip(since(2))).toBe(false);
    expect(showSpinnerTip(since(3))).toBe(true);
  });
  test('spinnerTipsEnabled false, or an override that excludes the default tips, stops it', () => {
    expect(showSpinnerTip(context({ spinnerTipsEnabled: false }))).toBe(false);
    expect(showSpinnerTip(context({ tipsOverrideExcludesDefault: true }))).toBe(false);
  });
});

spec(`${U}Session-start notification`, () => {
  test('the line reads "plugin suggestion: <plugin>@<marketplace> · /plugin"', () => {
    expect(sessionStartNoticeText(plugin)).toBe(
      'plugin suggestion: terraform-helpers@your-marketplace · /plugin',
    );
  });
  test('it needs a cwd match', () => {
    expect(showSessionStartNotice(context())).toBe(true);
    expect(showSessionStartNotice(context({ matched: ['cli'] }))).toBe(false);
  });
  test('it stops once the tip and the notification have shown the plugin twice in all', () => {
    const shown = (timesShown: number) =>
      context({ history: { timesShown, discoverPinned: false } });
    expect(showSessionStartNotice(shown(1))).toBe(true);
    expect(showSessionStartNotice(shown(2))).toBe(false);
  });
  test('it shares the three-session spacing with the tip, and the two tip settings stop it', () => {
    const history = { sessionsSinceShown: 2, timesShown: 1, discoverPinned: false };
    expect(showSessionStartNotice(context({ history }))).toBe(false);
    expect(showSessionStartNotice(context({ spinnerTipsEnabled: false }))).toBe(false);
  });
  test('neither repeats once the plugin is installed', () => {
    expect(showSessionStartNotice(context({ installed: true }))).toBe(false);
  });
});

spec(`${U}/plugin Discover tab`, () => {
  test('the plugin is pinned the first time the tab opens while a signal matches', () => {
    expect(pinInDiscover(context())).toBe(true);
    expect(pinInDiscover(context({ matched: [] }))).toBe(false);
  });
  test('once pinned it appears in normal order', () => {
    expect(pinInDiscover(context({ history: { timesShown: 0, discoverPinned: true } }))).toBe(
      false,
    );
  });
  test('the tip settings do not affect the pin', () => {
    expect(
      pinInDiscover(context({ spinnerTipsEnabled: false, tipsOverrideExcludesDefault: true })),
    ).toBe(true);
  });
  test('the annotation names the matching signal', () => {
    expect(discoverAnnotation(['cwd'])).toBe('suggested for this directory');
    expect(discoverAnnotation(['cli'], 'terraform')).toBe('suggested for terraform commands');
    expect(discoverAnnotation([])).toBeUndefined();
  });
});

describe('judgments: relevance matching', () => {
  test('globs: ** crosses slashes, * and ? stay in a segment', () => {
    expect(globMatches('**/*.tf', '/a/b/c.tf')).toBe(true);
    expect(globMatches('*.tf', '/a/c.tf')).toBe(false);
    expect(globMatches('src/?.ts', 'src/a.ts')).toBe(true);
  });
  test('an invalid regular expression matches nothing', () => {
    const bad = { manifestDeps: [{ file: '(', pattern: 'x' }] };
    expect(matchingSignals(bad, facts({ manifests: [{ path: '(', content: 'x' }] }))).toEqual([]);
  });
});
