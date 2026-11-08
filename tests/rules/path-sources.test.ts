/**
 * permissions.md § Where a pattern anchors: "A `/path` pattern anchors at a directory associated
 * with the settings source that defines it", the table of sources (project and local settings ->
 * primary working directory; user settings -> `~/.claude`; a `--settings <file>` -> the directory of
 * the file; CLI flags and session rules -> primary working directory), the worktree example, and
 * the user-settings example (`Read(/secrets/**)` blocks `~/.claude/secrets/**`, not a project
 * folder; `//` and `~/` apply inside every project).
 */
import { expect, test } from 'bun:test';
import type { RuleSource } from '../../src/rules/index.ts';
import { denies, withPaths } from '../support/path-rules.ts';
import { spec } from '../support/spec.ts';

const SOURCES: readonly (readonly [string, RuleSource, string])[] = [
  ['project settings at .claude/settings.json', { kind: 'project' }, '/work/app'],
  ['local settings at .claude/settings.local.json', { kind: 'local' }, '/work/app'],
  ['user settings at ~/.claude/settings.json', { kind: 'user' }, '/home/alice/.claude'],
  [
    'a file passed with --settings',
    { kind: 'flag-settings', file: '/etc/team/policy.json' },
    '/etc/team',
  ],
  ['CLI flags', { kind: 'cli' }, '/work/app'],
  ['session rules', { kind: 'session' }, '/work/app'],
];

spec('permissions.rule./path', () => {
  for (const [name, source, anchor] of SOURCES) {
    test(`a rule in ${name} resolves /path to ${anchor}/path`, () => {
      expect(denies('Read(/secrets/**)', `${anchor}/secrets/key`, { source })).toBe(true);
      for (const [, , other] of SOURCES.filter(([, , a]) => a !== anchor)) {
        expect(denies('Read(/secrets/**)', `${other}/secrets/key`, { source })).toBe(false);
      }
    });
  }

  test('a user-settings /secrets/** rule blocks ~/.claude/secrets/**, not a project secrets folder', () => {
    const source: RuleSource = { kind: 'user' };
    expect(denies('Read(/secrets/**)', '/home/alice/.claude/secrets/token', { source })).toBe(true);
    expect(denies('Read(/secrets/**)', '/work/app/secrets/token', { source })).toBe(false);
  });

  test('// and ~/ patterns in user settings apply inside every project', () => {
    const source: RuleSource = { kind: 'user' };
    expect(denies('Read(~/.ssh/**)', '/home/alice/.ssh/id_rsa', { source })).toBe(true);
    expect(denies('Read(//**/.env)', '/work/app/.env', { source })).toBe(true);
  });

  test('in a worktree session a shared Edit(/src/**) rule matches that worktree own src/', () => {
    const worktree = withPaths({
      cwd: '/work/app-wt',
      primaryWorkingDirectory: '/work/app-wt',
    });
    const options = { ctx: worktree, source: { kind: 'local' } as const, tool: 'Edit' };
    expect(denies('Edit(/src/**)', '/work/app-wt/src/a.ts', options)).toBe(true);
    expect(denies('Edit(/src/**)', '/work/app/src/a.ts', options)).toBe(false);
  });

  test('a local rule anchors at the session directory, not at the repository root', () => {
    const ctx = withPaths({ cwd: '/work/app/pkg', primaryWorkingDirectory: '/work/app/pkg' });
    const options = { ctx, source: { kind: 'local' } as const, tool: 'Edit' };
    expect(denies('Edit(/src/**)', '/work/app/pkg/src/a.ts', options)).toBe(true);
    expect(denies('Edit(/src/**)', '/work/app/src/a.ts', options)).toBe(false);
  });
});

test('a flag-settings file in the filesystem root anchors at the root', () => {
  const source: RuleSource = { kind: 'flag-settings', file: '/policy.json' };
  expect(denies('Read(/secrets/**)', '/secrets/key', { source })).toBe(true);
});
