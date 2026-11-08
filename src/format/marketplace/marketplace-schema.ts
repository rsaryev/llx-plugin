import { error, warning, type PluginIssue } from '../issues.ts';
import { unknownFieldFinding } from '../validate/unknown-fields.ts';
import type { MarketplaceMetadata, Owner } from './types.ts';
import type { Renames } from './renames.ts';

/**
 * The top level of `marketplace.json` (plugins/marketplace-reference.md, "Top-level fields" and
 * "Validation messages"): every key Claude Code reads, the type of each, and the report for a key
 * that is missing, of the wrong type or unknown. `name` and `owner.name` are checked for their
 * grammar by the caller; `plugins` is handed on entry by entry.
 */
export const MARKETPLACE_KEYS = [
  'name',
  'owner',
  'plugins',
  '$schema',
  'description',
  'version',
  'metadata',
  'forceRemoveDeletedPlugins',
  'allowCrossMarketplaceDependenciesOn',
  'renames',
] as const;
export type MarketplaceKey = (typeof MARKETPLACE_KEYS)[number];

export const METADATA_KEYS = ['description', 'version', 'pluginRoot'] as const;
export type MetadataKey = (typeof METADATA_KEYS)[number];

const isMarketplaceKey = (key: string): key is MarketplaceKey =>
  MARKETPLACE_KEYS.some((known) => known === key);
const isMetadataKey = (key: string): key is MetadataKey =>
  METADATA_KEYS.some((known) => known === key);

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The JSON type of a value, as the "got <type>" and "received <type>" reports name it. */
export function typeName(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/**
 * A required field that is absent. The docs quote `owner: Invalid input` as an example; the oracle
 * (docs/SPEC.md) names the type that was expected after it, and so does the kit.
 */
const missing = (path: string, expected: string): PluginIssue =>
  error(path, `Invalid input: expected ${expected}, received undefined`);
const mismatch = (path: string, expected: string, value: unknown): PluginIssue =>
  error(path, `Invalid input: expected ${expected}, received ${typeName(value)}`);

/** What a reader returns: the value when it is usable, and the issues it raised. */
export interface Read<T> {
  readonly value: T | undefined;
  readonly issues: readonly PluginIssue[];
}
const ok = <T>(value: T): Read<T> => ({ value, issues: [] });
const absent = <T>(): Read<T> => ({ value: undefined, issues: [] });
const fail = <T>(...issues: PluginIssue[]): Read<T> => ({ value: undefined, issues });

function optional<T>(
  value: unknown,
  path: string,
  expected: string,
  guard: (value: unknown) => value is T,
): Read<T> {
  if (value === undefined) return absent();
  return guard(value) ? ok(value) : fail(mismatch(path, expected, value));
}

const isString = (value: unknown): value is string => typeof value === 'string';
const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';

const optionalString = (value: unknown, path: string): Read<string> =>
  optional(value, path, 'string', isString);

/** Reads the optional string keys of `record` named in `keys`, each at `<prefix><key>`. */
function stringFields<K extends string>(
  record: Readonly<Record<string, unknown>>,
  keys: readonly K[],
  prefix: string,
): { readonly values: { readonly [P in K]?: string }; readonly issues: PluginIssue[] } {
  const values: { [P in K]?: string } = {};
  const issues: PluginIssue[] = [];
  for (const key of keys) {
    const read = optionalString(record[key], `${prefix}${key}`);
    issues.push(...read.issues);
    if (read.value !== undefined) values[key] = read.value;
  }
  return { values, issues };
}

const OWNER_STRINGS = ['email', 'url'] as const;

/** `owner`: an object with a `name` (non-empty) and optional `email` and `url`. */
export function readOwner(value: unknown): Read<Owner> {
  if (value === undefined) return fail(missing('owner', 'object'));
  if (!isRecord(value)) return fail(mismatch('owner', 'object', value));
  const name = value.name;
  if (name === undefined) return fail(missing('owner.name', 'string'));
  if (!isString(name)) return fail(mismatch('owner.name', 'string', name));
  if (name === '') return fail(error('owner.name', 'Author name cannot be empty'));
  const rest = stringFields(value, OWNER_STRINGS, 'owner.');
  if (rest.issues.length > 0) return fail(...rest.issues);
  return ok({ name, ...rest.values });
}

/** `metadata`: `description`, `version` and `pluginRoot`; any other key is ignored with a warning. */
function readMetadata(value: unknown): Read<MarketplaceMetadata> {
  if (value === undefined) return absent();
  if (!isRecord(value)) return fail(mismatch('metadata', 'object', value));
  const unknown = Object.keys(value)
    .filter((key) => !isMetadataKey(key))
    .map((key) => unknownField(key, `metadata.${key}`, METADATA_KEYS));
  const strings = stringFields(value, METADATA_KEYS, 'metadata.');
  if (strings.issues.length > 0) return fail(...strings.issues, ...unknown);
  return { value: strings.values, issues: unknown };
}

/**
 * The warning for a key Claude Code does not read, at `path`: the docs quote its plain form
 * (`Unknown field '<key>'`); the oracle adds where the key probably comes from (docs/SPEC.md).
 */
export const unknownField = (key: string, path: string, known: readonly string[]): PluginIssue => {
  const found = unknownFieldFinding(key, known, path, 'other');
  return warning(found.path, found.message);
};

function readStringList(value: unknown, path: string): Read<readonly string[]> {
  if (value === undefined) return absent();
  if (!Array.isArray(value)) return fail(mismatch(path, 'array', value));
  const bad = value.findIndex((item) => !isString(item));
  if (bad >= 0) return fail(mismatch(`${path}[${bad}]`, 'string', value[bad]));
  return ok(value.filter(isString));
}

/** `renames`: old plugin name to the new one, or `null` for a plugin that was removed. */
function readRenames(value: unknown): Read<Readonly<Record<string, string | null>>> {
  if (value === undefined) return absent();
  if (!isRecord(value)) return fail(mismatch('renames', 'object', value));
  const entries: [string, string | null][] = [];
  for (const [old, target] of Object.entries(value)) {
    if (target !== null && !isString(target)) {
      return fail(mismatch(`renames.${old}`, 'string or null', target));
    }
    entries.push([old, target]);
  }
  // `fromEntries` defines each key as data, so a parsed `"__proto__"` entry is kept, not a prototype.
  return ok(Object.fromEntries(entries));
}

/** `name`: required; empty is "Marketplace must have a name"; the grammar is the caller's. */
function readName(value: unknown): Read<string> {
  if (value === undefined) return fail(missing('name', 'string'));
  if (!isString(value)) return fail(mismatch('name', 'string', value));
  if (value === '') return fail(error('name', 'Marketplace must have a name'));
  return ok(value);
}

/** `plugins`: required array, handed on as it is. */
function readPlugins(value: unknown): Read<readonly unknown[]> {
  if (value === undefined) return fail(missing('plugins', 'array'));
  if (!Array.isArray(value)) return fail(mismatch('plugins', 'array', value));
  return ok(value);
}

/** The top-level fields of a marketplace, everything but its entries. */
export interface TopLevel {
  readonly name: string;
  readonly owner: Owner;
  readonly plugins: readonly unknown[];
  readonly description?: string;
  readonly version?: string;
  readonly metadata?: MarketplaceMetadata;
  readonly forceRemoveDeletedPlugins: boolean;
  readonly allowCrossMarketplaceDependenciesOn: readonly string[];
  readonly renames: Renames;
}

export interface TopLevelResult {
  /** Undefined when any field breaks the schema: such a marketplace does not load. */
  readonly top: TopLevel | undefined;
  readonly issues: readonly PluginIssue[];
}

type Reads = ReturnType<typeof readAll>;

/** The optional fields that are there; one that is not is no key (`exactOptionalPropertyTypes`). */
const optionalFields = (read: Reads): Pick<TopLevel, 'description' | 'version' | 'metadata'> => ({
  ...(read.description.value === undefined ? {} : { description: read.description.value }),
  ...(read.version.value === undefined ? {} : { version: read.version.value }),
  ...(read.metadata.value === undefined ? {} : { metadata: read.metadata.value }),
});

function readAll(raw: Readonly<Record<string, unknown>>) {
  return {
    name: readName(raw.name),
    owner: readOwner(raw.owner),
    plugins: readPlugins(raw.plugins),
    schema: optionalString(raw.$schema, '$schema'),
    description: optionalString(raw.description, 'description'),
    version: optionalString(raw.version, 'version'),
    metadata: readMetadata(raw.metadata),
    force: optional(
      raw.forceRemoveDeletedPlugins,
      'forceRemoveDeletedPlugins',
      'boolean',
      isBoolean,
    ),
    allow: readStringList(
      raw.allowCrossMarketplaceDependenciesOn,
      'allowCrossMarketplaceDependenciesOn',
    ),
    renames: readRenames(raw.renames),
  };
}

/** Reads and checks every top-level key of the parsed `marketplace.json`. */
export function readTopLevel(raw: Readonly<Record<string, unknown>>): TopLevelResult {
  const read = readAll(raw);
  const unknown = Object.keys(raw)
    .filter((key) => !isMarketplaceKey(key))
    .map((key) => unknownField(key, key, MARKETPLACE_KEYS));
  const issues = [...Object.values(read).flatMap((one) => one.issues), ...unknown];
  const { name, owner, plugins } = read;
  if (
    name.value === undefined ||
    owner.value === undefined ||
    plugins.value === undefined ||
    issues.some((found) => found.severity === 'error')
  ) {
    return { top: undefined, issues };
  }
  return {
    top: {
      name: name.value,
      owner: owner.value,
      plugins: plugins.value,
      ...optionalFields(read),
      forceRemoveDeletedPlugins: read.force.value ?? false,
      allowCrossMarketplaceDependenciesOn: read.allow.value ?? [],
      renames: read.renames.value ?? {},
    },
    issues,
  };
}
