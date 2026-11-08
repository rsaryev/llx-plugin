import { PERMISSION_MODES } from '../../protocol/permission-modes.ts';
import { isRecord } from '../record.ts';
import { closedFound, drop, keep, type Check, type Checked, type Found } from './check-support.ts';
import { DISABLE_LOCK, TRUE_LOCK, type LockKind } from './closed-locks.ts';

/**
 * The `permissions` and `autoMode` blocks of a managed source, repaired per field (managed-settings.md,
 * "Keys that fail closed"): "A lock inside one, such as `permissions.disableBypassPermissionsMode`,
 * reads as its restrictive value. An invalid `permissions.defaultMode` reads as `default`. While a
 * `deny` or `ask` list in `permissions` can't be read at all, Claude Code withholds `allow` and
 * `additionalDirectories`... In `autoMode`, a `soft_deny` or `hard_deny` list that can't be read, or
 * that lost an invalid entry, withholds `allow` and `environment` the same way."
 */
const isText = (entry: unknown): entry is string => typeof entry === 'string';
const isMode = (value: unknown): boolean => PERMISSION_MODES.some((mode) => mode === value);

type Block = Readonly<Record<string, unknown>>;

const without = (block: Block, names: readonly string[]): Block =>
  Object.fromEntries(Object.entries(block).filter(([name]) => !names.includes(name)));

/** One report per grant that is set and withheld, naming the list that could not be read. */
function withheldFound(block: string, grants: readonly string[], set: Block, why: string): Found[] {
  return grants
    .filter((grant) => set[grant] !== undefined)
    .map((grant) => ({
      at: `.${grant}`,
      message: `"${block}.${grant}" is withheld: ${why}`,
    }));
}

/**
 * The locks of `permissions` (settings-reference.md, `permissions`; the SDK's `Settings` types each as
 * a restrictive value): `"disable"` for the two mode locks, `true` for the Boolean ones.
 */
const PERMISSION_LOCKS: Readonly<Record<string, LockKind>> = {
  disableBypassPermissionsMode: DISABLE_LOCK,
  disableAutoMode: DISABLE_LOCK,
  blockReadsOutsideWorkingDirectories: TRUE_LOCK,
  blockWritesOutsideWorkingDirectories: TRUE_LOCK,
  denyInsteadOfPrompting: TRUE_LOCK,
};

/** The block with every lock the source wrote repaired, and what was said. */
function repairLocks(raw: Block, block: Block): { fixed: Block; found: Found[] } {
  const fixed: Record<string, unknown> = { ...block };
  const found: Found[] = [];
  for (const [field, lock] of Object.entries(PERMISSION_LOCKS)) {
    const repaired =
      raw[field] === undefined ? undefined : lock(raw[field], `permissions.${field}`, `.${field}`);
    if (repaired === undefined) continue;
    fixed[field] = repaired.value;
    found.push(repaired.found);
  }
  return { fixed, found };
}

/**
 * The block `permissions` after the managed per-field repairs, given what the general check kept of
 * it (`kept`) and the block as the source wrote it (`raw`).
 */
export function failClosedPermissions(raw: Block, kept: Checked): Checked {
  const block: Block = isRecord(kept.value) ? kept.value : {};
  const locked = repairLocks(raw, block);
  const found: Found[] = [...kept.found, ...locked.found];
  const fixed: Record<string, unknown> = { ...locked.fixed };
  const { defaultMode } = raw;
  if (defaultMode !== undefined && !isMode(defaultMode)) {
    fixed.defaultMode = 'default';
    found.push(
      closedFound('permissions.defaultMode', 'it is treated as "default"', '.defaultMode'),
    );
  }
  const unreadable = ['deny', 'ask'].filter(
    (list) => raw[list] !== undefined && !Array.isArray(raw[list]),
  );
  const grants = ['allow', 'additionalDirectories'];
  if (unreadable.length > 0) {
    const why = `${unreadable.map((list) => `"permissions.${list}"`).join(' and ')} could not be read`;
    found.push(...withheldFound('permissions', grants, fixed, why));
  }
  return keep(unreadable.length > 0 ? without(fixed, grants) : fixed, found);
}

const DENY_LISTS = ['soft_deny', 'hard_deny'] as const;

/** What a deny list comes to: unchanged (`undefined`), or the entries that stay (`undefined` inside when it cannot be read) with why. */
function denyListFault(
  list: (typeof DENY_LISTS)[number],
  written: unknown,
): { readonly kept: readonly string[] | undefined; readonly reason: string } | undefined {
  if (written === undefined) return undefined;
  if (!Array.isArray(written)) {
    return { kept: undefined, reason: `"autoMode.${list}" could not be read` };
  }
  const entries = written.filter(isText);
  return entries.length === written.length
    ? undefined
    : { kept: entries, reason: `"autoMode.${list}" lost an invalid entry` };
}

/** `autoMode` in a managed source: a deny list that cannot be read or lost an entry withholds `allow` and `environment`. */
export const autoMode: Check = (value, context) => {
  if (!isRecord(value)) return drop(context.name, 'an object');
  if (!context.closed) return keep(value);
  const faults = DENY_LISTS.flatMap((list) => {
    const fault = denyListFault(list, value[list]);
    return fault === undefined ? [] : [{ list, ...fault }];
  });
  if (faults.length === 0) return keep(value);
  const fixed = Object.fromEntries(
    Object.entries(value).flatMap(([name, entries]): [string, unknown][] => {
      const fault = faults.find((one) => one.list === name);
      if (fault === undefined) return [[name, entries]];
      return fault.kept === undefined ? [] : [[name, fault.kept]];
    }),
  );
  const grants = ['allow', 'environment'];
  const why = faults.map((fault) => fault.reason).join(' and ');
  return keep(without(fixed, grants), withheldFound('autoMode', grants, fixed, why));
};
