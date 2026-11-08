import { z } from 'zod';
import type { Settings } from '../protocol/official.ts';
import { error, warning, type PluginIssue } from './issues.ts';

/**
 * A plugin's default settings (plugins/components.md, "Default settings"; plugins/manifest-reference.md,
 * "`settings`"): the `settings.json` at the plugin root or the inline `settings` manifest key. "Two
 * keys take effect, `agent` and `subagentStatusLine`, and every other key is dropped." The types are
 * the official `Settings` ones; applying the values (the lowest settings layer) is the host's.
 */
export type PluginSettings = Pick<Settings, 'agent' | 'subagentStatusLine'>;

/** The shape the SDK gives `subagentStatusLine` (settings-reference.md: `type` is `"command"`, plus a `command` string). */
const subagentStatusLine = z.object({ type: z.literal('command'), command: z.string() });

/** One strategy per applied key: the value it keeps, or `undefined` when it is not valid. */
const APPLIED: { readonly [K in keyof PluginSettings]-?: (value: unknown) => PluginSettings[K] } = {
  agent: (value) => z.string().safeParse(value).data,
  subagentStatusLine: (value) => subagentStatusLine.safeParse(value).data,
};

const isApplied = (name: string): name is keyof PluginSettings => Object.hasOwn(APPLIED, name);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export interface PluginSettingsRead {
  /** Only the keys that take effect and hold a valid value. */
  readonly settings: PluginSettings;
  readonly issues: readonly PluginIssue[];
}

/** True when a read holds at least one applied key: `settings.json` then wins over the manifest. */
export const hasAppliedSettings = (read: PluginSettingsRead): boolean =>
  Object.keys(read.settings).length > 0;

/**
 * Reads one settings object. Judgment (spec/judgments.md): a dropped key and an invalid value for an
 * applied key are warnings (the docs say "dropped" and name no message), and a value that is not an
 * object is an error naming `origin`.
 */
export function readPluginSettings(raw: unknown, origin: string): PluginSettingsRead {
  if (!isRecord(raw)) {
    return { settings: {}, issues: [error(origin, `${origin} must be a JSON object of settings`)] };
  }
  const issues: PluginIssue[] = [];
  const kept: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(raw)) {
    if (!isApplied(name)) {
      issues.push(
        warning(
          `${origin}.${name}`,
          `Setting "${name}" in ${origin} is dropped: only "agent" and "subagentStatusLine" take effect from a plugin`,
        ),
      );
      continue;
    }
    const accepted = APPLIED[name](value);
    if (accepted === undefined) {
      issues.push(
        warning(`${origin}.${name}`, `Setting "${name}" in ${origin} is dropped: invalid value`),
      );
    } else {
      kept[name] = accepted;
    }
  }
  return { settings: kept, issues };
}
