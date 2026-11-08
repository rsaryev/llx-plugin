import { warning, type PluginIssue } from '../../format/issues.ts';
import type { UserConfigValue } from '../../protocol/official.ts';
import type { PolicyKey } from '../../protocol/settings-keys.ts';
import { isRecord } from '../record.ts';
import type { PolicyView } from '../view.ts';
import { agentsMdIdForms, isGuardId, spellingsOf } from './plugin-id.ts';

/** What an option or a server value is: "a string, number, Boolean, or array of strings", as the SDK types it. */
export type OptionValue = UserConfigValue;

export type OptionValues = Readonly<Record<string, OptionValue>>;

export interface PluginConfig {
  /** The non-sensitive answers to the plugin's `userConfig` dialog. */
  readonly options: OptionValues;
  /** The per-server user configuration values, by MCP server name. */
  readonly mcpServers: Readonly<Record<string, OptionValues>>;
  /** What was dropped from the entry, as warnings. */
  readonly issues: readonly PluginIssue[];
}

const KEY = 'pluginConfigs' satisfies PolicyKey;

/**
 * The built-in plugins `pluginConfigs` reads under two ids. The guard is not here on purpose: "Claude
 * Code reads the options only under `cc-plugin-sec-default@builtin` ... `pluginConfigs` doesn't"
 * accept `sec-default@builtin` (plugins/mods/admin.md, "Set options on the built-in guard").
 */
const CONFIG_ID_FORMS = [agentsMdIdForms];

const isOptionValue = (value: unknown): value is OptionValue =>
  typeof value === 'string' ||
  typeof value === 'boolean' ||
  (typeof value === 'number' && Number.isFinite(value)) ||
  (Array.isArray(value) && value.every((item) => typeof item === 'string'));

/** The values of `entry` that are option values; a value of another shape is dropped with a warning. */
function readValues(entry: unknown, path: string): { values: OptionValues; issues: PluginIssue[] } {
  const issues: PluginIssue[] = [];
  const values: [string, OptionValue][] = [];
  for (const [name, value] of isRecord(entry) ? Object.entries(entry) : []) {
    if (isOptionValue(value)) values.push([name, value]);
    else {
      issues.push(
        warning(
          `${path}.${name}`,
          'Expected a string, number, Boolean or array of strings; the value is dropped',
        ),
      );
    }
  }
  return { values: Object.fromEntries(values), issues };
}

function readServers(
  entry: unknown,
  path: string,
): { servers: Readonly<Record<string, OptionValues>>; issues: PluginIssue[] } {
  const issues: PluginIssue[] = [];
  const servers: [string, OptionValues][] = [];
  for (const [name, server] of isRecord(entry) ? Object.entries(entry) : []) {
    if (!isRecord(server)) {
      issues.push(
        warning(`${path}.${name}`, 'Expected an object of values; the server is dropped'),
      );
      continue;
    }
    const read = readValues(server, `${path}.${name}`);
    servers.push([name, read.values]);
    issues.push(...read.issues);
  }
  return { servers: Object.fromEntries(servers), issues };
}

/**
 * The answers stored for a plugin (settings-reference.md, `pluginConfigs`). Only user and managed
 * settings carry the key, so a cloned repository cannot supply them. The highest file with a usable
 * entry for the plugin supplies it whole. A built-in plugin is found under either of its ids. The
 * built-in guard's options count in managed settings only: "the same entry in a user, project, or
 * local settings file, or in a file passed with `--settings`, neither sets an option nor loosens
 * one" (plugins/mods/admin.md, "Set options on the built-in guard").
 *
 * Judgment (spec/judgments.md): entries of two files are not combined field by field, with both
 * ids of a built-in plugin in one file the current id wins, and an entry that is not an object is
 * dropped with a warning so the next file's entry applies; the docs say none of these.
 */
export function pluginConfig(view: PolicyView, id: string): PluginConfig {
  const spellings = spellingsOf(CONFIG_ID_FORMS, id);
  const holders = view
    .eachFromHighest(KEY)
    .filter((holder) => !isGuardId(id) || holder.scope === 'managed');
  const dropped: PluginIssue[] = [];
  for (const holder of holders) {
    const spelling = spellings.find((form) => Object.hasOwn(holder.value, form));
    if (spelling === undefined) continue;
    const entry: unknown = holder.value[spelling];
    const path = `${KEY}:${spelling}`;
    if (!isRecord(entry)) {
      dropped.push(warning(path, 'Expected an object with an options field; the entry is dropped'));
      continue;
    }
    const options = readValues(entry.options, `${path}.options`);
    const servers = readServers(entry.mcpServers, `${path}.mcpServers`);
    return {
      options: options.values,
      mcpServers: servers.servers,
      issues: [...dropped, ...options.issues, ...servers.issues],
    };
  }
  return { options: {}, mcpServers: {}, issues: dropped };
}
