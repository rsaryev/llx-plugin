import { error, type PluginIssue } from '../issues.ts';

/**
 * The field checks every object plugin source shares (plugins/marketplace-reference.md, "Plugin
 * sources" and "Invalid input on a source"): a known type "with a required field missing or of the
 * wrong type" is `Invalid input` on the entry's `source`.
 */

/** Where a source is being read: the path its issues name, and what bare names and `\` depend on. */
export interface SourceSite {
  readonly path: string;
  readonly pluginRoot?: string;
  readonly platform: 'posix' | 'windows';
}

export const invalidInput = (site: SourceSite): PluginIssue[] => [
  error(site.path, 'Invalid input'),
];

/** A full 40-character lowercase commit SHA ("Plugin sources": `sha`). */
const COMMIT_SHA = /^[0-9a-f]{40}$/;
/** The archive's digest: 64 hex characters, uppercase or lowercase ("archive plugin source"). */
const ARCHIVE_DIGEST = /^[0-9A-Fa-f]{64}$/;

export type RawSource = Readonly<Record<string, unknown>>;

export const isText = (value: unknown): value is string =>
  typeof value === 'string' && value !== '';

const isCommitSha = (value: unknown): value is string =>
  typeof value === 'string' && COMMIT_SHA.test(value);

const isArchiveDigest = (value: unknown): value is string =>
  typeof value === 'string' && ARCHIVE_DIGEST.test(value);

/** An optional field: `value` is `undefined` when the key is absent. A present but invalid one is no value at all. */
export interface Optional {
  readonly value: string | undefined;
}

/** A required text field: the text, or `undefined` when the key is missing, empty or not a string. */
export function required(raw: RawSource, key: string): string | undefined {
  const value = raw[key];
  return isText(value) ? value : undefined;
}

function optional(
  raw: RawSource,
  key: string,
  accepts: (value: unknown) => value is string,
): Optional | undefined {
  const value = raw[key];
  if (value === undefined) return { value: undefined };
  return accepts(value) ? { value } : undefined;
}

export const optionalText = (raw: RawSource, key: string): Optional | undefined =>
  optional(raw, key, isText);

export const optionalDigest = (raw: RawSource): Optional | undefined =>
  optional(raw, 'sha256', isArchiveDigest);

/** The `ref` and `sha` the git sources share, or `undefined` when either is present and invalid. */
export function readGitPin(
  raw: RawSource,
): { readonly ref: string | undefined; readonly sha: string | undefined } | undefined {
  const ref = optionalText(raw, 'ref');
  const sha = optional(raw, 'sha', isCommitSha);
  return ref === undefined || sha === undefined ? undefined : { ref: ref.value, sha: sha.value };
}
