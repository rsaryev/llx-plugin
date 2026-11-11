/**
 * permissions.md § Symlinks and § How rules match a symlinked path: "the permission check covers
 * two paths: the one Claude requested and the file it resolves to"; allow rules apply only when
 * both match, deny rules when either matches (the `./project/key` -> `~/.ssh/id_rsa` example); a
 * deny or ask rule written through a symlinked directory with a `//`, `~/` or `/` pattern also
 * applies at the directory's real location (`/etc` -> `/private/etc`); § Paths that can't be
 * resolved or that change: Read, Edit and Write refuse. No requirement id covers these, so none of
 * it is under spec(). The resolver is the kit's `PathResolver` port, faked here.
 */
import { describe, expect, test } from 'bun:test';
import {
  evaluateRules,
  prepareCall,
  resolveRuleDirectories,
  type PermissionRule,
  type PreparedCall,
} from '../../src/rules/index.ts';
import { call, matchContext, parsed } from '../support/rule-context.ts';
import { fakeResolver } from '../support/path-resolver.ts';
import { inputFor, withPaths } from '../support/path-rules.ts';

const KEY = '/work/app/project/key';
const LINKS = { [KEY]: '/home/alice/.ssh/id_rsa' };

async function prepared(
  tool: string,
  path: string,
  links: Record<string, string> = LINKS,
): Promise<PreparedCall> {
  const result = await prepareCall(
    call(tool, inputFor(tool, path)),
    matchContext.paths,
    fakeResolver(links),
  );
  if ('failure' in result) throw new Error(result.message);
  return result;
}

const verdict = (rules: readonly PermissionRule[], target: PreparedCall, ctx = matchContext) =>
  evaluateRules(rules, target, ctx).behavior;

describe('prepareCall records where a requested path really points', () => {
  test('a symlink resolves to its target, kept beside the requested path', async () => {
    const target = await prepared('Read', KEY);
    expect(target.resolvedPaths).toEqual(['/home/alice/.ssh/id_rsa']);
    expect(target.input).toEqual(inputFor('Read', KEY));
  });

  test('a path that is not a link comes back unchanged', async () => {
    const target = await prepared('Read', '/work/app/a.txt');
    expect(target.resolvedPaths).toBeUndefined();
  });

  test('a new file resolves through the directory on its way that is a link', async () => {
    const resolver = fakeResolver(
      { '/work/app/out': '/elsewhere/out' },
      { missing: ['/work/app/out/new.txt'] },
    );
    const target = await prepareCall(
      call('Write', inputFor('Write', '/work/app/out/new.txt')),
      matchContext.paths,
      resolver,
    );
    expect('failure' in target ? undefined : target.resolvedPaths).toEqual([
      '/elsewhere/out/new.txt',
    ]);
    expect(resolver.asked).toEqual(['/work/app/out/new.txt', '/work/app/out']);
  });

  test('several missing levels are appended below the nearest parent that exists', async () => {
    const resolver = fakeResolver(
      { '/work/app/out': '/elsewhere/out' },
      { missing: ['/work/app/out/a/b/new.txt', '/work/app/out/a/b', '/work/app/out/a'] },
    );
    const target = await prepareCall(
      call('Write', inputFor('Write', '/work/app/out/a/b/new.txt')),
      matchContext.paths,
      resolver,
    );
    expect('failure' in target ? undefined : target.resolvedPaths).toEqual([
      '/elsewhere/out/a/b/new.txt',
    ]);
    expect(resolver.asked).toEqual([
      '/work/app/out/a/b/new.txt',
      '/work/app/out/a/b',
      '/work/app/out/a',
      '/work/app/out',
    ]);
  });

  test('a new file whose parents all exist unlinked comes back unchanged', async () => {
    const resolver = fakeResolver({}, { missing: ['/work/app/out/new.txt'] });
    const write = call('Write', inputFor('Write', '/work/app/out/new.txt'));
    expect(await prepareCall(write, matchContext.paths, resolver)).toEqual(write);
  });

  test('when not even the root resolves, the call comes back as it was after the whole walk', async () => {
    const resolver = fakeResolver(
      {},
      { missing: ['/work/app/out/new.txt', '/work/app/out', '/work/app', '/work', '/'] },
    );
    const write = call('Write', inputFor('Write', '/work/app/out/new.txt'));
    expect(await prepareCall(write, matchContext.paths, resolver)).toEqual(write);
    expect(resolver.asked).toEqual([
      '/work/app/out/new.txt',
      '/work/app/out',
      '/work/app',
      '/work',
      '/',
    ]);
  });

  test('a failure from a parent of a new file is returned as the failure, and the walk stops', async () => {
    const resolver = fakeResolver(
      {},
      { missing: ['/work/app/out/new.txt'], loops: ['/work/app/out'] },
    );
    const result = await prepareCall(
      call('Write', inputFor('Write', '/work/app/out/new.txt')),
      matchContext.paths,
      resolver,
    );
    expect(result).toEqual({
      failure: 'loop',
      message: 'symlinks of /work/app/out form a loop',
    });
    expect(resolver.asked).toEqual(['/work/app/out/new.txt', '/work/app/out']);
  });

  test('a path given relatively is resolved against the current directory first', async () => {
    const resolver = fakeResolver({});
    await prepareCall(call('Read', { file_path: 'src/../a.txt' }), matchContext.paths, resolver);
    expect(resolver.asked).toEqual(['/work/app/a.txt']);
  });

  test('a call with no path is returned as it is, and the resolver is not asked', async () => {
    const resolver = fakeResolver({});
    const bash = call('Bash', { command: 'ls' });
    expect(await prepareCall(bash, matchContext.paths, resolver)).toEqual(bash);
    expect(resolver.asked).toEqual([]);
  });

  test('a path whose symlinks cannot be resolved is a failure value, never a throw', async () => {
    const resolver = fakeResolver({}, { loops: ['/work/app/loop'] });
    const result = await prepareCall(
      call('Read', inputFor('Read', '/work/app/loop')),
      matchContext.paths,
      resolver,
    );
    expect(result).toEqual({ failure: 'loop', message: 'symlinks of /work/app/loop form a loop' });
  });
});

describe('allow rules need both paths, deny and ask rules either', () => {
  test('a read through a symlink inside an allowed directory that points outside does not match', async () => {
    const target = await prepared('Read', KEY);
    expect(verdict([parsed('Read(./project/**)', 'allow')], target)).toBeUndefined();
  });

  test('the same read matches when both the requested path and its target match', async () => {
    const target = await prepared('Read', '/work/app/project/a.txt', {
      '/work/app/project/a.txt': '/work/app/project/real/a.txt',
    });
    expect(verdict([parsed('Read(./project/**)', 'allow')], target)).toBe('allow');
  });

  test('with Read(./project/**) allowed and Read(~/.ssh/**) denied, the link to ~/.ssh is blocked', async () => {
    const target = await prepared('Read', KEY);
    const rules = [parsed('Read(./project/**)', 'allow'), parsed('Read(~/.ssh/**)', 'deny')];
    expect(verdict(rules, target)).toBe('deny');
  });

  test('a deny rule matches the requested path even when the target is elsewhere', async () => {
    const target = await prepared('Read', KEY);
    expect(verdict([parsed('Read(./project/**)', 'deny')], target)).toBe('deny');
  });

  test('an ask rule matches on either path', async () => {
    const target = await prepared('Read', KEY);
    expect(verdict([parsed('Read(~/.ssh/**)', 'ask')], target)).toBe('ask');
  });

  test('without a resolved path an allow rule needs only the requested path', () => {
    const plain = call('Read', inputFor('Read', '/work/app/project/a.txt'));
    expect(verdict([parsed('Read(./project/**)', 'allow')], plain)).toBe('allow');
  });
});

describe('a rule written through a symlinked directory also applies at its real location', () => {
  const real = { '/etc': '/private/etc' };

  test('resolveRuleDirectories maps the directories a // ~/ / or ./ rule goes through to where they really are', async () => {
    const rules = [
      parsed('Read(//etc/**)', 'deny'),
      parsed('Read(~/link/**)', 'ask'),
      parsed('Read(/vendor/pkg/*.js)', 'deny'),
      parsed('Read(./src/**)', 'deny'),
      parsed('Read(//etc/**)', 'allow'),
    ];
    const resolver = fakeResolver({ ...real, '/home/alice/link': '/data/link' });
    const map = await resolveRuleDirectories(rules, matchContext.paths, resolver);
    expect([...map]).toEqual([
      ['/etc', '/private/etc'],
      ['/home/alice/link', '/data/link'],
    ]);
    // Each rule's anchor is asked too (the current directory of `./src/**`, the home, the project);
    // `/` never is; the working directory is asked once for the scope checks.
    expect(resolver.asked).toEqual([
      '/etc',
      '/home/alice',
      '/home/alice/link',
      '/work/app',
      '/work/app/vendor/pkg',
    ]);
  });

  test('on macOS Read(//etc/**) blocks /private/etc/hosts too', () => {
    const ctx = withPaths({ realDirectories: new Map(Object.entries(real)) });
    const hosts = call('Read', inputFor('Read', '/private/etc/hosts'));
    expect(verdict([parsed('Read(//etc/**)', 'deny')], hosts, ctx)).toBe('deny');
    expect(verdict([parsed('Read(//etc/**)', 'ask')], hosts, ctx)).toBe('ask');
  });

  test('before the directory is resolved the rule covers the spelling it was written with', () => {
    const hosts = call('Read', inputFor('Read', '/private/etc/hosts'));
    expect(verdict([parsed('Read(//etc/**)', 'deny')], hosts)).toBeUndefined();
  });

  test('an allow rule gets no such alias', () => {
    const ctx = withPaths({ realDirectories: new Map(Object.entries(real)) });
    const hosts = call('Read', inputFor('Read', '/private/etc/hosts'));
    expect(verdict([parsed('Read(//etc/**)', 'allow')], hosts, ctx)).toBeUndefined();
  });

  test('a Windows host has no such aliases (the docs say macOS and Linux)', async () => {
    const ctx = withPaths({
      platform: 'windows',
      cwd: 'C:\\work',
      home: 'C:\\Users\\a',
      primaryWorkingDirectory: 'C:\\work',
    });
    const resolver = fakeResolver(real);
    const map = await resolveRuleDirectories(
      [parsed('Read(//etc/**)', 'deny')],
      ctx.paths,
      resolver,
    );
    expect(map.size).toBe(0);
    expect(resolver.asked).toEqual([]);
  });
});
