import { z } from 'zod';
import type { PluginIssue } from '../issues.ts';
import { MANIFEST_SCHEMAS, type ManifestKey } from '../manifest-schema.ts';
import { zodIssues } from './schema-issues.ts';

/**
 * The keys of a plugin entry and the type of each (plugins/marketplace-reference.md, "Plugin
 * entries"): the entry's own fields, and every `plugin.json` field ("an entry also accepts every
 * `plugin.json` field") except the directory listing fields, which "claude plugin validate reports
 * ... as an unknown field" (plugins/manifest-reference.md, "Directory listing fields"). The shared
 * fields reuse the manifest's schemas, so an entry and a plugin.json cannot disagree on a type.
 */

/** Anthropic's directory reads these from `plugin.json`; in an entry they are unknown keys. */
const DIRECTORY_LISTING_FIELDS = [
  'icon',
  'documentationUrl',
  'supportUrl',
  'privacyPolicyUrl',
  'termsOfServiceUrl',
] as const;
type ListingField = (typeof DIRECTORY_LISTING_FIELDS)[number];

/** Keys of a manifest that an entry reads with a reader of its own (`entries.ts`). */
type ReadApart = 'name' | 'metadata' | 'experimental';

/** The manifest's schemas for the fields an entry shares; a new manifest key fails to compile until it is placed. */
const SHARED: {
  readonly [K in Exclude<ManifestKey, ListingField | ReadApart>]: (typeof MANIFEST_SCHEMAS)[K];
} = {
  $schema: MANIFEST_SCHEMAS.$schema,
  displayName: MANIFEST_SCHEMAS.displayName,
  version: MANIFEST_SCHEMAS.version,
  description: MANIFEST_SCHEMAS.description,
  author: MANIFEST_SCHEMAS.author,
  homepage: MANIFEST_SCHEMAS.homepage,
  repository: MANIFEST_SCHEMAS.repository,
  license: MANIFEST_SCHEMAS.license,
  keywords: MANIFEST_SCHEMAS.keywords,
  defaultEnabled: MANIFEST_SCHEMAS.defaultEnabled,
  dependencies: MANIFEST_SCHEMAS.dependencies,
  settings: MANIFEST_SCHEMAS.settings,
  userConfig: MANIFEST_SCHEMAS.userConfig,
  types: MANIFEST_SCHEMAS.types,
  channels: MANIFEST_SCHEMAS.channels,
  skills: MANIFEST_SCHEMAS.skills,
  commands: MANIFEST_SCHEMAS.commands,
  agents: MANIFEST_SCHEMAS.agents,
  hooks: MANIFEST_SCHEMAS.hooks,
  mcpServers: MANIFEST_SCHEMAS.mcpServers,
  lspServers: MANIFEST_SCHEMAS.lspServers,
  outputStyles: MANIFEST_SCHEMAS.outputStyles,
  workflows: MANIFEST_SCHEMAS.workflows,
  themes: MANIFEST_SCHEMAS.themes,
  monitors: MANIFEST_SCHEMAS.monitors,
};

/** The entry's own fields (the field table of "Plugin entries"), beyond `source`, `relevance` and `metadata`. */
const OWN = {
  name: z.string(),
  category: z.string(),
  tags: z.array(z.string()),
  strict: z.boolean(),
  headers: z.record(z.string(), z.string()),
  headersHelper: z.string(),
};

const FIELD_SCHEMAS = { ...SHARED, ...OWN };
const fieldsSchema = z.object(FIELD_SCHEMAS).partial();

/** The fields of an entry that read with a plain schema, as parsed. */
export type EntryFields = z.output<typeof fieldsSchema>;

/** Every key an entry knows: any other is reported as an unknown field. */
export const ENTRY_KEYS: readonly string[] = [
  'source',
  'relevance',
  'metadata',
  'experimental',
  ...Object.keys(FIELD_SCHEMAS),
];

const known = new Set(ENTRY_KEYS);
export const isEntryKey = (key: string): boolean => known.has(key);

export interface FieldsResult {
  /** Undefined when a field breaks its schema. */
  readonly fields: EntryFields | undefined;
  readonly issues: readonly PluginIssue[];
}

/** Reads the plain fields of a raw entry one by one, so each problem names its own field. */
export function readEntryFields(
  raw: Readonly<Record<string, unknown>>,
  base: string,
): FieldsResult {
  const kept: Record<string, unknown> = {};
  const issues: PluginIssue[] = [];
  for (const [key, schema] of Object.entries(FIELD_SCHEMAS)) {
    const value = Object.hasOwn(raw, key) ? raw[key] : undefined;
    if (value === undefined) continue;
    const parsed = schema.safeParse(value);
    if (parsed.success) kept[key] = parsed.data;
    else issues.push(...zodIssues(parsed.error, `${base}.${key}`));
  }
  // Every kept key passed its own schema, so the whole parses; this types it without a cast.
  const whole = fieldsSchema.safeParse(kept);
  return { fields: whole.success ? whole.data : undefined, issues };
}
