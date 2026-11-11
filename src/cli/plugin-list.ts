import type { JsonObject, JsonValue } from '../foundation/plain-data.ts';
import type { Rendered } from './result.ts';

/**
 * `claude plugin list` (plugins/cli-reference.md, "plugin list" and "JSON output"): the groups of
 * the text listing, the `--json` array with the fields the page names, `--available` and
 * `--data-size`. Pure: the host reads the records, the settings and the data directories and passes
 * them in. The layout of a plugin's text lines is the kit's (spec/judgments.md); the group headings,
 * the empty line and every JSON field are the docs'.
 */

/** One installation, as the list shows it. Optional fields "appear only when they apply". */
export interface ListedPlugin {
  /** `name@marketplace`, `name@inline`, `name@skills-dir` or `name@synced`. */
  readonly id: string;
  /** The computed version, or the manifest's, or `unknown`. */
  readonly version: string;
  /** `user`, `project`, `local`, `managed`, `session` or `synced`. */
  readonly scope: string;
  readonly enabled: boolean;
  readonly installPath: string;
  readonly readFromFolder?: string;
  readonly folderVersion?: string;
  readonly installedAt?: string;
  readonly lastUpdated?: string;
  readonly projectPath?: string;
  readonly mcpServers?: Readonly<Record<string, JsonValue>>;
  readonly errors?: readonly string[];
  readonly notes?: readonly string[];
  readonly errorDetails?: readonly Readonly<Record<string, JsonValue>>[];
  readonly noteDetails?: readonly Readonly<Record<string, JsonValue>>[];
  /** Only for a plugin that loaded and declares `userConfig`. */
  readonly hasUserConfig?: boolean;
  /** Marketplace installs only: the project's shared settings turn it on. */
  readonly projectEnabled?: boolean;
}

/** A plugin a marketplace offers that is not installed. */
export interface AvailablePlugin {
  readonly pluginId: string;
  readonly name: string;
  readonly marketplaceName: string;
  readonly source: string | Readonly<Record<string, JsonValue>>;
  readonly description?: string;
  readonly version?: string;
  readonly installCount?: number;
}

/** What measuring a saved data directory found; absent for a missing or empty one. */
export type DataSize = { readonly bytes: number } | 'unreadable';

export interface ListRequest {
  readonly installed: readonly ListedPlugin[];
  readonly available?: readonly AvailablePlugin[];
}

export interface ListOptions {
  readonly json: boolean;
  /** `--available`: "has no effect without `--json`". */
  readonly available?: boolean;
  /**
   * `--data-size [plugin]`: `true` for every installed plugin, or one `name@marketplace`; "has no
   * effect without `--json`". `sizes` is what the host measured, by id.
   */
  readonly dataSize?: true | string;
  readonly sizes?: Readonly<Record<string, DataSize | undefined>>;
}

/** How the page's four groups are named and which ids belong to them. */
const GROUPS: readonly { readonly suffix: string | undefined; readonly heading: string }[] = [
  { suffix: undefined, heading: 'Installed plugins:' },
  { suffix: 'inline', heading: 'Session-only plugins (--plugin-dir / --plugin-url):' },
  { suffix: 'skills-dir', heading: 'Skills-directory plugins (.claude/skills/*):' },
  { suffix: 'synced', heading: 'Synced from claude.ai' },
];

const NOTHING = 'No plugins installed. Use `claude plugin install` to install a plugin.';

const suffixOf = (id: string): string => id.slice(id.lastIndexOf('@') + 1);
const OTHER_SUFFIXES = new Set(
  GROUPS.flatMap((group) => (group.suffix === undefined ? [] : [group.suffix])),
);

const inGroup = (plugin: ListedPlugin, suffix: string | undefined): boolean =>
  suffix === undefined ? !OTHER_SUFFIXES.has(suffixOf(plugin.id)) : suffixOf(plugin.id) === suffix;

const lines = (plugin: ListedPlugin): readonly string[] => [
  `  ❯ ${plugin.id}`,
  `    Version: ${plugin.version}`,
  `    Scope: ${plugin.scope}`,
  `    Status: ${plugin.enabled ? '✔ enabled' : '✘ disabled'}`,
  ...(plugin.errors ?? []).map((message) => `    Error: ${message}`),
  ...(plugin.notes ?? []).map((message) => `    Note: ${message}`),
];

/** The text listing, grouped by how each plugin loads; nothing in any group is one line. */
export function listText(installed: readonly ListedPlugin[]): readonly string[] {
  const groups = GROUPS.flatMap((group) => {
    const members = installed.filter((plugin) => inGroup(plugin, group.suffix));
    return members.length === 0 ? [] : [group.heading, ...members.flatMap(lines)];
  });
  return groups.length === 0 ? [NOTHING] : groups;
}

const KILO = 1024;
/** `human` of `dataDirSize`: the byte count in the largest binary unit that keeps it above 1. */
function humanBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= KILO && unit < units.length - 1) {
    value /= KILO;
    unit += 1;
  }
  return unit === 0 ? `${bytes} B` : `${value.toFixed(1)} ${units[unit]}`;
}

/** Whether a plugin keeps a saved data directory: "Marketplace installs only". */
const isMarketplaceInstall = (plugin: ListedPlugin): boolean =>
  !OTHER_SUFFIXES.has(suffixOf(plugin.id));

function sizeFields(plugin: ListedPlugin, options: ListOptions): JsonObject {
  const wanted =
    options.dataSize === true || (options.dataSize !== undefined && options.dataSize === plugin.id);
  const found = options.sizes?.[plugin.id];
  if (!wanted || !isMarketplaceInstall(plugin) || found === undefined) return {};
  if (found === 'unreadable') return { dataDirUnreadable: true };
  return found.bytes > 0
    ? { dataDirSize: { bytes: found.bytes, human: humanBytes(found.bytes) } }
    : {};
}

/** The fields of an object that are set; an empty list of errors or notes does not "apply" either. */
function present(fields: Readonly<Record<string, JsonValue | undefined>>): JsonObject {
  const kept: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(fields)) {
    const empty = Array.isArray(value) && value.length === 0;
    if (value !== undefined && !empty) kept[key] = value;
  }
  return kept;
}

/** One installed plugin as a JSON object, only the fields that apply. */
export function installedJson(
  plugin: ListedPlugin,
  options: ListOptions = { json: true },
): JsonObject {
  return present({
    id: plugin.id,
    version: plugin.version,
    scope: plugin.scope,
    enabled: plugin.enabled,
    installPath: plugin.installPath,
    readFromFolder: plugin.readFromFolder,
    folderVersion: plugin.folderVersion,
    installedAt: plugin.installedAt,
    lastUpdated: plugin.lastUpdated,
    projectPath: plugin.projectPath,
    mcpServers: plugin.mcpServers,
    errors: plugin.errors,
    notes: plugin.notes,
    errorDetails: plugin.errorDetails,
    noteDetails: plugin.noteDetails,
    hasUserConfig: plugin.hasUserConfig,
    projectEnabled: plugin.projectEnabled,
    ...sizeFields(plugin, options),
  });
}

/** The `available` entry. */
export const availableJson = (plugin: AvailablePlugin): JsonObject =>
  present({
    pluginId: plugin.pluginId,
    name: plugin.name,
    marketplaceName: plugin.marketplaceName,
    source: plugin.source,
    description: plugin.description,
    version: plugin.version,
    installCount: plugin.installCount,
  });

const NOT_INSTALLED = '--data-size names a plugin that is not installed';

/**
 * What `claude plugin list` prints. `--json` is an array with one object per installation, or with
 * `--available` one object holding `installed` and `available`. A `--data-size` plugin with no install
 * record prints its message and exits `1` "instead of printing the list".
 */
export function planPluginList(request: ListRequest, options: ListOptions): Rendered {
  if (typeof options.dataSize === 'string' && options.json) {
    const named = options.dataSize;
    if (!request.installed.some((plugin) => plugin.id === named)) {
      return { stdout: [], stderr: [NOT_INSTALLED], exitCode: 1 };
    }
  }
  if (!options.json) return { stdout: [...listText(request.installed)], stderr: [], exitCode: 0 };
  const installed = request.installed.map((plugin) => installedJson(plugin, options));
  const printed =
    options.available === true
      ? { installed, available: (request.available ?? []).map(availableJson) }
      : installed;
  return { stdout: [JSON.stringify(printed)], stderr: [], exitCode: 0 };
}
