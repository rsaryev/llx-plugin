/**
 * Where Claude Code keeps plugin files and state records (plugins/loading.md, "Find plugins on
 * disk"; env-vars.md, `CLAUDE_CODE_PLUGIN_CACHE_DIR`): one plugins root, and under it the version
 * cache, the persistent data folders, the marketplace clones, the claude.ai sync folders, the JSON
 * records and the dated copies Claude Code keeps before it rewrites `installed_plugins.json`.
 *
 * Pure path builders over a host-supplied `join` (the host's own separator, as `Locations.joinPath`):
 * the kit never concatenates a path with its own separator and uses no `node:path` (L3).
 */

/** `base` and a `/`-separated relative path joined the way the host writes paths (`Locations.joinPath`). */
export type PathJoin = (base: string, relativePath: string) => string;

/** The plugins root of a default install, relative to the home directory. */
const DEFAULT_ROOT = '.claude/plugins';

/**
 * The plugins root: `CLAUDE_CODE_PLUGIN_CACHE_DIR` when set, else `~/.claude/plugins`. "Despite the
 * name, this sets the parent directory, not the cache itself" (env-vars.md). Judgment
 * (spec/judgments.md): an empty value is no override, as for an unset variable.
 */
export function resolvePluginsRoot(options: {
  readonly home: string;
  readonly override?: string;
  readonly join: PathJoin;
}): string {
  const { override, home, join } = options;
  return override === undefined || override === '' ? join(home, DEFAULT_ROOT) : override;
}

/** The names the table of "Find plugins on disk" gives; each is directly under the root. */
export const STORE_NAMES = {
  cache: 'cache',
  data: 'data',
  marketplaces: 'marketplaces',
  synced: 'synced',
  trash: '.trash',
  installedPlugins: 'installed_plugins.json',
  knownMarketplaces: 'known_marketplaces.json',
  knownMarketplacesClaudeAi: 'known_marketplaces_claudeai.json',
  flaggedPlugins: 'flagged-plugins.json',
} as const;

const SET_ASIDE_PREFIX = 'installed_plugins.set-aside.';
const UNREADABLE_PREFIX = 'installed_plugins.unreadable.';

export interface StoreLayout {
  readonly root: string;
  /** A file or folder directly under the root, by name (a name listed in `STORE_NAMES` or a dated copy). */
  file(name: string): string;
  cache(): string;
  /** `cache/<marketplace>/<plugin>/<version>/`: `${CLAUDE_PLUGIN_ROOT}` of a copied marketplace plugin. */
  versionDir(marketplace: string, plugin: string, version: string): string;
  /** `data/<plugin-id>/`; `dataId` is the sanitized `<plugin-id>` (`pluginDataId`, `loading/resolve`). */
  pluginData(dataId: string): string;
  /** `marketplaces/<name>/`: the clone or download of a GitHub, git or URL marketplace. */
  marketplace(name: string): string;
  synced(): string;
  trash(): string;
  installedPlugins(): string;
  knownMarketplaces(): string;
  /** A marketplace hosted on claude.ai is recorded here instead of in `known_marketplaces.json`. */
  knownMarketplacesClaudeAi(): string;
  flaggedPlugins(): string;
  /** The copy of the install records dropped for names no version can use. */
  setAsideCopy(date: string, hash: string): string;
  /** The copy of an `installed_plugins.json` that could not be read. */
  unreadableCopy(date: string, hash: string): string;
}

/**
 * The layout under `root`. Judgment (spec/judgments.md): `<date>` and `<hash>` of the dated copies
 * are the caller's text (the docs give the shape, not the date format or the hash input).
 */
export function createStoreLayout(root: string, join: PathJoin): StoreLayout {
  const under = (...parts: readonly string[]): string => join(root, parts.join('/'));
  return {
    root,
    file: (name) => under(name),
    cache: () => under(STORE_NAMES.cache),
    versionDir: (marketplace, plugin, version) =>
      under(STORE_NAMES.cache, marketplace, plugin, version),
    pluginData: (dataId) => under(STORE_NAMES.data, dataId),
    marketplace: (name) => under(STORE_NAMES.marketplaces, name),
    synced: () => under(STORE_NAMES.synced),
    trash: () => under(STORE_NAMES.trash),
    installedPlugins: () => under(STORE_NAMES.installedPlugins),
    knownMarketplaces: () => under(STORE_NAMES.knownMarketplaces),
    knownMarketplacesClaudeAi: () => under(STORE_NAMES.knownMarketplacesClaudeAi),
    flaggedPlugins: () => under(STORE_NAMES.flaggedPlugins),
    setAsideCopy: (date, hash) => under(`${SET_ASIDE_PREFIX}${date}.${hash}.json`),
    unreadableCopy: (date, hash) => under(`${UNREADABLE_PREFIX}${date}.${hash}.kept`),
  };
}

/** What a name directly under the plugins root is, as the table of "Find plugins on disk" lists them. */
export type StoreEntry =
  | 'cache'
  | 'data'
  | 'marketplaces'
  | 'synced'
  | 'trash'
  | 'installed-plugins'
  | 'known-marketplaces'
  | 'known-marketplaces-claudeai'
  | 'flagged-plugins'
  | 'set-aside-copy'
  | 'unreadable-copy'
  | 'unknown';

const SET_ASIDE_NAME = /^installed_plugins\.set-aside\.[^./]+\.[^./]+\.json$/;
const UNREADABLE_NAME = /^installed_plugins\.unreadable\.[^./]+\.[^./]+\.kept$/;

const EXACT: Readonly<Record<string, StoreEntry>> = {
  [STORE_NAMES.cache]: 'cache',
  [STORE_NAMES.data]: 'data',
  [STORE_NAMES.marketplaces]: 'marketplaces',
  [STORE_NAMES.synced]: 'synced',
  [STORE_NAMES.trash]: 'trash',
  [STORE_NAMES.installedPlugins]: 'installed-plugins',
  [STORE_NAMES.knownMarketplaces]: 'known-marketplaces',
  [STORE_NAMES.knownMarketplacesClaudeAi]: 'known-marketplaces-claudeai',
  [STORE_NAMES.flaggedPlugins]: 'flagged-plugins',
};

export function classifyStoreEntry(name: string): StoreEntry {
  if (Object.hasOwn(EXACT, name)) return EXACT[name] ?? 'unknown';
  if (SET_ASIDE_NAME.test(name)) return 'set-aside-copy';
  return UNREADABLE_NAME.test(name) ? 'unreadable-copy' : 'unknown';
}
