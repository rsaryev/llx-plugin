/**
 * plugins/loading.md § How Claude Code computes the version (the order, the table, the `command`
 * source, the enclosing repository) and the paragraph before it (a claude.ai-hosted marketplace);
 * plugins/troubleshooting.md § A plugin installed from a git repository shows version `unknown`.
 * The version is a pure decision over what the source reports; only the hashes go through the
 * `Sha256` port. The commit SHAs below are real-looking 40-digit values, so a test can tell a
 * 12-character cut from the whole.
 */
import { describe, expect, test } from 'bun:test';
import { computePluginVersion, type VersionInput } from '../../src/marketplace/plugin-version.ts';
import { shortHash12 } from '../../src/marketplace/version-hash.ts';
import { PLUGIN_SOURCE_KINDS } from '../../src/format/marketplace/types.ts';
import { realSha256 } from '../support/marketplace-ports.ts';
import { spec } from '../support/spec.ts';

const SHA = '0123456789abcdef0123456789abcdef01234567';
const DIGEST = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';

/** A source that reports nothing: every field a test does not name is absent or false. */
const input = (
  changes: Partial<VersionInput> & Pick<VersionInput, 'sourceKind'>,
): VersionInput => ({
  inGitMarketplace: false,
  enclosingRepoIgnored: false,
  ...changes,
});
const versionOf = (changes: Partial<VersionInput> & Pick<VersionInput, 'sourceKind'>) =>
  computePluginVersion(input(changes), realSha256);

const NOT_COMMAND = PLUGIN_SOURCE_KINDS.filter((kind) => kind !== 'command');

spec('updates.loading.How Claude Code computes the version', () => {
  test('the manifest version comes first, then the entry version, for every source type but command', async () => {
    for (const sourceKind of NOT_COMMAND) {
      const both = { sourceKind, manifestVersion: '2.0.0', entryVersion: '1.0.0', commitSha: SHA };
      expect(await versionOf(both)).toEqual({ version: '2.0.0', origin: 'manifest' });
      const entryOnly = { sourceKind, entryVersion: '1.0.0', commitSha: SHA };
      expect(await versionOf(entryOnly)).toEqual({ version: '1.0.0', origin: 'entry' });
    }
  });

  test('a manifest that pins a version keeps it however many commits land', async () => {
    const at = (commitSha: string) =>
      versionOf({ sourceKind: 'github', manifestVersion: '1.0.0', commitSha });
    expect(await at(SHA)).toEqual(await at('f'.repeat(40)));
  });

  test('a command source ignores the entry version and hashes what the command produced', async () => {
    const result = await versionOf({
      sourceKind: 'command',
      entryVersion: '9.9.9',
      commandHash: 'abcdef012345',
    });
    expect(result).toEqual({ version: 'abcdef012345', origin: 'command-hash' });
  });

  test('a command source with a manifest version is "<manifest version>-<hash>"', async () => {
    const result = await versionOf({
      sourceKind: 'command',
      manifestVersion: '2.1.0',
      entryVersion: '9.9.9',
      commandHash: 'abcdef012345',
    });
    expect(result).toEqual({ version: '2.1.0-abcdef012345', origin: 'command-hash' });
  });

  test('a command hash is cut to 12 characters', async () => {
    const result = await versionOf({ sourceKind: 'command', commandHash: DIGEST });
    expect(result.version).toBe('fedcba987654');
  });

  test('judgment: a command source with no hash at all is unknown, never the entry version', async () => {
    expect(await versionOf({ sourceKind: 'command', entryVersion: '1.0.0' })).toEqual({
      version: 'unknown',
      origin: 'unknown',
    });
  });

  test('a local directory neither of whose repositories is git is unknown', async () => {
    expect(await versionOf({ sourceKind: 'relative' })).toEqual({
      version: 'unknown',
      origin: 'unknown',
    });
  });

  test('a relative path inside a Git-hosted marketplace is the commit of the installed directory', async () => {
    const result = await versionOf({
      sourceKind: 'relative',
      inGitMarketplace: true,
      commitSha: SHA,
    });
    expect(result).toEqual({ version: SHA.slice(0, 12), origin: 'sha' });
  });

  test('a commit read from a repository that encloses the install path is not a version', async () => {
    // "such as a git-managed ~/.claude": the host found a repository above the install path.
    for (const inGitMarketplace of [true, false]) {
      const result = await versionOf({
        sourceKind: 'relative',
        inGitMarketplace,
        commitSha: SHA,
        enclosingRepoIgnored: true,
      });
      expect(result).toEqual({ version: 'unknown', origin: 'unknown' });
    }
  });

  test('a git-managed enclosing repository does not blank a declared version', async () => {
    const result = await versionOf({
      sourceKind: 'relative',
      manifestVersion: '1.2.3',
      commitSha: SHA,
      enclosingRepoIgnored: true,
    });
    expect(result.version).toBe('1.2.3');
  });
});

spec('updates.loading.How Claude Code computes the version.github', () => {
  test('a github, url or git-subdir source with no version field is the commit SHA shortened to 12', async () => {
    for (const sourceKind of ['github', 'url'] as const) {
      expect(await versionOf({ sourceKind, commitSha: SHA })).toEqual({
        version: '0123456789ab',
        origin: 'sha',
      });
    }
  });

  test('the shortened SHA is lower case', async () => {
    expect(
      (
        await versionOf({
          sourceKind: 'github',
          commitSha: 'ABCDEF0123456789'.repeat(2) + 'ABCDEF01',
        })
      ).version,
    ).toBe('abcdef012345');
  });

  test('a git-subdir version also carries a hash of the subdirectory path', async () => {
    const at = (subdir: string) => versionOf({ sourceKind: 'git-subdir', commitSha: SHA, subdir });
    const frontend = await at('packages/frontend');
    const backend = await at('packages/backend');
    expect(frontend.origin).toBe('sha');
    expect(frontend.version.startsWith('0123456789ab-')).toBe(true);
    expect(frontend.version).not.toBe('0123456789ab');
    expect(frontend.version).not.toBe(backend.version);
    expect(backend.version.startsWith('0123456789ab-')).toBe(true);
  });

  test('two plugins in one commit and one subdirectory spelled two ways share a version', async () => {
    const a = await versionOf({ sourceKind: 'git-subdir', commitSha: SHA, subdir: 'plugins/x' });
    const b = await versionOf({ sourceKind: 'git-subdir', commitSha: SHA, subdir: './plugins/x/' });
    expect(a).toEqual(b);
  });
});

spec('updates.loading.How Claude Code computes the version.archive', () => {
  test('the sha256 pin of the entry, shortened to 12 characters', async () => {
    const result = await versionOf({ sourceKind: 'archive', archiveSha256: DIGEST });
    expect(result).toEqual({ version: 'fedcba987654', origin: 'sha256' });
  });

  test('with no pin, the digest of the downloaded file', async () => {
    const result = await versionOf({ sourceKind: 'archive', archiveDigest: DIGEST });
    expect(result).toEqual({ version: 'fedcba987654', origin: 'sha256' });
  });

  test('a pin wins over the digest of a file that does not match it', async () => {
    const result = await versionOf({
      sourceKind: 'archive',
      archiveSha256: '1'.repeat(64),
      archiveDigest: DIGEST,
    });
    expect(result.version).toBe('111111111111');
  });

  test('an archive that reports neither is unknown', async () => {
    expect(await versionOf({ sourceKind: 'archive' })).toEqual({
      version: 'unknown',
      origin: 'unknown',
    });
  });
});

spec('updates.loading.How Claude Code computes the version.npm', () => {
  test('an npm source with no version field is unknown, whatever else is known about it', async () => {
    const result = await versionOf({
      sourceKind: 'npm',
      commitSha: SHA,
      archiveDigest: DIGEST,
      inGitMarketplace: true,
    });
    expect(result).toEqual({ version: 'unknown', origin: 'unknown' });
  });
});

spec(
  'install.troubleshooting.A plugin installed from a git repository shows version unknown',
  () => {
    test('a git-sourced plugin whose commit could not be read shows unknown', async () => {
      const unknown = { version: 'unknown', origin: 'unknown' } as const;
      expect(await versionOf({ sourceKind: 'github' })).toEqual(unknown);
      expect(await versionOf({ sourceKind: 'url' })).toEqual(unknown);
      expect(await versionOf({ sourceKind: 'git-subdir', subdir: 'p' })).toEqual(unknown);
      expect(await versionOf({ sourceKind: 'relative', inGitMarketplace: true })).toEqual(unknown);
    });

    test('once the commit can be read the version is a 12-character commit ID', async () => {
      const result = await versionOf({ sourceKind: 'github', commitSha: SHA });
      expect(result.version).toMatch(/^[0-9a-f]{12}$/u);
    });
  },
);

describe('judgments (spec/judgments.md, src/marketplace/plugin-version.ts)', () => {
  test('an empty or blank version field is no version', async () => {
    const result = await versionOf({
      sourceKind: 'github',
      manifestVersion: '',
      entryVersion: '  ',
      commitSha: SHA,
    });
    expect(result).toEqual({ version: '0123456789ab', origin: 'sha' });
  });

  test('a marketplace hosted on claude.ai: the version claude.ai records, never the manifest', async () => {
    const result = await versionOf({
      sourceKind: 'github',
      recordedByClaudeAi: '7',
      manifestVersion: '2.0.0',
      entryVersion: '1.0.0',
      commitSha: SHA,
    });
    expect(result).toEqual({ version: '7', origin: 'claude-ai' });
  });

  test('shortHash12 cuts to 12 and lower-cases', () => {
    expect(shortHash12('ABCDEF0123456789')).toBe('abcdef012345');
    expect(shortHash12('abc')).toBe('abc');
  });
});
