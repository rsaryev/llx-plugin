/** Inputs for `resolvePluginVersion` tests (tests/marketplace/plugin-version*.test.ts). */
import {
  resolvePluginVersion,
  type VersionInput,
  type VersionSource,
} from '../../src/marketplace/version-resolution.ts';
import { realSha256 } from './marketplace-ports.ts';

/** A real-looking 40-digit commit, so a test can tell a 12-character cut from the whole. */
export const SHA = '0123456789abcdef0123456789abcdef01234567';

type Changes = Partial<Omit<VersionInput, 'sourceKind' | 'subdir'>> & VersionSource;

/** A source that reports nothing: every field a test does not name is absent or false. */
const input = (changes: Changes): VersionInput => ({
  inGitRepository: false,
  enclosingRepoIgnored: false,
  ...changes,
});
export const versionOf = (changes: Changes) => resolvePluginVersion(input(changes), realSha256);

/** The version a user's copy of a `github` plugin has after the author pushed `commit` with the given declared versions. */
export const githubVersionAt = async (
  commit: string,
  manifestVersion?: string,
  entryVersion?: string,
): Promise<string> =>
  (
    await versionOf({
      sourceKind: 'github',
      commitSha: commit,
      ...(manifestVersion === undefined ? {} : { manifestVersion }),
      ...(entryVersion === undefined ? {} : { entryVersion }),
    })
  ).version;
