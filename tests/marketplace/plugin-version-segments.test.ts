/**
 * plugins/loading.md § How Claude Code computes the version: "The version also names the plugin's
 * cache directory". The docs do not restrict what a version may hold, so the kit keeps any text
 * that is one folder name and skips the rest (spec/judgments.md, `src/marketplace/plugin-version.ts`):
 * a `version` such as `../../x` or `a/b` must never leave `cache/<marketplace>/<plugin>/`.
 */
import { describe, expect, test } from 'bun:test';
import { isVersionSegment } from '../../src/marketplace/plugin-version.ts';
import { SHA, versionOf } from '../support/plugin-version.ts';

describe('judgments (spec/judgments.md, src/marketplace/plugin-version.ts)', () => {
  const UNSAFE = ['../x', 'a/b', '..', '.', 'a\\b', '../../x', 'a\0b'];

  test('a version that is not one path segment cannot name the cache folder', () => {
    for (const version of UNSAFE) expect(isVersionSegment(version)).toBe(false);
    for (const version of ['1.0.0', '2.1.0-beta.1', 'v1+build.5', '0123456789ab', '...']) {
      expect(isVersionSegment(version)).toBe(true);
    }
  });

  test('a manifest or entry version that is not a segment is skipped for the next source of a version', async () => {
    for (const version of UNSAFE) {
      const fallsToEntry = await versionOf({
        sourceKind: 'github',
        manifestVersion: version,
        entryVersion: '1.0.0',
        commitSha: SHA,
      });
      expect(fallsToEntry).toEqual({ version: '1.0.0', origin: 'entry' });
      const fallsToCommit = await versionOf({
        sourceKind: 'github',
        manifestVersion: version,
        entryVersion: version,
        commitSha: SHA,
      });
      expect(fallsToCommit).toEqual({ version: '0123456789ab', origin: 'sha' });
    }
  });

  test('with nothing else to give, a version that escapes the folder is unknown', async () => {
    for (const version of ['../x', 'a/b']) {
      const result = await versionOf({ sourceKind: 'npm', manifestVersion: version });
      expect(result).toEqual({ version: 'unknown', origin: 'unknown' });
    }
  });

  test('a command source ignores a manifest version that is not a segment, and one the host records for claude.ai', async () => {
    const command = await versionOf({
      sourceKind: 'command',
      manifestVersion: '../x',
      commandHash: 'abcdef012345',
    });
    expect(command).toEqual({ version: 'abcdef012345', origin: 'command-hash' });
    const recorded = await versionOf({
      sourceKind: 'github',
      recordedByClaudeAi: 'a/b',
      commitSha: SHA,
    });
    expect(recorded).toEqual({ version: '0123456789ab', origin: 'sha' });
  });

  test('a computed version that is not a segment is unknown', async () => {
    const result = await versionOf({ sourceKind: 'command', commandHash: '../../etc' });
    expect(result).toEqual({ version: 'unknown', origin: 'unknown' });
  });
});
