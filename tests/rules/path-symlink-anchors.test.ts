/**
 * A session directory reached through a link: the current directory (`/var/proj` on macOS is
 * `/private/var/proj`), the home directory, the working directories. permissions.md § Symlinks: "the
 * permission check covers two paths: the one Claude requested and the file it resolves to"; § How
 * rules match a symlinked path: allow rules "apply only when both the requested path and the file it
 * resolves to match", deny rules "when either ... matches", and "a deny or ask rule written through a
 * symlinked directory with a `//`, `~/`, or `/` pattern also applies at the directory's real
 * location"; § Writes through a symlink: what counts is where the file "resolves to sits relative to
 * your working directories". The docs do not name a `./` rule under a linked current directory nor a
 * working directory that is itself a link: judgments (spec/judgments.md), so none of it is under
 * spec(). The resolver is the kit's `PathResolver` port, faked here.
 */
import { describe, expect, test } from 'bun:test';
import {
  decide,
  evaluateRules,
  prepareCall,
  resolveRuleDirectories,
  type MatchContext,
  type PathContext,
  type PermissionRule,
} from '../../src/rules/index.ts';
import { baseContext } from '../support/decide.ts';
import { fakeResolver } from '../support/path-resolver.ts';
import { inputFor } from '../support/path-rules.ts';
import { call, parsed } from '../support/rule-context.ts';

/** A project opened as `/var/proj`, really `/private/var/proj`, with `link` pointing into `private`. */
const LINKED_CWD: PathContext = {
  cwd: '/var/proj',
  home: '/home/alice',
  primaryWorkingDirectory: '/var/proj',
  additionalDirectories: [],
  platform: 'posix',
};
const LINKS = {
  '/var/proj/link': '/private/var/proj/private',
  '/private/var/proj/link': '/private/var/proj/private',
  '/var/proj': '/private/var/proj',
};

/** The verdict of `rules` on a read of `path`, prepared and matched the way a host does it. */
async function readVerdict(
  rules: readonly PermissionRule[],
  path: string,
  options: {
    readonly paths?: PathContext;
    readonly links?: Readonly<Record<string, string>>;
    readonly missing?: readonly string[];
  } = {},
) {
  const { paths = LINKED_CWD, links = LINKS, missing = [] } = options;
  const resolver = fakeResolver(links, { missing });
  const realDirectories = await resolveRuleDirectories(rules, paths, resolver);
  const ctx: MatchContext = { paths: { ...paths, realDirectories } };
  const prepared = await prepareCall(call('Read', inputFor('Read', path)), paths, resolver);
  if ('failure' in prepared) throw new Error(prepared.message);
  return evaluateRules(rules, prepared, ctx).behavior;
}

describe('judgments: a ./ rule under a current directory reached through a link', () => {
  const deny = [parsed('Read(./private/**)', 'deny')];

  test('a read under the linked spelling is denied', async () => {
    expect(await readVerdict(deny, '/var/proj/private/a.txt')).toBe('deny');
  });

  test('a read of the same file by its real location is denied', async () => {
    expect(await readVerdict(deny, '/private/var/proj/private/a.txt')).toBe('deny');
  });

  test('a link inside the project that points into the denied folder is denied', async () => {
    expect(await readVerdict(deny, '/var/proj/link/a.txt')).toBe('deny');
    expect(await readVerdict(deny, '/private/var/proj/link/a.txt')).toBe('deny');
  });

  test('an ask rule reaches the same paths', async () => {
    const ask = [parsed('Read(./private/**)', 'ask')];
    expect(await readVerdict(ask, '/var/proj/link/a.txt')).toBe('ask');
  });

  test('a deny rule that matches at any depth reaches a nested folder through the link', async () => {
    const nested = [parsed('Read(secrets/**)', 'deny')];
    const links = {
      '/var/proj/k': '/private/var/proj/a/secrets/key',
      '/var/proj': '/private/var/proj',
    };
    expect(await readVerdict(nested, '/var/proj/k', { links })).toBe('deny');
  });

  test('the same rules are unchanged when the host passes the real directory', async () => {
    const real = {
      ...LINKED_CWD,
      cwd: '/private/var/proj',
      primaryWorkingDirectory: '/private/var/proj',
    };
    expect(await readVerdict(deny, '/var/proj/link/a.txt', { paths: real })).toBe('deny');
    expect(await readVerdict(deny, '/private/var/proj/private/a.txt', { paths: real })).toBe(
      'deny',
    );
  });

  test('an allow rule gets no alias: the file it resolves to must match as the rule is spelled', async () => {
    const allow = [parsed('Read(./src/**)', 'allow')];
    expect(await readVerdict(allow, '/var/proj/src/a.ts')).toBeUndefined();
    const real = {
      ...LINKED_CWD,
      cwd: '/private/var/proj',
      primaryWorkingDirectory: '/private/var/proj',
    };
    expect(await readVerdict(allow, '/private/var/proj/src/a.ts', { paths: real })).toBe('allow');
  });
});

describe('a ~/ rule when the home directory is a link', () => {
  const deny = [parsed('Read(~/.ssh/**)', 'deny')];
  const paths: PathContext = {
    ...LINKED_CWD,
    cwd: '/work/app',
    primaryWorkingDirectory: '/work/app',
  };

  test('a link to the real home is denied even before the named folder exists', async () => {
    const links = { '/work/app/key': '/Users/alice/.ssh/id_rsa', '/home/alice': '/Users/alice' };
    const verdict = await readVerdict(deny, '/work/app/key', {
      paths,
      links,
      missing: ['/home/alice/.ssh'],
    });
    expect(verdict).toBe('deny');
  });
});

describe('judgments: a working directory that is a link', () => {
  const shared: PathContext = {
    ...LINKED_CWD,
    cwd: '/work/app',
    primaryWorkingDirectory: '/work/app',
    additionalDirectories: ['/shared'],
  };
  const links = { '/shared': '/mnt/shared', '/work/app': '/work/app' };

  async function readDecision(paths: PathContext, path: string, block = false) {
    const resolver = fakeResolver(links);
    const realDirectories = await resolveRuleDirectories([], paths, resolver);
    const prepared = await prepareCall(call('Read', inputFor('Read', path)), paths, resolver);
    if ('failure' in prepared) throw new Error(prepared.message);
    return decide(
      prepared,
      baseContext('default', {
        match: { paths: { ...paths, realDirectories } },
        ...(block ? { blockReadsOutsideWorkingDirectories: true } : {}),
      }),
    );
  }

  test('resolveRuleDirectories maps an additional directory to where it really is', async () => {
    const map = await resolveRuleDirectories([], shared, fakeResolver(links));
    expect([...map]).toEqual([['/shared', '/mnt/shared']]);
  });

  test('a read under a linked additional directory is a read in the working directories', async () => {
    expect(await readDecision(shared, '/shared/a.txt')).toEqual({
      outcome: 'allow',
      reason: 'read-in-working-directory',
    });
  });

  test('the read block does not refuse it', async () => {
    expect((await readDecision(shared, '/shared/a.txt', true)).outcome).toBe('allow');
  });

  test('a link out of the linked directory still resolves outside', async () => {
    const out = { '/shared/out': '/etc/passwd', ...links };
    const resolver = fakeResolver(out);
    const realDirectories = await resolveRuleDirectories([], shared, resolver);
    const prepared = await prepareCall(
      call('Read', inputFor('Read', '/shared/out')),
      shared,
      resolver,
    );
    if ('failure' in prepared) throw new Error(prepared.message);
    const ctx = baseContext('default', { match: { paths: { ...shared, realDirectories } } });
    expect(decide(prepared, ctx).outcome).toBe('ask');
  });
});
