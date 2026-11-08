/**
 * What the planned source of an `extraKnownMarketplaces` entry keeps of its request headers and
 * `headersHelper` commands (settings-reference.md, `extraKnownMarketplaces`; plugins/host-marketplace.md,
 * "When Claude Code skips a headersHelper command or drops its output"). Running a command is the host's.
 */
import type { MarketplaceSource } from '../../protocol/official.ts';
import { MARKETPLACE_SOURCE_KINDS } from '../../protocol/settings-keys.ts';
import type { PolicyScope } from '../layers.ts';
import { isRecord } from '../record.ts';
import { byKind, type ByKind, type SourceOf } from './source-kinds.ts';

type Plugin = SourceOf<'settings'>['plugins'][number];

const same = (source: MarketplaceSource): MarketplaceSource => source;

/**
 * Applies a change to each inline plugin entry of a `settings` source. A plugin entry that is not an
 * object is left as it is; the entry is invalid anyway (`source-validate.ts`).
 */
const onPlugins =
  (change: (plugin: Plugin) => Plugin) =>
  (source: SourceOf<'settings'>): MarketplaceSource => ({
    ...source,
    plugins: Array.isArray(source.plugins)
      ? source.plugins.map((plugin) => (isRecord(plugin) ? change(plugin) : plugin))
      : source.plugins,
  });

/** The helper of a `url` source and of each inline plugin entry. The fixed `headers` stay. */
const WITHOUT_HELPER: ByKind<MarketplaceSource> = {
  github: same,
  git: same,
  url: ({ headersHelper: _helper, ...rest }) => rest,
  file: same,
  directory: same,
  npm: same,
  settings: onPlugins(({ headersHelper: _helper, ...rest }) => rest),
  hostPattern: same,
  pathPattern: same,
  'skills-dir': same,
};

/** "Marketplace URL doesn't start with `https://`": that `url` source's command doesn't run. */
const WITHOUT_INSECURE_HELPER: ByKind<MarketplaceSource> = {
  github: same,
  git: same,
  url: (source) => (source.url.startsWith('https://') ? source : byKind(WITHOUT_HELPER, source)),
  file: same,
  directory: same,
  npm: same,
  settings: same,
  hostPattern: same,
  pathPattern: same,
  'skills-dir': same,
};

/**
 * The request-routing and client-identity header names Claude Code drops: the docs name `Host`,
 * `Cookie` and `X-Forwarded-*` "such as", and keep authentication names such as `Authorization`
 * (spec/judgments.md: these three, matched without regard to case).
 */
const isRoutingOrIdentity = (name: string): boolean => {
  const lower = name.toLowerCase();
  return lower === 'host' || lower === 'cookie' || lower.startsWith('x-forwarded-');
};

/** The header filter, which applies to an inline plugin entry's `headers` only. */
const WITHOUT_ROUTING_HEADERS: ByKind<MarketplaceSource> = {
  github: same,
  git: same,
  url: same,
  file: same,
  directory: same,
  npm: same,
  settings: onPlugins((plugin) =>
    isRecord(plugin.headers)
      ? {
          ...plugin,
          headers: Object.fromEntries(
            Object.entries(plugin.headers).filter(([name]) => !isRoutingOrIdentity(name)),
          ),
        }
      : plugin,
  ),
  hostPattern: same,
  pathPattern: same,
  'skills-dir': same,
};

/** What a declaration of that scope loses: a repository can supply a project or local file. */
const DECLARED_IN: {
  readonly [S in PolicyScope]: (source: MarketplaceSource) => MarketplaceSource;
} = {
  managed: same,
  parent: same,
  flag: same,
  user: same,
  project: (source) => byKind(WITHOUT_ROUTING_HEADERS, source),
  local: (source) => byKind(WITHOUT_ROUTING_HEADERS, source),
  addDir: (source) => byKind(WITHOUT_ROUTING_HEADERS, byKind(WITHOUT_HELPER, source)),
};

const isKnownKind = (kind: string): boolean =>
  MARKETPLACE_SOURCE_KINDS.some((known) => known === kind);

/**
 * The source a host plans from, for an entry a file of this scope declares. A kind nobody lists is
 * left as it is: the entry is invalid (`source-validate.ts`).
 */
export const plannedSource = (source: MarketplaceSource, from: PolicyScope): MarketplaceSource =>
  isKnownKind(source.source) ? DECLARED_IN[from](byKind(WITHOUT_INSECURE_HELPER, source)) : source;
