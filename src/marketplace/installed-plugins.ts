import { error, type PluginIssue } from '../format/issues.ts';
import { isPluginIdPart } from '../format/marketplace/ids.ts';
import { unknownFormatMessage, unreadableRecordsMessage } from './install-messages.ts';
import { INSTALL_SCOPES, type InstallScope } from './install-scopes.ts';
import { isRecord } from '../protocol/is-record.ts';

/**
 * `installed_plugins.json`, the record of what Claude Code has installed (plugins/loading.md,
 * "Check which stage a plugin reached": "records each install with its `scope`, `installPath`, and
 * `version`"; "Find plugins on disk"), and what it does with a file or a record it cannot use
 * (plugins/troubleshooting.md: "could not be read and was rebuilt", "records under names that no
 * version of Claude Code can use were removed", "holds a record under "<id>" that this version of
 * Claude Code cannot read"). The Agent SDK types no such file, so the shapes are declared here from
 * the docs. Pure: reading and writing the file and its dated copies is `PluginStateStore`'s.
 *
 * Judgments (spec/judgments.md): the file is `{ "version": 2, "plugins": { "<id>": [record, ...] } }`
 * (the docs name a "format (version <N>)" and `projectPath`, not the whole layout); `installedAt`,
 * `lastUpdated`, `gitCommitSha` and `projectPath` are optional text; fields the kit does not know
 * are kept and written back; a file with no numeric `version` is not a list of plugins in any
 * format and is rebuilt.
 */

/** The format this version of the kit reads and writes. */
const INSTALLED_PLUGINS_VERSION = 2;

export interface InstallRecord {
  readonly scope: InstallScope;
  /** Where the installed copy is; for a copied plugin `cache/<marketplace>/<plugin>/<version>/`. */
  readonly installPath: string;
  readonly version: string;
  readonly installedAt?: string;
  readonly lastUpdated?: string;
  /** The commit a git-sourced plugin was installed at. */
  readonly gitCommitSha?: string;
  /** The project folder of a `project` or `local` install. */
  readonly projectPath?: string;
  /** Fields this version does not know, kept so a rewrite loses nothing. */
  readonly extra?: Readonly<Record<string, unknown>>;
}

/** Plugin id (`name@marketplace`) to its installs, one per scope (and project). */
export type InstalledRecords = Readonly<Record<string, readonly InstallRecord[]>>;

export interface InstalledPluginsRead {
  /** The records this version can use. */
  readonly records: InstalledRecords;
  /** Raw values under keys that are not plugin ids: copy them aside, then drop them. */
  readonly setAside: Readonly<Record<string, unknown>>;
  /** Ids whose value this version cannot read, in file order. */
  readonly unreadable: readonly string[];
  /** The `version` of a file whose format this version does not know. */
  readonly unknownFormat?: number;
  /** A file that is not a list of plugins: its text, to keep, before the file is rebuilt empty. */
  readonly rebuilt?: { readonly text: string };
  /** Whether the file may be rewritten: never while a record or the format cannot be read. */
  readonly writable: boolean;
  readonly issues: readonly PluginIssue[];
}

const NOTHING: InstalledPluginsRead = {
  records: {},
  setAside: {},
  unreadable: [],
  writable: true,
  issues: [],
};

const OPTIONAL_TEXT = ['installedAt', 'lastUpdated', 'gitCommitSha', 'projectPath'] as const;
const KNOWN_KEYS: ReadonlySet<string> = new Set([
  'scope',
  'installPath',
  'version',
  ...OPTIONAL_TEXT,
]);

const scopeOf = (value: unknown): InstallScope | undefined =>
  INSTALL_SCOPES.find((scope) => scope === value);

const optionalText = (
  raw: Record<string, unknown>,
): Partial<Record<(typeof OPTIONAL_TEXT)[number], string>> | undefined => {
  const found: Partial<Record<(typeof OPTIONAL_TEXT)[number], string>> = {};
  for (const key of OPTIONAL_TEXT) {
    const value = raw[key];
    if (value === undefined) continue;
    if (typeof value !== 'string') return undefined;
    found[key] = value;
  }
  return found;
};

function readRecord(raw: unknown): InstallRecord | undefined {
  if (!isRecord(raw)) return undefined;
  const scope = scopeOf(raw['scope']);
  const { installPath, version } = raw;
  const optional = optionalText(raw);
  if (scope === undefined || optional === undefined) return undefined;
  if (typeof installPath !== 'string' || installPath === '' || typeof version !== 'string') {
    return undefined;
  }
  const extra = Object.fromEntries(Object.entries(raw).filter(([key]) => !KNOWN_KEYS.has(key)));
  return {
    scope,
    installPath,
    version,
    ...optional,
    ...(Object.keys(extra).length === 0 ? {} : { extra }),
  };
}

/** A list of records, every one of which must read; anything else is not this version's. */
function readRecords(value: unknown): readonly InstallRecord[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const records = value.map(readRecord);
  return records.every((one) => one !== undefined) ? records : undefined;
}

/** A plugin id is `<name>@<origin>`: one `@`, each side a part of a plugin id. */
function isUsableId(key: string): boolean {
  const parts = key.split('@');
  return parts.length === 2 && parts.every(isPluginIdPart);
}

function readPlugins(plugins: Record<string, unknown>): InstalledPluginsRead {
  // `Object.fromEntries` defines own properties, so a key named `__proto__` is kept, never taken as
  // the prototype the way `object[key] = value` takes it.
  const entries = Object.entries(plugins).map(([key, value]) => ({
    key,
    value,
    read: isUsableId(key) ? readRecords(value) : undefined,
    usable: isUsableId(key),
  }));
  const unreadable = entries.filter((one) => one.usable && one.read === undefined);
  const ids = unreadable.map((one) => one.key);
  return {
    records: Object.fromEntries(
      entries.flatMap((one) => (one.read === undefined ? [] : [[one.key, one.read] as const])),
    ),
    setAside: Object.fromEntries(
      entries.filter((one) => !one.usable).map((one) => [one.key, one.value]),
    ),
    unreadable: ids,
    writable: ids.length === 0,
    issues:
      ids.length === 0 ? [] : [error('installed_plugins.json', unreadableRecordsMessage(ids))],
  };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * What a file's text says. A file that "isn't valid JSON, or isn't a list of plugins" is rebuilt
 * (its text kept); a key that is not a plugin id has its record set aside; a record whose fields
 * do not parse is named and keeps the file from being rewritten; a format this version does not
 * know is named and read no further. No file is no installs.
 */
export function parseInstalledPlugins(text: string | undefined): InstalledPluginsRead {
  if (text === undefined) return NOTHING;
  const parsed = parseJson(text);
  const version = isRecord(parsed) ? parsed['version'] : undefined;
  const plugins = isRecord(parsed) ? parsed['plugins'] : undefined;
  if (typeof version !== 'number' || !isRecord(plugins)) return { ...NOTHING, rebuilt: { text } };
  if (version !== INSTALLED_PLUGINS_VERSION) {
    return {
      ...NOTHING,
      unknownFormat: version,
      writable: false,
      issues: [error('installed_plugins.json', unknownFormatMessage(version))],
    };
  }
  return readPlugins(plugins);
}

const wire = (record: InstallRecord): Record<string, unknown> => {
  const { extra, ...fields } = record;
  return { ...extra, ...fields };
};

/** The file's text for these records: two-space indented JSON and a final newline (a judgment). */
export function serializeInstalledPlugins(records: InstalledRecords): string {
  const plugins = Object.fromEntries(
    Object.entries(records).map(([id, installs]) => [id, installs.map(wire)]),
  );
  return `${JSON.stringify({ version: INSTALLED_PLUGINS_VERSION, plugins }, null, 2)}\n`;
}
