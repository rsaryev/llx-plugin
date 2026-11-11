import { z } from 'zod';
import type { Settings } from '../../protocol/official.ts';
import type { HookPolicy } from '../hooks/policy.ts';
import type { PolicyScope } from '../layers.ts';
import type { PolicyView } from '../view.ts';
import type { PluginIssue } from '../../format/issues.ts';
import { kept, mustBe, note, type Repair } from '../repair/support.ts';
import { isRecord } from '../../protocol/is-record.ts';
import type { PluginDefaults, PluginWithDefaults } from './plugin-defaults.ts';

/** settings-reference.md, "Status line and file suggestion gates": commands follow hook policy. */
export const COMMAND_LINE_KEYS = ['statusLine', 'fileSuggestion', 'subagentStatusLine'] as const;
type CommandKey = (typeof COMMAND_LINE_KEYS)[number];
type CommandValue = NonNullable<Settings['statusLine']>;

const OPTIONAL: Readonly<Record<string, (value: unknown) => boolean>> = {
  padding: (value) => typeof value === 'number' && Number.isFinite(value),
  refreshInterval: (value) => typeof value === 'number' && value >= 1 && Number.isFinite(value),
  hideVimModeIndicator: (value) => typeof value === 'boolean',
};

/** Invalid optional fields are dropped individually; the required command must be readable. */
const COMMAND = z.literal('command');
export const commandLine: Repair = (value, at) => {
  if (
    !isRecord(value) ||
    !COMMAND.safeParse(value.type).success ||
    typeof value.command !== 'string'
  ) {
    return mustBe(at, 'an object with type "command" and a command string');
  }
  const issues: PluginIssue[] = [];
  const optional = Object.entries(value).filter(([key, field]) => {
    const valid = OPTIONAL[key];
    if (valid === undefined || valid(field)) return true;
    issues.push(note(at, `.${key}`, `"${at.key}.${key}" is invalid; the field is dropped`));
    return false;
  });
  return kept(Object.fromEntries(optional), issues);
};

interface CommandRead {
  readonly runs: { readonly value: CommandValue; readonly scope: PolicyScope } | undefined;
  readonly skippedBecause?: 'off' | 'narrowed';
}

/** The selected command, never an execution: the host supplies the hook policy's session gates. */
export function readCommandLine(
  view: PolicyView,
  key: CommandKey,
  policy: HookPolicy,
): CommandRead {
  if (policy.commandsDisabled[key]) return { runs: undefined, skippedBecause: 'off' };
  const narrowed = policy.commandSettingsNarrowedToManaged;
  const holder = view.eachFromHighest(key).find((entry) => !narrowed || entry.scope === 'managed');
  if (holder === undefined)
    return narrowed ? { runs: undefined, skippedBecause: 'narrowed' } : { runs: undefined };
  return { runs: { value: holder.value, scope: holder.scope } };
}

/** The subagent status line that runs: a settings source's (with its scope) or a plugin's default. */
export interface SubagentLineRead<P> {
  readonly runs:
    | { readonly value: CommandValue; readonly scope: PolicyScope }
    | { readonly value: CommandValue; readonly plugin: P }
    | undefined;
  readonly skippedBecause?: 'off' | 'narrowed';
}

/**
 * `subagentStatusLine` with the plugins' defaults below every settings source (plugins/components.md,
 * "Default settings"), under the same gates as `statusLine`. statusline.md, "Subagent status lines":
 * "unlike hooks, plugin values don't run under `allowManagedHooksOnly` even when the plugin is
 * force-enabled", so a narrowed policy never runs a plugin's value.
 */
export function readSubagentStatusLine<P extends PluginWithDefaults>(
  view: PolicyView,
  policy: HookPolicy,
  defaults: PluginDefaults<P>,
): SubagentLineRead<P> {
  const read = readCommandLine(view, 'subagentStatusLine', policy);
  if (read.runs !== undefined || read.skippedBecause !== undefined) return read;
  const value = defaults.settings.subagentStatusLine;
  const plugin = defaults.owners.subagentStatusLine;
  return value === undefined || plugin === undefined ? read : { runs: { value, plugin } };
}
