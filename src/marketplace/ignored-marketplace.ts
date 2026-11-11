import { loadNameIssues } from '../format/marketplace/marketplace-names.ts';
import type { MarketplaceSource } from '../format/marketplace/types.ts';
import { isBlockedHost } from './blocked-hosts.ts';
import type { ErrorsTabEntry } from './install-messages.ts';
import { sameMarketplaceSource, type KnownMarketplace } from './known-marketplaces.ts';
import { readGitAddress } from './source-safety.ts';

/**
 * `Marketplace "<name>" is added but ignored` (plugins/troubleshooting.md): an entry of
 * `known_marketplaces.json` that fails a check made every time the file is read, so the
 * marketplace "and the plugins installed from it stop loading". The checks are the ones the
 * section lists: the location, a git URL, an http(s) URL, a match with the `extraKnownMarketplaces`
 * entry of user or managed settings, and the name. Which location is on a network drive is the
 * host's to probe (an effect); everything else is decided here.
 *
 * Judgments (spec/judgments.md): the docs quote the line and the fix only for the location check,
 * so the fix for the others is the kit's wording; the name is refused when `loadNameIssues` finds an
 * issue with the entry's own source (another spelling of a reserved name, a member name of
 * JavaScript objects), and a reserved name refused only for its source is the untrusted-source case
 * (`untrustedSource`), not this one; a git URL is unusable when `readGitAddress` refuses
 * it or its host is loopback, link-local or a cloud-metadata address (`isBlockedHost`); the Errors
 * tab line ends with the reason's period.
 */

/** What the host found out about the entry's location (the clone's folder, or the local path it was added from). */
export interface IgnoreChecks {
  /** `network`: on a network drive; `unchecked`: it could not be examined; `local`: a path on this computer. */
  readonly location: 'local' | 'network' | 'unchecked';
  /** The `extraKnownMarketplaces` source of the same name in user or managed settings (not a repository's). */
  readonly declared?: MarketplaceSource;
}

export interface IgnoredReason {
  /** The sentence after `is added but ignored`; absent when only the debug log has the reason. */
  readonly sentence?: string;
  readonly fix: string;
}

const LOCATION_PROBLEM =
  'is on a network drive, has "." or ".." in its path, or couldn\'t be checked';
const LOCATION_FIX =
  'Re-add the marketplace (one added from a folder or file must be re-added from a copy on this computer), or, to trust a folder on a network drive, declare it under extraKnownMarketplaces in user or managed settings.';

const DOT_SEGMENT = /(?:^|[\\/])\.{1,2}(?:[\\/]|$)/;
const HTTP_ADDRESS = /^https?:\/\/[^\s/?#]+/i;
const HOST_OF_URL = /^https?:\/\/(?:[^@/]*@)?(\[[^\]]+\]|[^/:?#]+)/i;

/** The sources the registry keeps no copy of: the path it recorded is the one you gave. */
const isLocalPath = (source: MarketplaceSource): boolean =>
  'path' in source && !('url' in source) && !('repo' in source) && !('pathPattern' in source);

const locationReason = (
  entry: KnownMarketplace,
  location: IgnoreChecks['location'],
): IgnoredReason | undefined => {
  const unsafe = location !== 'local' || DOT_SEGMENT.test(entry.installLocation);
  if (!unsafe) return undefined;
  const subject = isLocalPath(entry.source)
    ? 'The folder or file it was added from'
    : 'Its location';
  return { sentence: `${subject} ${LOCATION_PROBLEM}`, fix: LOCATION_FIX };
};

const gitUrlProblem = (url: string): string | undefined => {
  const issue = readGitAddress(url, false, 'url').issues[0];
  if (issue !== undefined) return issue.message;
  const host = HOST_OF_URL.exec(url)?.[1];
  return host !== undefined && isBlockedHost(host)
    ? `"${host}" is a loopback, link-local or cloud-metadata address`
    : undefined;
};

const sourceReason = (name: string, source: MarketplaceSource): IgnoredReason | undefined => {
  const remove = `Remove the marketplace with claude plugin marketplace remove ${name}, then add it again from a supported source.`;
  const problem = 'url' in source && 'path' in source ? gitUrlProblem(source.url) : undefined;
  if (problem !== undefined)
    return { sentence: `Its git URL can't be used: ${problem}`, fix: remove };
  const badUrl = 'url' in source && !('path' in source) && !HTTP_ADDRESS.test(source.url);
  return badUrl
    ? { sentence: "Its URL can't be read as an https:// or http:// address", fix: remove }
    : undefined;
};

const mismatchReason = (name: string): IgnoredReason => ({
  sentence: "Its source doesn't match its extraKnownMarketplaces entry in user or managed settings",
  fix: `Re-add the marketplace from the declared source, or change the declaration; claude plugin marketplace remove ${name} clears the entry.`,
});

/** An official name's own source: the one place `loadNameIssues` lets a reserved name load from. */
const OFFICIAL_ORIGIN: MarketplaceSource = {
  kind: 'github',
  repo: 'anthropics/claude-plugins-official',
  path: '.claude-plugin/marketplace.json',
};

const refused = (name: string, origin: MarketplaceSource): boolean =>
  loadNameIssues(name, { origin }).length > 0;

/**
 * A reserved name whose registered source is not an `anthropics` GitHub repository: the name is
 * refused with the entry's source and accepted with an official one, so the source is the only
 * thing wrong with it. Reserved names are "re-checked every time a marketplace loads or refreshes".
 */
const refusedForSourceOnly = (name: string, source: MarketplaceSource): boolean =>
  refused(name, source) && !refused(name, OFFICIAL_ORIGIN);

/**
 * `Marketplace "<name>" is registered from an untrusted source: ...` for an entry registered under a
 * reserved name from a source that is not an `anthropics` GitHub repository: it and its plugins
 * stop loading. `undefined` for any other entry. The host checks this on every load beside
 * `ignoredReason`, which leaves this case to it.
 */
export const untrustedSource = (name: string, entry: KnownMarketplace): string | undefined =>
  refusedForSourceOnly(name, entry.source) ? untrustedSourceMessage(name) : undefined;

/**
 * Why an entry is ignored, or `undefined` when it loads: the first check that fails, in the order
 * the docs list them (location, git URL or URL, settings declaration, name).
 */
export function ignoredReason(
  name: string,
  entry: KnownMarketplace,
  checks: IgnoreChecks,
): IgnoredReason | undefined {
  const mismatched =
    checks.declared !== undefined && !sameMarketplaceSource(entry.source, checks.declared);
  const nameRefused = refused(name, entry.source) && !refusedForSourceOnly(name, entry.source);
  return (
    locationReason(entry, checks.location) ??
    sourceReason(name, entry.source) ??
    (mismatched ? mismatchReason(name) : undefined) ??
    (nameRefused ? { fix: `Remove it with: claude plugin marketplace remove ${name}` } : undefined)
  );
}

/** Where the line shows: `claude plugin list` (one line, name bare) or the `/plugin` Errors tab (name quoted, fix beneath). */
export type IgnoredSurface = 'list' | 'errors-tab';

const TAIL = (reason: IgnoredReason): string =>
  reason.sentence === undefined ? ' (see the debug log)' : `. ${reason.sentence}.`;

const LINES: {
  readonly [S in IgnoredSurface]: (name: string, reason: IgnoredReason) => string | ErrorsTabEntry;
} = {
  list: (name, reason) =>
    reason.sentence === undefined
      ? `Marketplace ${name} is added but ignored (see the debug log)`
      : `Marketplace ${name} is added but ignored${TAIL(reason)} ${reason.fix}`,
  'errors-tab': (name, reason) => ({
    message: `Marketplace "${name}" is added but ignored${TAIL(reason)}`,
    guidance: reason.fix,
  }),
};

/** The line `claude plugin list` prints (text), or the Errors tab entry (message and guidance). */
export function ignoredLine(name: string, reason: IgnoredReason, surface: 'list'): string;
export function ignoredLine(
  name: string,
  reason: IgnoredReason,
  surface: 'errors-tab',
): ErrorsTabEntry;
export function ignoredLine(
  name: string,
  reason: IgnoredReason,
  surface: IgnoredSurface,
): string | ErrorsTabEntry {
  return LINES[surface](name, reason);
}

/**
 * `Marketplace "<name>" is registered from an untrusted source: ...` (troubleshooting.md): a
 * marketplace registered under a reserved name whose source is not an `anthropics` GitHub
 * repository stops loading with its plugins.
 */
export const untrustedSourceMessage = (name: string): string =>
  `Marketplace "${name}" is registered from an untrusted source: The name '${name}' is reserved for official Anthropic marketplaces. Only repositories from 'github.com/anthropics/' can use this name. To fix it, remove the marketplace and re-add it from the official source.`;
