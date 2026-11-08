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
  type ReadMode,
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
export {
  ANY_CASING_NAMES,
  COMMUNITY_NAMES,
  DIRECTORY_NAMES,
  NON_MARKETPLACE_NAMES,
  OBJECT_MEMBER_NAMES,
  OFFICIAL_NAMES,
} from './marketplace-name-lists.ts';
export {
  downloadFolderIssues,
  loadNameIssues,
  marketplaceNameIssues,
  spellingOf,
  validationNameIssues,
  type NameOrigin,
  type RegisteredMarketplace,
} from './marketplace-names.ts';
export { MARKETPLACE_KEYS, METADATA_KEYS } from './marketplace-schema.ts';
export {
  effectiveDescription,
  effectiveVersion,
  readMarketplace,
  validateMarketplace,
  type EntryReader,
  type EntryReading,
  type EntrySlot,
} from './marketplace.ts';
export { parsePluginSource } from './plugin-source.ts';
export { createEntryReader, readEntry, type SourceParser, type SourceReading } from './entries.ts';
export { DIRECTORY_LISTING_FIELDS, ENTRY_KEYS } from './entry-schema.ts';
export { effectiveDisplayName, mergeEntryWithManifest, type EntryMerge } from './entry-merge.ts';
export { effectiveTopic } from './relevance.ts';
export {
  DEFAULT_MARKETPLACE_PATH,
  parseMarketplaceSource,
  type MarketplaceSourceOptions,
} from './marketplace-source.ts';
export { validateRenames, type Renames } from './renames.ts';
