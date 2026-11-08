/**
 * Judgments (spec/judgments.md): how the lockfile of npm or Bun is read. The docs name only
 * `lockfileVersion` and say what a lockfile must pin; the layout of each file is its package
 * manager's own, read as little as the checks need.
 */
import { describe, expect, test } from 'bun:test';
import { readLockfile } from '../../src/marketplace/node-deps-lockfile.ts';
import { bunLock, npmLock, REGISTRY_TARBALL } from '../support/node-deps-fixtures.ts';

describe('readLockfile: an npm lockfile', () => {
  test('reads the version, what the root lists, and the download links', () => {
    expect(readLockfile('package-lock.json', npmLock())).toEqual({
      version: 3,
      root: { dependencies: { 'left-pad': '^1.3.0' } },
      locked: [],
      downloads: [REGISTRY_TARBALL],
    });
  });

  test('a linked package, a git or folder origin are locked non-registry origins, named by the package', () => {
    const facts = readLockfile(
      'npm-shrinkwrap.json',
      npmLock({
        packages: {
          'node_modules/a': { resolved: '../a', link: true },
          'node_modules/b/node_modules/@s/b': {
            version: '1.0.0',
            resolved: 'git+ssh://git@github.com/s/b.git#abc',
          },
          'node_modules/c': { version: '1.0.0', resolved: 'http://registry.internal/c-1.0.0.tgz' },
        },
      }),
    );
    expect(facts.locked).toEqual([
      { name: 'a', origin: 'link:../a' },
      { name: '@s/b', origin: 'git+ssh://git@github.com/s/b.git#abc' },
    ]);
    expect(facts.downloads).toContain('http://registry.internal/c-1.0.0.tgz');
  });

  test('text that is not JSON has no version', () => {
    expect(readLockfile('package-lock.json', '{ nope').version).toBeUndefined();
    expect(readLockfile('package-lock.json', '[]').version).toBeUndefined();
    expect(readLockfile('package-lock.json', '{"lockfileVersion":"3"}').version).toBeUndefined();
  });
});

describe('readLockfile: a bun.lock', () => {
  test('reads the version, what the root workspace lists, and no download link for a default-registry entry', () => {
    expect(readLockfile('bun.lock', bunLock())).toEqual({
      version: 1,
      root: { dependencies: { 'left-pad': '^1.3.0' } },
      locked: [],
      downloads: [],
    });
  });

  test('a workspace, git or folder entry is a locked non-registry origin; a registry URL is a download link', () => {
    const facts = readLockfile(
      'bun.lock',
      bunLock({
        packages: `
    "w": ["w@workspace:packages/w"],
    "@s/g": ["@s/g@github:s/g#abc", {}, "abc"],
    "f": ["f@file:../f", {}],
    "r": ["r@2.0.0", "https://registry.internal/", {}, "sha512-x"],`,
      }),
    );
    expect(facts.locked).toEqual([
      { name: 'w', origin: 'workspace:packages/w' },
      { name: '@s/g', origin: 'github:s/g#abc' },
      { name: 'f', origin: 'file:../f' },
    ]);
    expect(facts.downloads).toEqual(['https://registry.internal/']);
  });

  test('a lockfileVersion that is not a number, or an empty file, has no version', () => {
    expect(readLockfile('bun.lock', '{ "lockfileVersion": "1", }').version).toBeUndefined();
    expect(readLockfile('bun.lock', '').version).toBeUndefined();
  });

  test('a comma or a brace inside a string does not confuse the trailing-comma pass', () => {
    const facts = readLockfile(
      'bun.lock',
      '{ "lockfileVersion": 2, "workspaces": { "": { "dependencies": { "a": "1.0.0 || ,}", }, }, }, }',
    );
    expect(facts.root).toEqual({ dependencies: { a: '1.0.0 || ,}' } });
  });
});
