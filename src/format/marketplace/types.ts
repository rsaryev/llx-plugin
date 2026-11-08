import type { PluginDependency, PluginManifest } from '../manifest-schema.ts';
import type { PluginIssue } from '../issues.ts';

/**
 * The contracts of the marketplace stream (docs/API.md, "Marketplace"): the shapes every later
 * piece of it reads and writes, decided once so no two of them declare a copy. Types and the two
 * closed lists of source kinds; nothing here runs.
 * Pages: plugins/marketplace-reference.md ("Top-level fields", "Plugin entries", "Plugin sources",
 * "Marketplace sources").
 */

/**
 * The seven ways a plugin entry's `source` can name where the plugin lives: a relative path string,
 * or an object whose `source` field is one of the other six (marketplace-reference.md, "Plugin
 * sources"). `command` is the kit's name for the command source; the SDK has no type for any of
 * them, they are `marketplace.json` shapes.
 */
export const PLUGIN_SOURCE_KINDS = [
  'relative',
  'github',
  'url',
  'git-subdir',
  'npm',
  'archive',
  'command',
] as const;
export type PluginSourceKind = (typeof PLUGIN_SOURCE_KINDS)[number];

/** A parsed plugin source. Registries are typed over `PluginSourceKind`, never a `switch`. */
export type PluginSource =
  /** `path` is root-relative with the leading `./` removed and `'.'` for the marketplace root; `bare` says the entry wrote a bare name that resolves under `metadata.pluginRoot`. */
  | { readonly kind: 'relative'; readonly path: string; readonly bare: boolean }
  | { readonly kind: 'github'; readonly repo: string; readonly ref?: string; readonly sha?: string }
  | { readonly kind: 'url'; readonly url: string; readonly ref?: string; readonly sha?: string }
  | {
      readonly kind: 'git-subdir';
      readonly url: string;
      readonly path: string;
      readonly ref?: string;
      readonly sha?: string;
    }
  | {
      readonly kind: 'npm';
      readonly package: string;
      readonly version?: string;
      readonly registry?: string;
    }
  | { readonly kind: 'archive'; readonly url: string; readonly sha256?: string }
  | {
      readonly kind: 'command';
      readonly command: string;
      readonly timeoutSeconds: number;
      readonly mode: 'copy' | 'link';
    };

export type PluginSourceOf<Kind extends PluginSourceKind> = Extract<PluginSource, { kind: Kind }>;

/**
 * The ten forms a marketplace source takes: in `extraKnownMarketplaces`, in `marketplace add`
 * input, and, for the last three, only in the policy lists (marketplace-reference.md,
 * "Marketplace sources", "Source values valid only in policy lists").
 */
export const MARKETPLACE_SOURCE_KINDS = [
  'url',
  'github',
  'git',
  'npm',
  'file',
  'directory',
  'settings',
  'skills-dir',
  'hostPattern',
  'pathPattern',
] as const;
export type MarketplaceSourceKind = (typeof MARKETPLACE_SOURCE_KINDS)[number];

export interface Owner {
  readonly name: string;
  readonly email?: string;
  readonly url?: string;
}

/** `relevance` of an entry (plugins/relevance.md, "Field reference"). */
export interface RelevanceSignals {
  readonly cwd?: readonly string[];
  readonly cli?: readonly string[];
  readonly hosts?: readonly string[];
  readonly filesRead?: readonly string[];
  readonly manifestDeps?: readonly { readonly file: string; readonly pattern: string }[];
}
export interface Relevance {
  readonly topic?: string;
  readonly signals?: RelevanceSignals;
}

/** The plugin.json fields an entry may carry beside its own (marketplace-reference.md, "Plugin entries"). */
type ComponentKey =
  | 'commands'
  | 'agents'
  | 'skills'
  | 'hooks'
  | 'outputStyles'
  | 'themes'
  | 'mcpServers'
  | 'lspServers'
  | 'userConfig'
  | 'channels';
type DisplayKey = 'author' | 'homepage' | 'repository' | 'license' | 'keywords';

export interface MarketplaceEntry {
  readonly name: string;
  readonly source: PluginSource;
  readonly description?: string;
  readonly version?: string;
  readonly category?: string;
  readonly tags?: readonly string[];
  /** Defaults to `true`; the entry only completes `plugin.json` (marketplace-reference.md, "Strict mode"). */
  readonly strict: boolean;
  readonly relevance?: Relevance;
  readonly dependencies?: readonly PluginDependency[];
  readonly defaultEnabled?: boolean;
  readonly displayName?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  /** Archive downloads only (host-marketplace.md, "Authenticate archive downloads"). */
  readonly headers?: Readonly<Record<string, string>>;
  readonly headersHelper?: string;
  readonly components: Readonly<Partial<Pick<PluginManifest, ComponentKey>>>;
  readonly display: Readonly<Partial<Pick<PluginManifest, DisplayKey>>>;
}

/** A marketplace source (`MarketplaceSourceKind`); the `path` of git sources defaults to `.claude-plugin/marketplace.json`. */
export type MarketplaceSource =
  | {
      readonly kind: 'url';
      readonly url: string;
      readonly headers?: Readonly<Record<string, string>>;
      readonly headersHelper?: string;
    }
  | {
      readonly kind: 'github';
      readonly repo: string;
      readonly ref?: string;
      readonly path: string;
      readonly sparsePaths?: readonly string[];
      /** Accepted and has no effect (marketplace-reference.md, "Fields by type"); kept so a source round-trips. */
      readonly skipLfs?: boolean;
    }
  | {
      readonly kind: 'git';
      readonly url: string;
      readonly ref?: string;
      readonly path: string;
      readonly sparsePaths?: readonly string[];
      /** Accepted and has no effect (marketplace-reference.md, "Fields by type"); kept so a source round-trips. */
      readonly skipLfs?: boolean;
    }
  | {
      readonly kind: 'npm';
      readonly package: string;
      /** In the SDK's `source` shape; the marketplace-sources table lists only `package`. */
      readonly version?: string;
      readonly registry?: string;
    }
  | { readonly kind: 'file'; readonly path: string }
  | { readonly kind: 'directory'; readonly path: string }
  | {
      readonly kind: 'settings';
      readonly name: string;
      readonly plugins: readonly MarketplaceEntry[];
      readonly owner?: Owner;
    }
  | { readonly kind: 'skills-dir' }
  | { readonly kind: 'hostPattern'; readonly hostPattern: string }
  | { readonly kind: 'pathPattern'; readonly pathPattern: string };

export type MarketplaceSourceOf<Kind extends MarketplaceSourceKind> = Extract<
  MarketplaceSource,
  { kind: Kind }
>;

/**
 * What `extraKnownMarketplaces` does with a source when the marketplace is added: the docs name
 * two that parse and then fail to load (marketplace-reference.md, "Source values valid only in
 * policy lists" and the `npm` row of "Marketplace sources").
 */
export type MarketplaceLoadStatus =
  | 'loads'
  | 'fails: NPM marketplace sources not yet implemented'
  | 'fails: Unsupported marketplace source type';

export interface SourceParseResult {
  readonly source: MarketplaceSource | undefined;
  readonly issues: readonly PluginIssue[];
  readonly loadStatus: MarketplaceLoadStatus;
}

export interface MarketplaceMetadata {
  readonly description?: string;
  readonly version?: string;
  readonly pluginRoot?: string;
}

export interface Marketplace {
  readonly name: string;
  readonly owner: Owner;
  readonly plugins: readonly MarketplaceEntry[];
  readonly description?: string;
  readonly version?: string;
  readonly metadata?: MarketplaceMetadata;
  readonly forceRemoveDeletedPlugins: boolean;
  readonly allowCrossMarketplaceDependenciesOn: readonly string[];
  /** Old plugin name to the new one, or `null` for a plugin that was removed. */
  readonly renames: Readonly<Record<string, string | null>>;
}

/** What the host knows about the marketplace it hands to the reader. */
export interface MarketplaceContext {
  /** Where the marketplace came from: decides what a relative-path source resolves against and the official-name exemption. */
  readonly origin?: MarketplaceSource;
  readonly platform?: 'posix' | 'windows';
  /** `plugin.json` of each relative-path entry by entry index, for the `plugins[i] plugin.json →` reports. */
  readonly pluginManifests?: ReadonlyMap<number, unknown>;
}

export interface MarketplaceResult {
  readonly marketplace: Marketplace | undefined;
  readonly issues: readonly PluginIssue[];
}
