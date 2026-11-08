/** `marketplace.json`: names, entries, plugin and marketplace sources (docs/API.md, "Marketplace"). */
export {
  MARKETPLACE_SOURCE_KINDS,
  PLUGIN_SOURCE_KINDS,
  type Marketplace,
  type MarketplaceContext,
  type MarketplaceEntry,
  type MarketplaceLoadStatus,
  type MarketplaceMetadata,
  type MarketplaceResult,
  type MarketplaceSource,
  type MarketplaceSourceKind,
  type MarketplaceSourceOf,
  type Owner,
  type PluginSource,
  type PluginSourceKind,
  type PluginSourceOf,
  type Relevance,
  type RelevanceSignals,
  type SourceParseResult,
} from './types.ts';
export {
  PLUGIN_ID_PART,
  desktopNameIssues,
  isPluginIdPart,
  pluginIdIssues,
  type IdPart,
} from './ids.ts';
