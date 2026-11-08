import { z } from 'zod';
import type { Settings } from '../../protocol/official.ts';
import type { HookPolicy } from '../hooks/policy.ts';
import type { PolicyScope } from '../layers.ts';
import type { PolicyView } from '../view.ts';
import { isRecord } from '../record.ts';
import { drop, keep, type Check, type Found } from './check-support.ts';

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
export const commandLine: Check = (value, { name }) => {
  if (
    !isRecord(value) ||
    !COMMAND.safeParse(value.type).success ||
    typeof value.command !== 'string'
  ) {
    return drop(name, 'an object with type "command" and a command string');
  }
  const found: Found[] = [];
  const optional = Object.entries(value).filter(([key, field]) => {
    const valid = OPTIONAL[key];
    if (valid === undefined || valid(field)) return true;
    found.push({ at: `.${key}`, message: `"${name}.${key}" is invalid; the field is dropped` });
    return false;
  });
  return keep(Object.fromEntries(optional), found);
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
