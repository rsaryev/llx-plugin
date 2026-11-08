import { error, warning, type PluginIssue } from '../format/issues.ts';
import type { MarketplaceSourceKind } from '../format/marketplace/types.ts';
import type { Clock } from '../ports/clock.ts';
import type { Environment } from '../ports/environment.ts';
import { DISABLE_NONESSENTIAL_TRAFFIC, isSet } from './env-flags.ts';

/**
 * When Claude Code reads a marketplace again before it looks a plugin up for an install
 * (plugins/loading.md, "When Claude Code refreshes a marketplace before an install"). Pure: the
 * host fetches; the kit says which marketplaces, which are skipped and why, and what a failure
 * leaves. Every fact comes in as data, the clock and the environment through their ports.
 */

/** "You can run `/plugin install` in a session or `claude plugin install` in your shell." */
export const INSTALL_COMMANDS = ['/plugin install', 'claude plugin install'] as const;
export type InstallCommand = (typeof INSTALL_COMMANDS)[number];

/** "Claude Code refreshed the marketplace within the last 30 seconds." */
export const REFRESH_WINDOW_MS = 30_000;

/** What the kit needs to know about a marketplace the user has registered. */
export interface KnownMarketplace {
  readonly name: string;
  /** How it was added: `file` and `directory` are local paths, `settings` is defined inline. */
  readonly source: MarketplaceSourceKind;
  /** Its resolved auto-update setting (`marketplaceAutoUpdate`). */
  readonly autoUpdate: boolean;
  /** A seed directory supplies it (`CLAUDE_CODE_PLUGIN_SEED_DIR`). */
  readonly seeded?: boolean;
  /** When the host last refreshed it, in `Clock.now()` milliseconds. */
  readonly lastRefreshedAt?: number;
  /** The marketplace gate's message when managed settings block it ("is blocked by enterprise policy"). */
  readonly blocked?: string;
}

export interface RefreshRequest {
  /** `name` or `name@marketplace`, as the user typed it. */
  readonly ref: string;
  readonly command: InstallCommand;
  readonly marketplaces: readonly KnownMarketplace[];
  /** The lookup of a bare name in the cached catalogs found no plugin. */
  readonly lookupMissed: boolean;
  readonly env: Environment;
  readonly clock: Clock;
}

/** Why nothing is refreshed. */
export const SKIP_REASONS = [
  'invalid-reference',
  'marketplace-unknown',
  'local-or-inline-source',
  'seed-directory',
  'refreshed-within-30-seconds',
  'nonessential-traffic-disabled',
  'cli-reads-cached-catalogs',
  'lookup-found-the-plugin',
  'no-auto-update-marketplace',
  'every-candidate-skipped',
] as const;
export type SkipReason = (typeof SKIP_REASONS)[number];

export type RefreshDecision =
  | { readonly outcome: 'refresh'; readonly marketplaces: readonly string[] }
  | { readonly outcome: 'skip'; readonly reason: SkipReason }
  /** "Managed settings block the marketplace, in which case Claude Code also refuses the install." */
  | {
      readonly outcome: 'refuse';
      readonly reason: 'blocked-by-managed-settings';
      readonly issue: PluginIssue;
    };

/** Local paths and inline definitions are read where they are, so a refresh has nothing to fetch. */
const READ_IN_PLACE: { readonly [K in MarketplaceSourceKind]: boolean } = {
  file: true,
  directory: true,
  settings: true,
  url: false,
  github: false,
  git: false,
  npm: false,
  'skills-dir': false,
  hostPattern: false,
  pathPattern: false,
};

interface Facts {
  readonly env: Environment;
  readonly clock: Clock;
}

type SkipRule = (marketplace: KnownMarketplace, facts: Facts) => boolean;

type RuleReason = Extract<
  SkipReason,
  | 'local-or-inline-source'
  | 'seed-directory'
  | 'refreshed-within-30-seconds'
  | 'nonessential-traffic-disabled'
>;

/** The docs' list of skips after the managed block, in the docs' order. */
const SKIP_RULES: readonly { readonly reason: RuleReason; readonly applies: SkipRule }[] = [
  { reason: 'local-or-inline-source', applies: (marketplace) => READ_IN_PLACE[marketplace.source] },
  { reason: 'seed-directory', applies: (marketplace) => marketplace.seeded === true },
  {
    // Judgment: exactly 30 seconds ago is no longer "within the last 30 seconds".
    reason: 'refreshed-within-30-seconds',
    applies: (marketplace, { clock }) =>
      marketplace.lastRefreshedAt !== undefined &&
      clock.now() - marketplace.lastRefreshedAt < REFRESH_WINDOW_MS,
  },
  {
    reason: 'nonessential-traffic-disabled',
    applies: (_, { env }) => isSet(env, DISABLE_NONESSENTIAL_TRAFFIC),
  },
];

const skipOf = (marketplace: KnownMarketplace, facts: Facts): SkipReason | undefined =>
  SKIP_RULES.find((rule) => rule.applies(marketplace, facts))?.reason;

const refuse = (message: string): RefreshDecision => ({
  outcome: 'refuse',
  reason: 'blocked-by-managed-settings',
  issue: error('marketplace', message),
});

/** `name@marketplace` is two parts; `name` is one; any other number of `@` is no reference. */
function parseRef(ref: string): { name: string; marketplace?: string } | undefined {
  const parts = ref.split('@');
  const [name, marketplace] = parts;
  if (name === undefined || name === '' || parts.length > 2) return undefined;
  if (parts.length === 1) return { name };
  return marketplace === undefined || marketplace === '' ? undefined : { name, marketplace };
}

function named(marketplace: KnownMarketplace | undefined, facts: Facts): RefreshDecision {
  if (marketplace === undefined) return { outcome: 'skip', reason: 'marketplace-unknown' };
  if (marketplace.blocked !== undefined) return refuse(marketplace.blocked);
  const reason = skipOf(marketplace, facts);
  return reason === undefined
    ? { outcome: 'refresh', marketplaces: [marketplace.name] }
    : { outcome: 'skip', reason };
}

/**
 * A bare name through `/plugin install`: "Only marketplaces that have auto-update on, and only
 * after the lookup misses". Judgment (spec/judgments.md): each candidate is held to the skip
 * conditions of the named install, and a candidate managed settings block is dropped, not refused,
 * since no marketplace was named.
 */
function bareThroughSession(request: RefreshRequest, facts: Facts): RefreshDecision {
  if (!request.lookupMissed) return { outcome: 'skip', reason: 'lookup-found-the-plugin' };
  const candidates = request.marketplaces.filter((marketplace) => marketplace.autoUpdate);
  if (candidates.length === 0) return { outcome: 'skip', reason: 'no-auto-update-marketplace' };
  const refreshable = candidates.filter(
    (marketplace) => marketplace.blocked === undefined && skipOf(marketplace, facts) === undefined,
  );
  return refreshable.length === 0
    ? { outcome: 'skip', reason: 'every-candidate-skipped' }
    : { outcome: 'refresh', marketplaces: refreshable.map((marketplace) => marketplace.name) };
}

/** A bare name through the CLI: "Nothing. It reads the cached catalogs without refreshing." */
const bareThroughCli = (): RefreshDecision => ({
  outcome: 'skip',
  reason: 'cli-reads-cached-catalogs',
});

const BARE: {
  readonly [C in InstallCommand]: (request: RefreshRequest, facts: Facts) => RefreshDecision;
} = {
  '/plugin install': bareThroughSession,
  'claude plugin install': bareThroughCli,
};

/**
 * What to refresh before the lookup of `request.ref`. The refresh of a named marketplace depends
 * neither on its `autoUpdate` nor on `DISABLE_AUTOUPDATER`: only the five skips and the managed
 * block above apply.
 */
export function refreshBeforeInstall(request: RefreshRequest): RefreshDecision {
  const ref = parseRef(request.ref);
  if (ref === undefined) return { outcome: 'skip', reason: 'invalid-reference' };
  const facts = { env: request.env, clock: request.clock };
  if (ref.marketplace === undefined) return BARE[request.command](request, facts);
  return named(
    request.marketplaces.find((marketplace) => marketplace.name === ref.marketplace),
    facts,
  );
}

export interface RefreshFailure {
  readonly installFrom: 'cached catalog';
  /** The CLI's report; the docs name none for `/plugin install`. */
  readonly report?: PluginIssue;
}

/** What `claude plugin install` reports when the refresh failed. */
export const NOT_REFRESHED = 'marketplace not refreshed';

const REPORTS: { readonly [C in InstallCommand]: PluginIssue | undefined } = {
  '/plugin install': undefined,
  'claude plugin install': warning('marketplace', NOT_REFRESHED),
};

/**
 * "When the refresh fails, the install proceeds from the cached catalog and `claude plugin install`
 * reports `marketplace not refreshed`."
 */
export function refreshFailed(command: InstallCommand): RefreshFailure {
  const report = REPORTS[command];
  return report === undefined
    ? { installFrom: 'cached catalog' }
    : { installFrom: 'cached catalog', report };
}
