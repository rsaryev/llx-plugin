import type { MarketplaceSource } from '../../protocol/official.ts';
import { isRecord } from '../record.ts';
import { byKind, type ByKind } from './source-kinds.ts';

const same = (source: MarketplaceSource): MarketplaceSource => source;

/**
 * What a source loses where `headersHelper` is ignored (settings-reference.md, `extraKnownMarketplaces`):
 * the helper of a `url` source and of each inline plugin entry. The fixed `headers` stay. A plugin
 * entry that is not an object is left as it is; the entry is invalid anyway (`source-validate.ts`).
 */
const WITHOUT: ByKind<MarketplaceSource> = {
  github: same,
  git: same,
  url: ({ headersHelper: _helper, ...rest }) => rest,
  file: same,
  directory: same,
  npm: same,
  settings: (source) => ({
    ...source,
    plugins: Array.isArray(source.plugins)
      ? source.plugins.map((plugin) => {
          if (!isRecord(plugin)) return plugin;
          const { headersHelper: _helper, ...rest } = plugin;
          return rest;
        })
      : source.plugins,
  }),
  hostPattern: same,
  pathPattern: same,
  'skills-dir': same,
};

export const withoutHeadersHelper = (source: MarketplaceSource): MarketplaceSource =>
  byKind(WITHOUT, source);
