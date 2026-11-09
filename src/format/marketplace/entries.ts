import { blocksLoading, error, warning, type PluginIssue } from '../issues.ts';
import { MANIFEST_SCHEMAS } from '../manifest-schema.ts';
import { defined } from '../defined.ts';
import { headerIssues, nameReports, versionIssues } from './entry-checks.ts';
import { ENTRY_KEYS, isEntryKey, readEntryFields, type EntryFields } from './entry-schema.ts';
import type { EntryReader, EntryReading, EntrySlot } from './marketplace.ts';
import { isRecord, typeName, unknownField } from './marketplace-schema.ts';
import { readRelevance } from './relevance.ts';
import { zodIssues } from './schema-issues.ts';
import type { MarketplaceEntry, PluginSource } from './types.ts';

/**
 * Reading one plugin entry of `marketplace.json` (plugins/marketplace-reference.md, "Plugin
 * entries" and "Validation messages"): an entry with an error is dropped alone, a warning keeps it.
 * `source` is handed to the plugin source parser (`parsePluginSource`), which this reader takes as a
 * parameter so the two are written and tested apart.
 */

/** What a plugin source parser returns: the source, or `undefined` with the issues that say why. */
export interface SourceReading {
  readonly source: PluginSource | undefined;
  readonly issues: readonly PluginIssue[];
}
export type SourceParser = (raw: unknown, slot: EntrySlot) => SourceReading;

const dropped = (...issues: PluginIssue[]): EntryReading => ({
  entry: undefined,
  issues,
  schemaSound: false,
});

/** `name`: required, and an install id (letters, digits, `.`, `_`, `-`). A wrong type is the field reader's report. */
function readName(raw: Readonly<Record<string, unknown>>, base: string, slot: EntrySlot) {
  const path = `${base}.name`;
  if (raw.name === undefined) {
    return {
      shape: [error(path, 'Invalid input: expected string, received undefined')],
      reserved: [],
    };
  }
  if (typeof raw.name !== 'string') return { shape: [], reserved: [] };
  return nameReports(raw.name, path, slot.mode ?? 'load', slot.context.marketplaceName);
}

/** `source`: required, a string or an object; what it means is the parser's. */
function readSource(
  raw: unknown,
  slot: EntrySlot,
  base: string,
  parse: SourceParser,
): SourceReading {
  if (typeof raw === 'string' || isRecord(raw)) return parse(raw, slot);
  return { source: undefined, issues: [error(`${base}.source`, 'Invalid input')] };
}

/** A free-form object field: anything else is a warning and the value is dropped, as Claude Code does. */
function objectOrWarning(
  value: unknown,
  path: string,
  expected: string,
): { value: Record<string, unknown> | undefined; issues: PluginIssue[] } {
  if (value === undefined) return { value: undefined, issues: [] };
  if (isRecord(value)) return { value, issues: [] };
  const key = path.slice(path.lastIndexOf('.') + 1);
  return {
    value: undefined,
    issues: [
      warning(
        path,
        `'${key}' must be ${expected}; got ${typeName(value)}. It will be ignored at load time.`,
      ),
    ],
  };
}

/** `experimental`: an object of component declarations, `themes`, `monitors` and `evals`. */
function readExperimental(raw: unknown, path: string) {
  const object = objectOrWarning(raw, path, 'an object containing component declarations');
  if (object.value === undefined) return { value: undefined, issues: object.issues };
  const parsed = MANIFEST_SCHEMAS.experimental.safeParse(object.value);
  return parsed.success
    ? { value: parsed.data, issues: [] }
    : { value: undefined, issues: zodIssues(parsed.error, path) };
}

/** The fields an entry reads with a reader of their own. */
function readApart(raw: Readonly<Record<string, unknown>>, base: string) {
  const metadata = objectOrWarning(raw.metadata, `${base}.metadata`, 'a free-form object');
  const experimental = readExperimental(raw.experimental, `${base}.experimental`);
  const relevance = readRelevance(raw.relevance, `${base}.relevance`);
  return {
    metadata: metadata.value,
    experimental: experimental.value,
    relevance: relevance.relevance,
    issues: [...metadata.issues, ...experimental.issues, ...relevance.issues],
  };
}

type Apart = ReturnType<typeof readApart>;

function build({ fields, name, source }: Parts, apart: Apart): MarketplaceEntry {
  return {
    name,
    source,
    strict: fields.strict ?? true,
    ...defined({
      description: fields.description,
      version: fields.version,
      category: fields.category,
      tags: fields.tags,
      relevance: apart.relevance,
      dependencies: fields.dependencies,
      defaultEnabled: fields.defaultEnabled,
      displayName: fields.displayName,
      metadata: apart.metadata,
      headers: fields.headers,
      headersHelper: fields.headersHelper,
    }),
    components: defined({
      commands: fields.commands,
      agents: fields.agents,
      skills: fields.skills,
      hooks: fields.hooks,
      outputStyles: fields.outputStyles,
      themes: fields.themes,
      mcpServers: fields.mcpServers,
      lspServers: fields.lspServers,
      userConfig: fields.userConfig,
      channels: fields.channels,
      settings: fields.settings,
      workflows: fields.workflows,
      monitors: fields.monitors,
      experimental: apart.experimental,
      types: fields.types,
    }),
    display: defined({
      author: fields.author,
      homepage: fields.homepage,
      repository: fields.repository,
      license: fields.license,
      keywords: fields.keywords,
    }),
  };
}

/** What a readable entry is made of: its fields, its name and its source. */
interface Parts {
  readonly fields: EntryFields;
  readonly name: string;
  readonly source: PluginSource;
}

/** The reports that need the parsed fields and the parsed source together. */
function crossIssues(
  { fields, name, source }: Parts,
  slot: EntrySlot,
  base: string,
  sound: boolean,
): PluginIssue[] {
  const header = { ...fields, name, strict: fields.strict ?? true };
  const manifest = slot.context.pluginManifests?.get(slot.index);
  return [
    ...headerIssues(header, source, base),
    // An entry the schema already rejects is not compared with its manifest (oracle 2.1.319).
    ...(sound ? versionIssues(fields.version, source, manifest, base) : []),
  ];
}

const unknownKeys = (raw: Readonly<Record<string, unknown>>, base: string): PluginIssue[] =>
  Object.keys(raw)
    .filter((key) => !isEntryKey(key))
    .map((key) => unknownField(key, `${base}.${key}`, ENTRY_KEYS));

/** Reads one raw `plugins[i]`; never throws. */
export function readEntry(raw: unknown, slot: EntrySlot, parseSource: SourceParser): EntryReading {
  const base = `plugins[${slot.index}]`;
  if (!isRecord(raw)) {
    return dropped(error(base, `Invalid input: expected object, received ${typeName(raw)}`));
  }
  const { fields, issues: fieldIssues } = readEntryFields(raw, base);
  const source = readSource(raw.source, slot, base, parseSource);
  const apart = readApart(raw, base);
  const named = readName(raw, base, slot);
  const issues = [
    ...named.shape,
    ...named.reserved,
    ...fieldIssues,
    ...source.issues,
    ...apart.issues,
    ...unknownKeys(raw, base),
  ];
  // The reserved-name ruling does not stop the comparison with the entry's manifest (oracle 2.1.319).
  const sound = !blocksLoading([...named.shape, ...fieldIssues, ...source.issues, ...apart.issues]);
  const name = fields?.name;
  if (fields === undefined || name === undefined || source.source === undefined) {
    return dropped(...issues);
  }
  const parts = { fields, name, source: source.source };
  issues.push(...crossIssues(parts, slot, base, sound));
  if (blocksLoading(issues)) return { entry: undefined, issues, schemaSound: sound };
  return { entry: build(parts, apart), issues };
}

/** The entry reader of a marketplace, over the plugin source parser (pass it to `readMarketplace`). */
export const createEntryReader =
  (parseSource: SourceParser): EntryReader =>
  (raw, slot) =>
    readEntry(raw, slot, parseSource);
