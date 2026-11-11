/**
 * `session.checkTool` with a `PathResolver`: the symlink check of permissions.md § Symlinks ("the
 * permission check covers two paths: the one Claude requested and the file it resolves to"; deny
 * rules "apply when either ... matches") runs over the input the PreToolUse hooks return (hooks.md,
 * "PreToolUse decision control": rules are evaluated "against the input your hook returns"), and
 * § Paths that can't be resolved or that change: "the Read, Edit, and Write tools refuse the
 * operation". No requirement id covers the symlink check (tests/rules/path-symlink.test.ts), so none
 * of it is under spec(); the resolver is faked.
 */
import { describe, expect, test } from 'bun:test';
import type { PathContext } from '../../src/rules/index.ts';
import { baseContext, rulesOf } from '../support/decide.ts';
import { hostOf, SESSION, signal } from '../support/host.ts';
import { fakeResolver } from '../support/path-resolver.ts';

const allowWith = (updatedInput: object) => ({
  stdout: JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', updatedInput },
  }),
});

const write = (file_path: string) => ({ toolName: 'Write', input: { file_path, content: 'x' } });

const DENY_PRIVATE = rulesOf(['deny', 'Edit(./private/**)']);

async function check(
  reply: object,
  options: { readonly paths?: PathContext; readonly links?: Record<string, string> } = {},
  resolve = true,
  loops: readonly string[] = [],
) {
  const { host } = await hostOf({ runs: [reply] });
  const base = baseContext('default', { rules: DENY_PRIVATE });
  const permissionContext =
    options.paths === undefined
      ? base
      : { ...base, match: { ...base.match, paths: options.paths } };
  const resolver = fakeResolver(options.links ?? { '/work/app/link': '/work/app/private' }, {
    loops,
  });
  return host.openSession(SESSION).checkTool(
    { ...write('/work/app/a.ts'), resolvedPaths: ['/work/app/a.ts'] },
    {
      toolUseId: 't1',
      permissionContext,
      signal: signal(),
      ...(resolve ? { resolver } : {}),
    },
  );
}

describe('judgments: checkTool runs the symlink check over the input that runs', () => {
  const intoPrivate = allowWith({ file_path: '/work/app/link/a.ts', content: 'x' });

  test('a hook that points the write through a link into a denied folder is denied', async () => {
    expect((await check(intoPrivate)).decision).toEqual({ outcome: 'deny', reason: 'deny-rule' });
  });

  test('without a resolver the call is taken as the host prepared it', async () => {
    expect((await check(intoPrivate, {}, false)).decision.outcome).toBe('allow');
  });

  test('under a current directory reached through a link the rule directories are resolved here', async () => {
    const paths: PathContext = {
      cwd: '/var/proj',
      home: '/home/alice',
      primaryWorkingDirectory: '/var/proj',
      additionalDirectories: [],
      platform: 'posix',
    };
    const links = {
      '/var/proj/link': '/private/var/proj/private',
      '/var/proj': '/private/var/proj',
    };
    const result = await check(allowWith({ file_path: '/var/proj/link/a.ts', content: 'x' }), {
      paths,
      links,
    });
    expect(result.decision).toEqual({ outcome: 'deny', reason: 'deny-rule' });
  });

  test('a path whose symlinks cannot be resolved is refused', async () => {
    const result = await check({}, {}, true, ['/work/app/a.ts']);
    expect(result.decision).toEqual({ outcome: 'deny', reason: 'unresolvable-path' });
    expect(result.refused).toEqual({
      failure: 'loop',
      message: 'symlinks of /work/app/a.ts form a loop',
    });
  });
});
