import { error, warning, type PluginIssue } from '../issues.ts';
import { nameValidationIssues } from '../names.ts';
import { desktopNameIssues, pluginIdIssues } from './ids.ts';
import { isRecord } from './marketplace-schema.ts';
import type { MarketplaceEntry, PluginSource, PluginSourceKind, ReadMode } from './types.ts';

/**
 * The checks of a plugin entry beyond its field types (plugins/marketplace-reference.md,
 * "Validation messages"): the name, a name used twice, the archive-only header fields, and a
 * version that plugin.json overrides.
 */

/** A kept entry and the place it had in `plugins`. */
export interface IndexedEntry {
  readonly index: number;
  readonly entry: MarketplaceEntry;
}

/**
 * Two entries with one name: "Duplicate plugin name "x" found in marketplace". The first keeps
 * the name; a later one is dropped alone (the docs say each entry is validated on its own and
 * leave the pair open: spec/judgments.md).
 */
export function withoutDuplicates(read: readonly IndexedEntry[]): {
  entries: MarketplaceEntry[];
  issues: PluginIssue[];
} {
  const seen = new Set<string>();
  const entries: MarketplaceEntry[] = [];
  const issues: PluginIssue[] = [];
  for (const { index, entry } of read) {
    if (seen.has(entry.name)) {
      issues.push(
        error(
          `plugins[${index}].name`,
          `Duplicate plugin name "${entry.name}" found in marketplace`,
        ),
      );
    } else {
      seen.add(entry.name);
      entries.push(entry);
    }
  }
  return { entries, issues };
}

/**
 * What `claude plugin validate` says of a name that passes as one of Anthropic's own. Loading does
 * not: "Claude Code still installs and loads a plugin whose name they refuse" (manifest-reference.md,
 * "`name`").
 */
const RESERVED: { readonly [M in ReadMode]: (name: string, path: string) => PluginIssue[] } = {
  load: () => [],
  // The kebab-case advice is the manifest's own; entries may use capitals (the id grammar allows them).
  validate: (name, path) =>
    nameValidationIssues(name)
      .filter((found) => !found.message.endsWith('is not kebab-case'))
      .map((found) => ({ ...found, path })),
};

/** The grammar of the install id, Claude Desktop's, and (when validating) the reserved names. */
export function nameIssues(name: string, path: string, mode: ReadMode): PluginIssue[] {
  if (name === '') return [error(path, 'Plugin must have a name')];
  return [
    ...pluginIdIssues('plugin', name, path),
    ...desktopNameIssues('plugin', name, path),
    ...RESERVED[mode](name, path),
  ];
}

/** Which sources `headers` and `headersHelper` apply to: "only apply to "archive" sources". */
const TAKES_HEADERS: { readonly [K in PluginSourceKind]: boolean } = {
  relative: false,
  github: false,
  url: false,
  'git-subdir': false,
  npm: false,
  archive: true,
  command: false,
};

export interface HeaderFields {
  readonly name: string;
  readonly strict: boolean;
  readonly headers?: unknown;
  readonly headersHelper?: unknown;
}

const HEADER_FIELDS = ['headers', 'headersHelper'] as const;

/** `headers`/`headersHelper` on a source that ignores them, and a helper without `"strict": false`. */
export function headerIssues(
  entry: HeaderFields,
  source: PluginSource,
  base: string,
): PluginIssue[] {
  const found: PluginIssue[] = [];
  if (!TAKES_HEADERS[source.kind]) {
    for (const field of HEADER_FIELDS.filter((key) => entry[key] !== undefined)) {
      found.push(
        warning(
          `${base}.${field}`,
          `Plugin "${entry.name}" sets headers/headersHelper, which only apply to "archive" sources; they have no effect on this entry.`,
        ),
      );
    }
    return found;
  }
  if (entry.headersHelper !== undefined && entry.strict) {
    found.push(
      error(
        `${base}.headersHelper`,
        `Plugin "${entry.name}" sets headersHelper but is not "strict": false`,
      ),
    );
  }
  return found;
}

/** Where plugin.json sits for a source whose files are inside the marketplace; other sources are not read before install. */
const MANIFEST_FILE: {
  readonly [K in PluginSourceKind]: (source: PluginSource) => string | undefined;
} = {
  relative: (source) =>
    'bare' in source
      ? `${source.path === '.' ? '.' : `./${source.path}`}/.claude-plugin/plugin.json`
      : undefined,
  github: () => undefined,
  url: () => undefined,
  'git-subdir': () => undefined,
  npm: () => undefined,
  archive: () => undefined,
  command: () => undefined,
};

/**
 * "Entry declares version "x" but <path>/plugin.json says "y". At install time, plugin.json wins",
 * for a relative-path entry, "whose plugin files are inside the marketplace itself", when the two
 * versions differ.
 */
export function versionIssues(
  version: string | undefined,
  source: PluginSource,
  manifest: unknown,
  base: string,
): PluginIssue[] {
  const file = MANIFEST_FILE[source.kind](source);
  if (version === undefined || file === undefined || !isRecord(manifest)) return [];
  const theirs = manifest.version;
  if (typeof theirs !== 'string' || theirs === version) return [];
  return [
    warning(
      `${base}.version`,
      `Entry declares version "${version}" but ${file} says "${theirs}". At install time, plugin.json wins`,
    ),
  ];
}
