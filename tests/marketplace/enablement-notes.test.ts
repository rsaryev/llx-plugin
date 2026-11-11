/**
 * plugins/loading.md § Find where a plugin is enabled (six sources, the highest that mentions the id
 * wins), § Disabled in user settings but still loads (the row of `claude plugin list` and `/plugin`
 * names the source that overrode you: `project`, `project, gitignored`, `cli flag` or `managed`; the
 * opt-out is a `false` in `.claude/settings.local.json`) and § Enabled in project settings but not
 * installed (an external-source plugin is fetched only when user settings, an untracked
 * `.claude/settings.local.json`, `--settings` or managed settings set it to `true`; a relative-path
 * entry or a seed directory needs no fetch); plugins/troubleshooting.md carries the same two
 * entries. The wording for sources other than `project` is a row in spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import {
  decideEnabledFetch,
  overriddenUserDisable,
  type EnabledFacts,
} from '../../src/marketplace/enablement-notes.ts';
import { enabledNotInstalled } from '../../src/marketplace/install-errors.ts';
import { spec } from '../support/spec.ts';

const STILL_LOADS = [
  'install.loading.Disabled in user settings but still loads',
  'install.troubleshooting.Disabled in ~/.claude/settings.json but still loads',
];

spec(STILL_LOADS, () => {
  test('a user `false` beaten by a project `true` says project settings enable it', () => {
    expect(overriddenUserDisable({ user: false, decidedBy: 'project', on: true })?.message).toBe(
      'Disabled in ~/.claude/settings.json but still loads — project settings enable it, which overrides your user setting',
    );
  });

  test.each([
    ['project', 'project'],
    ['local', 'project, gitignored'],
    ['flag', 'cli flag'],
    ['managed', 'managed'],
  ] as const)('the message names the source that overrode you: %s as "%s"', (decidedBy, label) => {
    const note = overriddenUserDisable({ user: false, decidedBy, on: true });
    expect(note?.message).toContain(`— ${label} `);
    expect(note?.message).toStartWith('Disabled in ~/.claude/settings.json but still loads');
  });

  test('only a project-enabled plugin can be opted out of: set the id to false in .claude/settings.local.json', () => {
    expect(overriddenUserDisable({ user: false, decidedBy: 'project', on: true })?.optOut).toEqual({
      file: '.claude/settings.local.json',
      value: false,
    });
    expect(
      overriddenUserDisable({ user: false, decidedBy: 'managed', on: true })?.optOut,
    ).toBeUndefined();
    expect(
      overriddenUserDisable({ user: false, decidedBy: 'flag', on: true })?.optOut,
    ).toBeUndefined();
  });

  test('nothing to say when the plugin is off, was not disabled by the user, or the user setting decided', () => {
    expect(overriddenUserDisable({ user: false, decidedBy: 'user', on: false })).toBeUndefined();
    expect(overriddenUserDisable({ user: true, decidedBy: 'project', on: true })).toBeUndefined();
    expect(overriddenUserDisable({ decidedBy: 'project', on: true })).toBeUndefined();
    expect(overriddenUserDisable({ user: false, decidedBy: 'project', on: false })).toBeUndefined();
  });

  test('a --add-dir directory ranks below user settings and never overrides it', () => {
    expect(overriddenUserDisable({ user: false, decidedBy: 'addDir', on: true })).toBeUndefined();
  });
});

const facts = (overrides: Partial<EnabledFacts> = {}): EnabledFacts => ({
  name: 'formatter',
  marketplace: 'acme',
  trueIn: [{ source: 'project' }],
  installed: false,
  relativePath: false,
  seeded: false,
  ...overrides,
});

spec('install.loading.Enabled in project settings but not installed', () => {
  test('a plugin only the project enables is not fetched, and the Errors tab says it is not installed here', () => {
    expect(decideEnabledFetch(facts())).toEqual({
      fetch: false,
      inPlace: false,
      error: enabledNotInstalled('formatter', 'acme'),
    });
  });

  test.each([
    ['user settings', [{ source: 'project' }, { source: 'user' }]],
    [
      'an untracked .claude/settings.local.json',
      [{ source: 'project' }, { source: 'local', gitTracked: false }],
    ],
    ['the --settings flag', [{ source: 'project' }, { source: 'flag' }]],
    ['managed settings', [{ source: 'managed' }]],
  ] as const)('an external-source plugin is fetched when %s sets it to true', (_label, trueIn) => {
    const decision = decideEnabledFetch(facts({ trueIn }));
    expect(decision.fetch).toBe(true);
    expect(decision.error).toBeUndefined();
  });

  test('a .claude/settings.local.json that git tracks does not count', () => {
    const decision = decideEnabledFetch(
      facts({ trueIn: [{ source: 'project' }, { source: 'local', gitTracked: true }] }),
    );
    expect(decision.fetch).toBe(false);
    expect(decision.error?.message).toContain("isn't installed here");
  });

  test('a relative-path entry needs no install record: it loads from the marketplace itself', () => {
    expect(decideEnabledFetch(facts({ relativePath: true }))).toEqual({
      fetch: false,
      inPlace: true,
    });
  });

  test('a seed directory that already holds the plugin means no fetch and no error', () => {
    expect(decideEnabledFetch(facts({ seeded: true }))).toEqual({ fetch: false, inPlace: false });
  });

  test('an installed plugin has nothing to fetch and nothing to report', () => {
    expect(decideEnabledFetch(facts({ installed: true }))).toEqual({
      fetch: false,
      inPlace: false,
    });
  });

  test('a --add-dir true alone fetches nothing and is not a project setting: no error either', () => {
    expect(decideEnabledFetch(facts({ trueIn: [{ source: 'addDir' }] }))).toEqual({
      fetch: false,
      inPlace: false,
    });
  });
});

spec(
  `install.troubleshooting.Plugin "<name>" is enabled in project settings but isn't installed here`,
  () => {
    test('the entry appears for a plugin the project enables, with the install guidance', () => {
      const error = decideEnabledFetch(facts()).error;
      expect(error?.message).toBe(
        `Plugin "formatter" is enabled in project settings but isn't installed here`,
      );
      expect(error?.guidance).toBe(
        'Run claude plugin install formatter@acme --scope project to install it for this project',
      );
    });

    test('after the install the entry is gone', () => {
      expect(decideEnabledFetch(facts({ installed: true })).error).toBeUndefined();
    });
  },
);

describe('a plugin nothing enables', () => {
  test('is not fetched and reports nothing', () => {
    expect(decideEnabledFetch(facts({ trueIn: [] }))).toEqual({ fetch: false, inPlace: false });
  });
});
