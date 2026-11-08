/**
 * plugins/loading.md § Versions and updates → How Claude Code computes the version: the rule is
 * picked by the `source` type of the marketplace entry; for every type but `command` the manifest's
 * `version` comes first, then the entry's, then the source type's default (the table: a commit SHA
 * shortened to 12 characters, a `git-subdir` version also carrying a hash of the path, an archive's
 * SHA-256 shortened to 12 from the pin or the downloaded file, `unknown` for `npm` and for a local
 * directory outside any git repository), a repository enclosing the install path is never used, and
 * a `command` source always derives it from the command's output. What the docs leave open (blank
 * versions, a missing digest, the case of a hash, what the command hash covers) is tested outside
 * `spec(...)` and is in spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import type { PluginSource } from '../../src/format/marketplace/types.ts';
import {
  archiveFacts,
  computePluginVersion,
  sourceFactsOf,
  UNKNOWN_VERSION,
  versionCacheSegment,
} from '../../src/marketplace/plugin-version.ts';
import type { Sha256 } from '../../src/ports/marketplace.ts';
import { spec } from '../support/spec.ts';

const SHA = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
const DIGEST = 'ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100';

spec('updates.loading.How Claude Code computes the version', () => {
  describe('the order: manifest, then entry, then the source type', () => {
    test('the manifest version wins over the entry version and the source default', () => {
      expect(
        computePluginVersion({
          manifestVersion: '1.0.0',
          entryVersion: '2.0.0',
          source: { kind: 'github', commit: SHA },
        }),
      ).toBe('1.0.0');
    });

    test('the entry version is used when the manifest sets none', () => {
      expect(
        computePluginVersion({
          entryVersion: '2.0.0',
          source: { kind: 'github', commit: SHA },
        }),
      ).toBe('2.0.0');
    });

    test('with neither, the version comes from the source type', () => {
      expect(computePluginVersion({ source: { kind: 'github', commit: SHA } })).toBe(
        'a1b2c3d4e5f6',
      );
    });

    test('a pinned manifest version stays the same across commits', () => {
      const at = (commit: string) =>
        computePluginVersion({ manifestVersion: '1.0.0', source: { kind: 'url', commit } });
      expect(at(SHA)).toBe(at('0123456789abcdef0123456789abcdef01234567'));
    });

    test('an omitted version follows the commit', () => {
      const at = (commit: string) => computePluginVersion({ source: { kind: 'url', commit } });
      expect(at(SHA)).not.toBe(at('0123456789abcdef0123456789abcdef01234567'));
    });

    test('the order holds for every source type but command', () => {
      const sources = [
        { kind: 'relative' },
        { kind: 'github', commit: SHA },
        { kind: 'url', commit: SHA },
        { kind: 'git-subdir', commit: SHA, pathHash: '1f2e3d4c' },
        { kind: 'npm' },
        { kind: 'archive', downloadedDigest: DIGEST },
      ] as const;
      for (const source of sources) {
        expect(computePluginVersion({ manifestVersion: 'm', entryVersion: 'e', source })).toBe('m');
        expect(computePluginVersion({ entryVersion: 'e', source })).toBe('e');
      }
    });
  });

  describe('a relative path', () => {
    test('inside a Git-hosted marketplace it is the commit SHA of the installed directory, shortened', () => {
      expect(
        computePluginVersion({
          source: { kind: 'relative', repository: { root: 'marketplace', commit: SHA } },
        }),
      ).toBe('a1b2c3d4e5f6');
    });

    test('in a local directory that is a git repository it is that repository commit', () => {
      expect(
        computePluginVersion({
          source: { kind: 'relative', repository: { root: 'plugin-directory', commit: SHA } },
        }),
      ).toBe('a1b2c3d4e5f6');
    });

    test('in a local directory outside any git repository it is unknown', () => {
      expect(computePluginVersion({ source: { kind: 'relative' } })).toBe('unknown');
    });

    test('a repository that only encloses the install path, such as a git-managed ~/.claude, is not used', () => {
      expect(
        computePluginVersion({
          source: { kind: 'relative', repository: { root: 'enclosing', commit: SHA } },
        }),
      ).toBe('unknown');
    });
  });

  describe('a command source', () => {
    test('is the 12-character hash alone when the manifest sets no version', () => {
      expect(computePluginVersion({ source: { kind: 'command', hash: DIGEST } })).toBe(
        'ffeeddccbbaa',
      );
    });

    test('is <manifest version>-<hash> when the manifest sets one', () => {
      expect(
        computePluginVersion({
          manifestVersion: '3.1.0',
          source: { kind: 'command', hash: DIGEST },
        }),
      ).toBe('3.1.0-ffeeddccbbaa');
    });

    test('ignores the version of the marketplace entry', () => {
      const source = { kind: 'command', hash: DIGEST } as const;
      expect(computePluginVersion({ entryVersion: '9.9.9', source })).toBe('ffeeddccbbaa');
      expect(
        computePluginVersion({ manifestVersion: '3.1.0', entryVersion: '9.9.9', source }),
      ).toBe('3.1.0-ffeeddccbbaa');
    });

    test('changes when the hashed output changes', () => {
      const at = (hash: string) => computePluginVersion({ source: { kind: 'command', hash } });
      expect(at(DIGEST)).not.toBe(at('00112233445566778899aabbccddeeff'));
    });
  });
});

/**
 * The `git-subdir` row proves only the shape `<commit, 12 characters>-<hash>`: the docs say "a hash
 * of the subdirectory path" and give no algorithm or length, so the hash is the host's (`pathHash`)
 * and the algorithm is not proven (spec/judgments.md); distinct paths are the host's hash's job.
 */
spec('updates.loading.How Claude Code computes the version.github', () => {
  test('a github source without a version field is the commit SHA of the source, 12 characters', () => {
    const version = computePluginVersion({ source: { kind: 'github', commit: SHA } });
    expect(version).toBe(SHA.slice(0, 12));
    expect(version).toHaveLength(12);
  });

  test('a url source is the commit SHA too', () => {
    expect(computePluginVersion({ source: { kind: 'url', commit: SHA } })).toBe(SHA.slice(0, 12));
  });

  test('a git-subdir version carries a hash of the subdirectory path after the commit', () => {
    const version = computePluginVersion({
      source: { kind: 'git-subdir', commit: SHA, pathHash: '1f2e3d4c' },
    });
    expect(version).toBe('a1b2c3d4e5f6-1f2e3d4c');
  });
});

spec('updates.loading.How Claude Code computes the version.archive', () => {
  test('the sha256 pin of the entry, shortened to 12 characters', () => {
    expect(computePluginVersion({ source: { kind: 'archive', pin: DIGEST } })).toBe('ffeeddccbbaa');
  });

  test('the digest of the downloaded file when there is no pin', () => {
    expect(computePluginVersion({ source: { kind: 'archive', downloadedDigest: DIGEST } })).toBe(
      'ffeeddccbbaa',
    );
  });

  test('the pin is used even when a digest of the download is known', () => {
    expect(
      computePluginVersion({
        source: { kind: 'archive', pin: DIGEST, downloadedDigest: '0123456789abcdef' },
      }),
    ).toBe('ffeeddccbbaa');
  });
});

describe('the digest of a downloaded archive goes through the Sha256 port', () => {
  const archive: PluginSource & { kind: 'archive' } = {
    kind: 'archive',
    url: 'https://e.test/p.zip',
  };
  const bytes = new Uint8Array([1, 2, 3]);
  const sha256: Sha256 = {
    hex: (given) => Promise.resolve(given.length === 3 ? DIGEST : '00'),
  };

  test('with no pin, the version is the digest of the downloaded bytes, 12 characters', async () => {
    const facts = await archiveFacts(archive, bytes, sha256);
    expect(computePluginVersion({ source: facts })).toBe('ffeeddccbbaa');
  });

  test('with a pin, the pin is the version and the digest is still reported', async () => {
    const pin = '0123456789abcdef0123456789abcdef';
    const facts = await archiveFacts({ ...archive, sha256: pin }, bytes, sha256);
    expect(facts).toEqual({ kind: 'archive', pin, downloadedDigest: DIGEST });
    expect(computePluginVersion({ source: facts })).toBe('0123456789ab');
  });
});

spec('updates.loading.How Claude Code computes the version.npm', () => {
  test('an npm source without a version field is unknown', () => {
    expect(computePluginVersion({ source: { kind: 'npm' } })).toBe('unknown');
    expect(UNKNOWN_VERSION).toBe('unknown');
  });
});

describe('judgments (spec/judgments.md)', () => {
  test('a pinned sha is the commit of a git source; an archive pin is its pin; nothing else is known without a fetch', () => {
    expect(sourceFactsOf({ kind: 'github', repo: 'o/r', sha: SHA })).toEqual({
      kind: 'github',
      commit: SHA,
    });
    expect(sourceFactsOf({ kind: 'url', url: 'https://e.test/r.git', ref: 'v1' })).toEqual({
      kind: 'url',
    });
    expect(
      sourceFactsOf({ kind: 'git-subdir', url: 'https://e.test/r.git', path: 'p', sha: SHA }),
    ).toEqual({ kind: 'git-subdir', commit: SHA });
    expect(sourceFactsOf({ kind: 'archive', url: 'https://e.test/p.zip', sha256: DIGEST })).toEqual(
      { kind: 'archive', pin: DIGEST },
    );
    expect(sourceFactsOf({ kind: 'npm', package: 'pkg' })).toEqual({ kind: 'npm' });
    expect(sourceFactsOf({ kind: 'relative', path: 'p', bare: false })).toEqual({
      kind: 'relative',
    });
  });

  test('the facts of a pinned github entry give its version with no fetch, and the host adds what it learns', () => {
    const pinned = sourceFactsOf({ kind: 'github', repo: 'o/r', sha: SHA });
    expect(computePluginVersion({ source: pinned })).toBe('a1b2c3d4e5f6');
    const learned = sourceFactsOf({ kind: 'url', url: 'https://e.test/r.git' });
    expect(computePluginVersion({ source: { ...learned, commit: SHA } })).toBe('a1b2c3d4e5f6');
  });

  test('a version is a safe directory name: unsafe characters are encoded, the path of ../x included', () => {
    expect(versionCacheSegment('1.2.3-beta+build_5')).toBe('1.2.3-beta+build_5');
    expect(versionCacheSegment('../x')).toBe('..%2Fx');
    expect(versionCacheSegment('a\\b c')).toBe('a%5Cb%20c');
    expect(versionCacheSegment('..')).toBe('%2E%2E');
    expect(versionCacheSegment('.')).toBe('%2E');
    expect(versionCacheSegment('')).toBe('unknown');
  });

  test('two versions never share a directory, and a lone surrogate does not throw', () => {
    expect(versionCacheSegment('1/0')).not.toBe(versionCacheSegment('1%2F0'));
    expect(versionCacheSegment('1/0')).not.toBe(versionCacheSegment('1_0'));
    expect(versionCacheSegment('v\ud800')).toBe('v%EF%BF%BD');
  });

  test('a blank version counts as not set', () => {
    expect(
      computePluginVersion({
        manifestVersion: '',
        entryVersion: '  ',
        source: { kind: 'github', commit: SHA },
      }),
    ).toBe('a1b2c3d4e5f6');
    expect(
      computePluginVersion({
        manifestVersion: ' ',
        entryVersion: '2.0.0',
        source: { kind: 'npm' },
      }),
    ).toBe('2.0.0');
  });

  test('a git source whose commit is not known, and an archive with neither pin nor digest, are unknown', () => {
    expect(computePluginVersion({ source: { kind: 'github' } })).toBe('unknown');
    expect(computePluginVersion({ source: { kind: 'git-subdir', pathHash: '1f2e3d4c' } })).toBe(
      'unknown',
    );
    expect(computePluginVersion({ source: { kind: 'archive' } })).toBe('unknown');
  });

  test('hashes and SHAs are lower case; a short hash is kept whole', () => {
    expect(
      computePluginVersion({ source: { kind: 'github', commit: 'ABCDEF0123456789ABCDEF' } }),
    ).toBe('abcdef012345');
    expect(computePluginVersion({ source: { kind: 'command', hash: 'ABC' } })).toBe('abc');
  });

  test('a manifest version of a command source is joined as given, with no trimming', () => {
    expect(
      computePluginVersion({
        manifestVersion: '1.0.0-beta',
        source: { kind: 'command', hash: 'abc' },
      }),
    ).toBe('1.0.0-beta-abc');
  });
});
