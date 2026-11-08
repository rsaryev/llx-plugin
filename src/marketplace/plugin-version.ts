import type {
  PluginSource,
  PluginSourceKind,
  PluginSourceOf,
} from '../format/marketplace/types.ts';
import type { Sha256 } from '../ports/marketplace.ts';

/**
 * The version Claude Code computes for a plugin it installs (plugins/loading.md, "Versions and
 * updates", "How Claude Code computes the version"). It is how an update is detected and it names
 * the plugin's cache directory. For every source type but `command`: the manifest's `version`, then
 * the marketplace entry's, then the source type's default; a `command` source always derives it from
 * what the command produced. Pure over facts: the host reads the manifest and learns the commit,
 * because the kit has no git and no disk. The kit hashes through the `Sha256` port only what the docs
 * name: the downloaded archive (`archiveFacts`). The hash of a `git-subdir` path and of a command's
 * output are facts the host supplies, because the docs give no algorithm for them.
 */

export const UNKNOWN_VERSION = 'unknown';

/** "A commit SHA ... shortened to 12 characters", "the SHA-256 digest, shortened to 12 characters". */
const SHORT_LENGTH = 12;

/**
 * Where the git repository a relative path's commit comes from was found. Only the plugin's own
 * directory and its marketplace count: "Claude Code doesn't take the version from a repository that
 * encloses the install path, such as a git-managed `~/.claude`".
 */
export type RepositoryRoot = 'plugin-directory' | 'marketplace' | 'enclosing';

/**
 * What the host knows about the source of a plugin, one shape per `source` type of the marketplace
 * entry. A fact that is absent is one the host could not learn.
 */
export type SourceFacts =
  | {
      readonly kind: 'relative';
      /** The git repository the installed directory belongs to, when it belongs to one. */
      readonly repository?: { readonly root: RepositoryRoot; readonly commit: string };
    }
  | { readonly kind: 'github'; readonly commit?: string }
  | { readonly kind: 'url'; readonly commit?: string }
  | {
      readonly kind: 'git-subdir';
      readonly commit?: string;
      /** The host's hash of the subdirectory path, which "a `git-subdir` version also carries". */
      readonly pathHash: string;
    }
  | { readonly kind: 'npm' }
  | {
      readonly kind: 'archive';
      /** The `sha256` pin in the marketplace entry. */
      readonly pin?: string;
      /** The SHA-256 digest of the downloaded file (`archiveFacts` computes it). */
      readonly downloadedDigest?: string;
    }
  | {
      readonly kind: 'command';
      /** The host's hash of what the command produced (copy mode: the copied files; link mode: the real path and top-level entries). */
      readonly hash: string;
    };

export interface PluginVersionInput {
  /** The `version` of the plugin's manifest, when it sets one. */
  readonly manifestVersion?: string;
  /** The `version` of the plugin's marketplace entry, when it sets one. */
  readonly entryVersion?: string;
  readonly source: SourceFacts;
}

type FactsOf<K extends PluginSourceKind> = Extract<SourceFacts, { kind: K }>;

/** A version the author wrote; a blank one is not set (judgment). */
export const declaredVersion = (value: string | undefined): string | undefined =>
  value === undefined || value.trim() === '' ? undefined : value;

const short = (hex: string): string => hex.toLowerCase().slice(0, SHORT_LENGTH);

const shortOr = (hex: string | undefined): string =>
  hex === undefined || hex === '' ? UNKNOWN_VERSION : short(hex);

const COUNTS: { readonly [R in RepositoryRoot]: boolean } = {
  'plugin-directory': true,
  marketplace: true,
  enclosing: false,
};

/** The default of each source type, when neither the manifest nor the entry sets a version. */
const FROM_SOURCE: { readonly [K in PluginSourceKind]: (facts: FactsOf<K>) => string } = {
  relative: (facts) =>
    facts.repository === undefined || !COUNTS[facts.repository.root]
      ? UNKNOWN_VERSION
      : shortOr(facts.repository.commit),
  github: (facts) => shortOr(facts.commit),
  url: (facts) => shortOr(facts.commit),
  'git-subdir': (facts) =>
    facts.commit === undefined || facts.commit === ''
      ? UNKNOWN_VERSION
      : `${short(facts.commit)}-${facts.pathHash}`,
  npm: () => UNKNOWN_VERSION,
  archive: (facts) => shortOr(facts.pin ?? facts.downloadedDigest),
  command: (facts) => short(facts.hash),
};

type Pick<K extends PluginSourceKind> = (
  manifest: string | undefined,
  entry: string | undefined,
  facts: FactsOf<K>,
) => string;

/** The rule of every source type but `command`: the manifest's version, then the entry's, then the source's default. */
const authorFirst =
  <K extends PluginSourceKind>(fromSource: (facts: FactsOf<K>) => string): Pick<K> =>
  (manifest, entry, facts) =>
    manifest ?? entry ?? fromSource(facts);

/**
 * How each source type picks its version from the two declared ones and its own default. A
 * `command` source ignores the entry's and joins the manifest's to its hash.
 */
const PICK: { readonly [K in PluginSourceKind]: Pick<K> } = {
  relative: authorFirst(FROM_SOURCE.relative),
  github: authorFirst(FROM_SOURCE.github),
  url: authorFirst(FROM_SOURCE.url),
  'git-subdir': authorFirst(FROM_SOURCE['git-subdir']),
  npm: authorFirst(FROM_SOURCE.npm),
  archive: authorFirst(FROM_SOURCE.archive),
  command: (manifest, _entry, facts) => {
    const hash = FROM_SOURCE.command(facts);
    return manifest === undefined ? hash : `${manifest}-${hash}`;
  },
};

function pick<K extends PluginSourceKind>(
  kind: K,
  manifest: string | undefined,
  entry: string | undefined,
  facts: FactsOf<K>,
): string {
  return PICK[kind](manifest, entry, facts);
}

/**
 * The version string of a plugin: written by its author (`manifestVersion`, then `entryVersion`) or
 * derived from its source. Judgments (spec/judgments.md): a blank version is not set; a source whose
 * commit, pin and digest the host could not learn is `unknown`; hashes and SHAs are lower case.
 */
export function computePluginVersion(input: PluginVersionInput): string {
  return pick(
    input.source.kind,
    declaredVersion(input.manifestVersion),
    declaredVersion(input.entryVersion),
    input.source,
  );
}

/** The facts of one source type that the marketplace entry alone gives; the host adds the rest. */
export type KnownFacts = {
  readonly [K in PluginSourceKind]: { readonly kind: K } & Partial<Omit<FactsOf<K>, 'kind'>>;
}[PluginSourceKind];

type KnownOf<K extends PluginSourceKind> = Extract<KnownFacts, { kind: K }>;

/** A pinned `sha` is the commit of the source: no fetch is needed to know it. */
const pinnedCommit = (source: { readonly sha?: string }): { readonly commit?: string } =>
  source.sha === undefined ? {} : { commit: source.sha };

const KNOWN: { readonly [K in PluginSourceKind]: (source: PluginSourceOf<K>) => KnownOf<K> } = {
  relative: () => ({ kind: 'relative' }),
  github: (source) => ({ kind: 'github', ...pinnedCommit(source) }),
  url: (source) => ({ kind: 'url', ...pinnedCommit(source) }),
  'git-subdir': (source) => ({ kind: 'git-subdir', ...pinnedCommit(source) }),
  npm: () => ({ kind: 'npm' }),
  archive: (source) => ({
    kind: 'archive',
    ...(source.sha256 === undefined ? {} : { pin: source.sha256 }),
  }),
  command: () => ({ kind: 'command' }),
};

function known<K extends PluginSourceKind>(kind: K, source: PluginSourceOf<K>): KnownOf<K> {
  return KNOWN[kind](source);
}

/**
 * What a marketplace entry's `source` tells about its version without a fetch: its kind, a pinned
 * `sha` as the commit of a `github`, `url` or `git-subdir` source, and the `sha256` pin of an
 * `archive`. The host adds only what it learns: the commit of an unpinned git source, the hash of a
 * `git-subdir` path, the digest of a download (`archiveFacts`), the repository of a relative path
 * and the hash of a command's output. Judgment (spec/judgments.md): a pinned `sha` is read as the
 * commit.
 */
export function sourceFactsOf<S extends PluginSource>(source: S): KnownOf<S['kind']>;
export function sourceFactsOf(source: PluginSource): KnownFacts {
  return known(source.kind, source);
}

/**
 * The facts of an `archive` source after the download: the entry's `sha256` pin and the SHA-256
 * digest of the downloaded bytes ("the digest of the downloaded file when there is no pin"),
 * computed through the `Sha256` port the archive fetch already uses.
 */
export async function archiveFacts(
  source: PluginSourceOf<'archive'>,
  bytes: Uint8Array,
  sha256: Sha256,
): Promise<FactsOf<'archive'>> {
  const downloadedDigest = await sha256.hex(bytes);
  return source.sha256 === undefined
    ? { kind: 'archive', downloadedDigest }
    : { kind: 'archive', pin: source.sha256, downloadedDigest };
}

const percent = (char: string): string =>
  `%${(char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(2, '0')}`;

/**
 * The version as one safe directory name, since "the version also names the plugin's cache
 * directory" (`cache/<marketplace>/<plugin>/<version>/`) and a manifest or an entry may write any
 * string, such as `../x`. Judgment (spec/judgments.md): percent-encoding keeps a version as it is
 * when it is made of letters, digits and `.`, `-`, `_`, `+`, never lets two versions share a
 * directory, and turns `.` and `..` (which are not names) into `%2E`s.
 */
export function versionCacheSegment(version: string): string {
  const encoded = encodeURIComponent(version.toWellFormed())
    .replace(/[!'()*~]/g, percent)
    .replaceAll('%2B', '+');
  if (encoded === '') return UNKNOWN_VERSION;
  return /^\.+$/.test(encoded) ? encoded.replaceAll('.', '%2E') : encoded;
}
