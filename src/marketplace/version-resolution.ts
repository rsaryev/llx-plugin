import type { PluginSourceKind } from '../format/marketplace/types.ts';
import type { Sha256 } from '../ports/marketplace.ts';
import { shortHash12, subdirectoryPathHash } from './version-hash.ts';

/**
 * The version of an installed plugin as Claude Code computes it (plugins/loading.md, "How Claude
 * Code computes the version"): for every source type except `command` the manifest's `version`,
 * then the entry's, then what the source gives; for a `command` source always what the command
 * produced. The version names the cache directory and decides whether an update changes anything,
 * so it is a decision the host reads, never recomputes. Pure over what the host reports; only the
 * hash of a `git-subdir` path goes through the `Sha256` port.
 */

/** The version of a source that gives nothing to version it by (loading.md: "`unknown`"). */
export const UNKNOWN_VERSION = 'unknown';

/** Where a version came from; `claude-ai` is the version a marketplace hosted on claude.ai records. */
export type VersionOrigin =
  | 'manifest'
  | 'entry'
  | 'sha'
  | 'sha256'
  | 'command-hash'
  | 'unknown'
  | 'claude-ai';

export interface PluginVersion {
  readonly version: string;
  readonly origin: VersionOrigin;
}

/** The source of a plugin: a `git-subdir` source always has its `path`, which its version hashes. */
export type VersionSource =
  | { readonly sourceKind: Exclude<PluginSourceKind, 'git-subdir'>; readonly subdir?: undefined }
  | {
      readonly sourceKind: 'git-subdir';
      /** `path` of the `git-subdir` source. */
      readonly subdir: string;
    };

/** What the host knows about a plugin when the version is decided; every fact it lacks is left out. */
interface VersionFacts {
  /** `version` in the plugin's manifest (the merged manifest when the entry supplies it, `mergeEntryWithManifest`). */
  readonly manifestVersion?: string;
  readonly entryVersion?: string;
  /** The commit of the cloned repository or, for a relative path, of the installed directory. */
  readonly commitSha?: string;
  /** The `sha256` pin of an `archive` entry. */
  readonly archiveSha256?: string;
  /** The digest of the downloaded archive, used when the entry has no pin. */
  readonly archiveDigest?: string;
  /** The hash of what a `command` source produced (`copyModeHash`, `linkModeHash`). */
  readonly commandHash?: string;
  /**
   * A relative-path plugin whose directory or whose marketplace is a Git repository: either one
   * gives a commit to version it by; neither gives `unknown` ("Local directory, when neither the
   * plugin directory nor its marketplace is a git repository").
   */
  readonly inGitRepository: boolean;
  /** The only repository the host found encloses the install path (a git-managed `~/.claude`): its commit is not a version. */
  readonly enclosingRepoIgnored: boolean;
  /** The version a marketplace hosted on claude.ai records for the plugin. */
  readonly recordedByClaudeAi?: string;
}

export type VersionInput = VersionFacts & VersionSource;

/**
 * Whether a version can name one folder: "The version also names the plugin's cache directory"
 * (loading.md), so a version that is empty, `.`, `..` or holds a separator or a NUL would leave
 * `cache/<marketplace>/<plugin>/`. The docs do not restrict the characters; any other text is kept
 * verbatim (spec/judgments.md).
 */
export const isVersionSegment = (version: string): boolean =>
  version !== '' && version !== '.' && version !== '..' && !/[/\\\0]/u.test(version);

const UNKNOWN: PluginVersion = { version: UNKNOWN_VERSION, origin: 'unknown' };

/** A version field that says something: an empty or blank string is no version (spec/judgments.md). */
const statedVersion = (value: string | undefined): string | undefined =>
  value === undefined || value.trim() === '' ? undefined : value;

/** A stated version that also names one folder; one that does not is skipped, as if unset (spec/judgments.md). */
export const usableVersion = (value: string | undefined): string | undefined => {
  const text = statedVersion(value);
  return text !== undefined && isVersionSegment(text) ? text : undefined;
};

const fromCommit = (input: VersionInput): PluginVersion => {
  const commit = statedVersion(input.commitSha);
  return commit === undefined ? UNKNOWN : { version: shortHash12(commit), origin: 'sha' };
};

type Derive = (input: VersionInput, sha256: Sha256) => Promise<PluginVersion> | PluginVersion;

const fromSubdirectory: Derive = async (input, sha256) => {
  const commit = fromCommit(input);
  if (commit.origin === 'unknown' || input.subdir === undefined) return UNKNOWN;
  const pathHash = await subdirectoryPathHash(input.subdir, sha256);
  return { version: `${commit.version}-${pathHash}`, origin: 'sha' };
};

const fromArchive: Derive = (input) => {
  const digest = statedVersion(input.archiveSha256) ?? statedVersion(input.archiveDigest);
  return digest === undefined ? UNKNOWN : { version: shortHash12(digest), origin: 'sha256' };
};

/** A relative path is versioned by a commit only inside a Git-hosted marketplace and outside an enclosing repository. */
const fromRelative: Derive = (input) =>
  input.inGitRepository && !input.enclosingRepoIgnored ? fromCommit(input) : UNKNOWN;

/** What each source type gives when neither the manifest nor the entry has a `version`. */
const FROM_SOURCE: { readonly [K in Exclude<PluginSourceKind, 'command'>]: Derive } = {
  relative: fromRelative,
  github: fromCommit,
  url: fromCommit,
  'git-subdir': fromSubdirectory,
  npm: () => UNKNOWN,
  archive: fromArchive,
};

/** The manifest's `version`, else the entry's (loading.md, "How Claude Code computes the version", steps 1 and 2). */
function declared(input: VersionInput): PluginVersion | undefined {
  const manifest = usableVersion(input.manifestVersion);
  if (manifest !== undefined) return { version: manifest, origin: 'manifest' };
  const entry = usableVersion(input.entryVersion);
  return entry === undefined ? undefined : { version: entry, origin: 'entry' };
}

const declaredThen =
  (derive: Derive): Derive =>
  (input, sha256) =>
    declared(input) ?? derive(input, sha256);

/**
 * "A 12-character hash on its own, or `<manifest version>-<hash>` when the manifest sets one. The
 * marketplace entry's `version` is ignored for command sources." A command source whose hash the
 * host did not supply is `unknown`, never the entry's version (spec/judgments.md).
 */
const fromCommand: Derive = (input) => {
  const hash = statedVersion(input.commandHash);
  if (hash === undefined) return UNKNOWN;
  const manifest = usableVersion(input.manifestVersion);
  const short = shortHash12(hash);
  return {
    version: manifest === undefined ? short : `${manifest}-${short}`,
    origin: 'command-hash',
  };
};

/** One rule per source type, typed over the union so a new type cannot be forgotten. */
const VERSION_RULES: { readonly [K in PluginSourceKind]: Derive } = {
  relative: declaredThen(FROM_SOURCE.relative),
  github: declaredThen(FROM_SOURCE.github),
  url: declaredThen(FROM_SOURCE.url),
  'git-subdir': declaredThen(FROM_SOURCE['git-subdir']),
  npm: declaredThen(FROM_SOURCE.npm),
  archive: declaredThen(FROM_SOURCE.archive),
  command: fromCommand,
};

/**
 * The version of a plugin. A plugin of a marketplace hosted on claude.ai has "the version claude.ai
 * records for the plugin ... and the manifest's `version` isn't read".
 */
export async function resolvePluginVersion(
  input: VersionInput,
  sha256: Sha256,
): Promise<PluginVersion> {
  const recorded = usableVersion(input.recordedByClaudeAi);
  if (recorded !== undefined) return { version: recorded, origin: 'claude-ai' };
  const computed = await VERSION_RULES[input.sourceKind](input, sha256);
  return isVersionSegment(computed.version) ? computed : UNKNOWN;
}
