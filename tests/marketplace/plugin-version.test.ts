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
import { computePluginVersion, UNKNOWN_VERSION } from '../../src/marketplace/plugin-version.ts';
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

  test('two subdirectories of one commit get two versions', () => {
    const at = (pathHash: string) =>
      computePluginVersion({ source: { kind: 'git-subdir', commit: SHA, pathHash } });
    expect(at('1f2e3d4c')).not.toBe(at('9a8b7c6d'));
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

spec('updates.loading.How Claude Code computes the version.npm', () => {
  test('an npm source without a version field is unknown', () => {
    expect(computePluginVersion({ source: { kind: 'npm' } })).toBe('unknown');
    expect(UNKNOWN_VERSION).toBe('unknown');
  });
});

describe('judgments (spec/judgments.md)', () => {
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
