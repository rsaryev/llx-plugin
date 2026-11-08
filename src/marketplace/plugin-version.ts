import type { PluginSourceKind } from '../format/marketplace/types.ts';

/**
 * The version Claude Code computes for a plugin it installs (plugins/loading.md, "Versions and
 * updates", "How Claude Code computes the version"). It is how an update is detected and it names
 * the plugin's cache directory. For every source type but `command`: the manifest's `version`, then
 * the marketplace entry's, then the source type's default; a `command` source always derives it from
 * what the command produced. Pure over facts: the host reads the manifest, learns the commit and
 * hashes the files or the path, because the kit has no git, no disk and no digest of its own.
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
      /** The SHA-256 digest of the downloaded file. */
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
const declared = (value: string | undefined): string | undefined =>
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
    declared(input.manifestVersion),
    declared(input.entryVersion),
    input.source,
  );
}
