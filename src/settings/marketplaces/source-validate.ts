/**
 * What an `extraKnownMarketplaces` entry's `source` must be to register a marketplace
 * (settings-reference.md, `extraKnownMarketplaces` "Marketplace source types"; plugins/marketplace-reference.md
 * is the marketplace stream's). One registry over every source kind, so a new kind fails to compile.
 */
import { error, type PluginIssue } from '../../format/issues.ts';
import type { MarketplaceSource } from '../../protocol/official.ts';
import { MARKETPLACE_SOURCE_KINDS } from '../../protocol/settings-keys.ts';
import { isRecord } from '../record.ts';
import { byKindWith, type Registry, type SourceOf } from './source-kinds.ts';

type Problems = Registry<[name: string], readonly string[]>;

const NONE = (): readonly string[] => [];

/** The kinds of the policy lists that name no place a marketplace comes from. */
const NOT_A_PLACE = (source: MarketplaceSource): readonly string[] => [
  `source "${source.source}" belongs to the allowlist and blocklist and names no place a marketplace comes from`,
];

type PluginSource = Exclude<SourceOf<'settings'>['plugins'][number]['source'], string>;

/** The kinds of plugin source the SDK types for an inline plugin entry. */
type PluginSourceKind = PluginSource['source'];

/**
 * Whether each plugin source kind is "external". The docs say "external sources such as GitHub or npm"
 * and the SDK says a relative path "has no marketplace repository to resolve against"; `unsupported`
 * is the placeholder for a source Claude Code cannot read (spec/judgments.md: `command` counts as
 * external). Typed over every kind, so a new SDK kind fails to compile.
 */
const EXTERNAL: { readonly [K in PluginSourceKind]: boolean } = {
  npm: true,
  url: true,
  github: true,
  'git-subdir': true,
  archive: true,
  command: true,
  unsupported: false,
};

const isPluginSourceKind = (kind: unknown): kind is PluginSourceKind =>
  typeof kind === 'string' && Object.hasOwn(EXTERNAL, kind);

const isExternal = (plugin: unknown): boolean =>
  isRecord(plugin) &&
  isRecord(plugin.source) &&
  isPluginSourceKind(plugin.source.source) &&
  EXTERNAL[plugin.source.source];

const pluginName = (plugin: unknown, index: number): string =>
  isRecord(plugin) && typeof plugin.name === 'string' ? plugin.name : `#${index}`;

/** An inline marketplace: its `name` is the key, and each plugin is fetched from elsewhere. */
function inlineProblems(
  source: Extract<MarketplaceSource, { readonly source: 'settings' }>,
  key: string,
): readonly string[] {
  const own =
    source.name === key
      ? []
      : [`the "settings" source name "${source.name}" must equal the marketplace key "${key}"`];
  const plugins: readonly unknown[] = Array.isArray(source.plugins) ? source.plugins : [];
  const local = plugins.flatMap((plugin, index) =>
    isExternal(plugin)
      ? []
      : [
          `plugin "${pluginName(plugin, index)}" must reference an external source such as GitHub or npm`,
        ],
  );
  return [...own, ...local];
}

const PROBLEMS: Problems = {
  github: NONE,
  git: NONE,
  url: NONE,
  file: NONE,
  directory: NONE,
  npm: NONE,
  settings: inlineProblems,
  hostPattern: NOT_A_PLACE,
  pathPattern: NOT_A_PLACE,
  'skills-dir': NOT_A_PLACE,
};

const isKnownKind = (kind: string): boolean =>
  MARKETPLACE_SOURCE_KINDS.some((known) => known === kind);

/**
 * Why the entry named `key` cannot register a marketplace; empty when it can. A kind the docs and the
 * SDK do not list is not a marketplace either: the repair of the key only checks for a `source` object.
 */
export function registrationProblems(
  key: string,
  source: MarketplaceSource,
): readonly PluginIssue[] {
  const path = `extraKnownMarketplaces.${key}.source`;
  if (!isKnownKind(source.source)) {
    return [error(path, `source "${source.source}" is not a marketplace source the docs list`)];
  }
  return byKindWith(PROBLEMS, source, [key]).map((message) => error(path, message));
}
