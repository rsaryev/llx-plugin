import { warning, type PluginIssue } from '../format/issues.ts';
import type { PolicyKey } from '../protocol/settings-keys.ts';
import type { PolicyScope } from './layers.ts';

/**
 * What a repair knows about the value it reads. `closed` is true for the policy tier (managed and
 * parent settings), where an unreadable value of a restrictive key reads as its restrictive value
 * (managed-settings.md, "Keys that fail closed"); a user, project, local or `--settings` file only
 * loses the value or the entry (settings.md, "Fix a broken settings file").
 */
export interface RepairAt {
  readonly key: PolicyKey;
  readonly scope: PolicyScope;
  readonly closed: boolean;
}

/** The repaired value (`undefined`: the key does not apply) and what was said about it. */
export interface Repaired {
  readonly value: unknown;
  readonly issues: readonly PluginIssue[];
}

export type Repair = (value: unknown, at: RepairAt) => Repaired;

/** `<scope>:<field>`: the source and the field a report names (errors.md: `<source> (<field>)`). */
export const where = (at: RepairAt, field = ''): string => `${at.scope}:${at.key}${field}`;

export const kept = (value: unknown, issues: readonly PluginIssue[] = []): Repaired => ({
  value,
  issues,
});

/** An invalid value that does not apply: dropped with a warning. */
export const dropped = (at: RepairAt, reason: string): Repaired => ({
  value: undefined,
  issues: [warning(where(at), `${reason}; the value is dropped`)],
});

/**
 * An unreadable value of a restrictive key reads as `effect` until fixed; the report says the key
 * "was present but invalid" and names the value it is treated as (managed-settings.md).
 */
export const failedClosed = (at: RepairAt, value: unknown, effect: string): Repaired => ({
  value,
  issues: [warning(where(at), `"${at.key}" was present but invalid; it is treated as ${effect}`)],
});

export const entryDropped = (at: RepairAt, index: number | string, reason: string): PluginIssue =>
  warning(
    where(at, typeof index === 'number' ? `[${index}]` : `.${index}`),
    `${reason}; the entry is dropped`,
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
