import { warning, type PluginIssue } from '../../format/issues.ts';
import type { SettingsKey } from '../general/keys.ts';
import type { PolicyScope } from '../layers.ts';

/**
 * What a repair knows about the value it reads. `closed` is true for the policy tier (managed and
 * parent settings), where an unreadable value of a restrictive key reads as its restrictive value
 * (managed-settings.md, "Keys that fail closed"); a user, project, local or `--settings` file only
 * loses the value or the entry (settings.md, "Fix a broken settings file").
 */
export interface RepairAt {
  readonly key: SettingsKey;
  readonly scope: PolicyScope;
  readonly closed: boolean;
}

/** The value comes from the SDK's `managedSettings`, which the host passes as parent settings. */
export const isParent = (at: RepairAt): boolean => at.scope === 'parent';

/** The repaired value (`undefined`: the key does not apply) and what was said about it. */
export interface Repaired {
  readonly value: unknown;
  readonly issues: readonly PluginIssue[];
  /** The key was present and unreadable, and no value can stand for what that means: the layer records it (`PolicyLayer.invalid`). */
  readonly invalid?: boolean;
}

export type Repair = (value: unknown, at: RepairAt) => Repaired;

/** `<scope>:<field>`: the source and the field a report names (errors.md: `<source> (<field>)`). */
export const where = (at: RepairAt, field = ''): string => `${at.scope}:${at.key}${field}`;

export const kept = (value: unknown, issues: readonly PluginIssue[] = []): Repaired => ({
  value,
  issues,
});

/** A warning about the value, or about `field` inside it. */
export const note = (at: RepairAt, field: string, message: string): PluginIssue =>
  warning(where(at, field), message);

/**
 * An invalid value that does not apply: dropped with a warning. The one wording of a key that is
 * dropped, the kit's own: errors.md quotes only `crossSessionInbound`'s ("This value was ignored").
 */
export const dropped = (at: RepairAt, reason: string): Repaired => ({
  value: undefined,
  issues: [note(at, '', `${reason}; the key is ignored`)],
});

/** `"<key>" must be <expected>; the key is ignored`. */
export const mustBe = (at: RepairAt, expected: string): Repaired =>
  dropped(at, `"${at.key}" must be ${expected}`);

/** `"<key>" was present but invalid; <effect>`: the report of a value that fails closed (managed-settings.md). */
export const presentButInvalid = (at: RepairAt, effect: string, field = ''): PluginIssue =>
  note(at, field, `"${at.key}${field}" was present but invalid; ${effect}`);

/**
 * An unreadable value of a restrictive key reads as `effect` until fixed; the report says the key
 * "was present but invalid" and names the value it is treated as (managed-settings.md).
 */
export const failedClosed = (at: RepairAt, value: unknown, effect: string): Repaired => ({
  value,
  issues: [presentButInvalid(at, `it is treated as ${effect}`)],
});

/**
 * An unreadable value whose restrictive effect no value expresses: no value is kept, the layer
 * records the key as invalid and the report names what Claude Code does until it is fixed.
 */
export const failedClosedNoValue = (at: RepairAt, effect: string): Repaired => ({
  value: undefined,
  invalid: true,
  issues: [presentButInvalid(at, effect)],
});

/**
 * An entry of a list or a map skipped on its own: "Claude Code skips those values and keeps the rest
 * of the file in effect" (settings.md, "Fix a broken settings file").
 */
export const entryDropped = (at: RepairAt, index: number | string, reason: string): PluginIssue =>
  note(
    at,
    typeof index === 'number' ? `[${index}]` : `.${index}`,
    `${reason}; the entry is skipped`,
  );

/** Splits a list into the entries `valid` accepts and a warning for each other one. */
export function stripInvalid<T>(
  list: readonly unknown[],
  at: RepairAt,
  read: (entry: unknown) => T | undefined,
  reason: string,
): { entries: T[]; issues: PluginIssue[] } {
  const entries: T[] = [];
  const issues: PluginIssue[] = [];
  list.forEach((entry, index) => {
    const found = read(entry);
    if (found === undefined) issues.push(entryDropped(at, index, reason));
    else entries.push(found);
  });
  return { entries, issues };
}
