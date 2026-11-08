import { closedFound, type Found } from './check-support.ts';

/**
 * The locks a managed source can write with a value Claude Code cannot read (managed-settings.md,
 * "Keys that fail closed"): a key with one restrictive value reads as it, and "the string "true" or
 * "false" reads as that Boolean, with a notice asking you to drop the quotes". One function applies
 * every lock; what differs per key is its kind.
 */
export interface Fixed {
  readonly value: unknown;
  readonly found: Found;
}

/** A lock's reading of its value: `undefined` when the value is readable as written. */
export type LockKind = (value: unknown, name: string, at: string) => Fixed | undefined;

/** The text `"true"` or `"false"` stands for that Boolean, with the notice. */
function quotedBoolean(value: unknown, name: string, at: string): Fixed | undefined {
  if (value !== 'true' && value !== 'false') return undefined;
  return {
    value: value === 'true',
    found: { at, message: `"${name}" is the text "${value}": drop the quotes` },
  };
}

/** A Boolean whose restrictive value is `restrictive`: any value that cannot be read reads as it. */
const booleanLock =
  (restrictive: boolean): LockKind =>
  (value, name, at) =>
    typeof value === 'boolean'
      ? undefined
      : (quotedBoolean(value, name, at) ?? {
          value: restrictive,
          found: closedFound(name, `it is treated as ${restrictive}`, at),
        });

/** `true` restricts (`permissions.blockReadsOutsideWorkingDirectories`, `denyInsteadOfPrompting`...). */
export const TRUE_LOCK: LockKind = booleanLock(true);

/** `false` restricts (`skipDangerousModePermissionPrompt`: the dialog stays; spec/judgments.md). */
export const FALSE_LOCK: LockKind = booleanLock(false);

/** The one value `"disable"` restricts (`disableAutoMode`, `permissions.disableBypassPermissionsMode`): any other value reads as it. */
export const DISABLE_LOCK: LockKind = (value, name, at) =>
  value === 'disable'
    ? undefined
    : { value: 'disable', found: closedFound(name, 'it is treated as "disable"', at) };
