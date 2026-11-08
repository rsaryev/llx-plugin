import {
  splitRule,
  invalidRuleMessage,
  MALFORMED_RULE,
} from '../../format/permission-rule-shape.ts';
import { warning, type PluginIssue } from '../../format/issues.ts';
import { normalizePermissionMode } from '../../protocol/permission-modes.ts';
import { isRecord } from '../record.ts';
import {
  dropped,
  failedClosed,
  kept,
  where,
  type Repair,
  type RepairAt,
  type Repaired,
} from '../repair-support.ts';

/**
 * Reading the `permissions` block of one settings source. Claude Code "repairs the `permissions`
 * ... blocks per field instead of dropping them whole" (managed-settings.md, "Keys that fail
 * closed"): in the policy tier a lock inside one reads as its restrictive value, an invalid
 * `defaultMode` reads as `default`, and while a `deny` or `ask` list cannot be read at all `allow`
 * and `additionalDirectories` are withheld. Any other source loses the value or the entry
 * (settings.md, "Fix a broken settings file").
 */

type FieldRead = (raw: unknown, at: RepairAt, field: string) => Repaired;

const fieldAt = (at: RepairAt, field: string): string => where(at, `.${field}`);

const readText = (entry: unknown): string | undefined =>
  typeof entry === 'string' ? entry : undefined;

/** A list of texts (rules, directories): an entry that is no text is dropped, a non-list is unreadable. */
const textList: FieldRead = (raw, at, field) => {
  if (!Array.isArray(raw)) {
    return {
      value: undefined,
      issues: [warning(fieldAt(at, field), `"permissions.${field}" must be a list; it is dropped`)],
    };
  }
  const entries: string[] = [];
  const issues: PluginIssue[] = [];
  raw.forEach((entry, index) => {
    const text = readText(entry);
    if (text === undefined) {
      issues.push(
        warning(where(at, `.${field}[${index}]`), 'Expected a text; the entry is dropped'),
      );
    } else entries.push(text);
  });
  return kept(entries, issues);
};

/** Rules are syntax-checked before any source can grant or restrict tools. */
const ruleList: FieldRead = (raw, at, field) => {
  if (!Array.isArray(raw)) return textList(raw, at, field);
  const entries: string[] = [];
  const issues: PluginIssue[] = [];
  raw.forEach((entry, index) => {
    if (typeof entry === 'string' && splitRule(entry) !== undefined) {
      entries.push(entry);
      return;
    }
    const message =
      typeof entry === 'string'
        ? invalidRuleMessage(entry, MALFORMED_RULE)
        : 'A permission rule must be a string; the rule is skipped';
    issues.push(warning(where(at, `.${field}[${index}]`), message));
  });
  return kept(entries, issues);
};

/** The value of a lock key: the string `disable`. Unreadable in the policy tier it reads as `disable`. */
const lockValue = (raw: unknown, at: RepairAt, label: string): Repaired => {
  if (raw === 'disable') return kept('disable');
  if (at.closed) {
    return {
      value: 'disable',
      issues: [
        warning(
          fieldAt(at, label),
          `"${label}" was present but invalid; it is treated as "disable"`,
        ),
      ],
    };
  }
  return {
    value: undefined,
    issues: [warning(fieldAt(at, label), `"${label}" must be "disable"; the value is dropped`)],
  };
};

const lockField: FieldRead = (raw, at, field) => {
  const read = lockValue(raw, at, field);
  return {
    ...read,
    issues: read.issues.map((issue) => ({
      ...issue,
      message: issue.message.replaceAll(`"${field}"`, `"permissions.${field}"`),
    })),
  };
};

/** `"true"` or `"false"` as text reads as that Boolean in the policy tier, with a notice. */
export const flagValue = (raw: unknown, at: RepairAt, label: string, restrictive: boolean) => {
  if (typeof raw === 'boolean') return kept(raw);
  if (!at.closed) {
    return {
      value: undefined,
      issues: [warning(fieldAt(at, label), `"${label}" must be true or false; it is dropped`)],
    };
  }
  if (raw === 'true' || raw === 'false') {
    return {
      value: raw === 'true',
      issues: [warning(fieldAt(at, label), `"${label}" is the text "${raw}": drop the quotes`)],
    };
  }
  return {
    value: restrictive,
    issues: [
      warning(
        fieldAt(at, label),
        `"${label}" was present but invalid; it is treated as ${restrictive}`,
      ),
    ],
  };
};

const blockFlag: FieldRead = (raw, at, field) => {
  const read = flagValue(raw, at, field, true);
  return {
    ...read,
    issues: read.issues.map((issue) => ({
      ...issue,
      message: issue.message.replaceAll(`"${field}"`, `"permissions.${field}"`),
    })),
  };
};

/** `defaultMode`: a mode or the alias `manual` (read as `default`); invalid, the policy tier reads `default`. */
const modeField: FieldRead = (raw, at, field) => {
  const mode = typeof raw === 'string' ? normalizePermissionMode(raw) : undefined;
  if (mode !== undefined) return kept(mode);
  if (at.closed) {
    return {
      value: 'default',
      issues: [
        warning(
          fieldAt(at, field),
          `"permissions.${field}" was present but invalid; it is treated as "default"`,
        ),
      ],
    };
  }
  return {
    value: undefined,
    issues: [warning(fieldAt(at, field), `"permissions.${field}" is not a mode; it is dropped`)],
  };
};

const FIELDS: Readonly<Record<string, FieldRead>> = {
  allow: ruleList,
  ask: ruleList,
  deny: ruleList,
  additionalDirectories: textList,
  defaultMode: modeField,
  disableBypassPermissionsMode: lockField,
  disableAutoMode: lockField,
  denyInsteadOfPrompting: blockFlag,
  blockReadsOutsideWorkingDirectories: blockFlag,
  blockWritesOutsideWorkingDirectories: blockFlag,
};

/** The restrictions whose loss withholds the grants written beside them. */
const RESTRICTIONS = ['deny', 'ask'] as const;
/** The grants withheld while a restriction cannot be read. */
const GRANTS = ['allow', 'additionalDirectories'] as const;

/** One field of the block: its repaired value, or the value as written for a field the kit does not know. */
function readField(name: string, raw: unknown, at: RepairAt): Repaired {
  const read = FIELDS[name];
  return read === undefined ? kept(raw) : read(raw, at, name);
}

function withheld(
  fields: Record<string, unknown>,
  unreadable: readonly string[],
  at: RepairAt,
): PluginIssue[] {
  if (!at.closed || unreadable.length === 0) return [];
  const names = unreadable.map((name) => `"permissions.${name}"`).join(' and ');
  return GRANTS.flatMap((grant) => {
    if (fields[grant] === undefined) return [];
    delete fields[grant];
    return [
      warning(
        fieldAt(at, grant),
        `"permissions.${grant}" is withheld: ${names} could not be read, so grants never apply without the restrictions written beside them`,
      ),
    ];
  });
}

/** `permissions` of one source, repaired per field. */
export const permissionsBlock: Repair = (value, at) => {
  if (!isRecord(value)) {
    // "The block is also on while Claude Code can't read the `permissions` object in your managed settings."
    return at.closed
      ? failedClosed(
          at,
          { blockWritesOutsideWorkingDirectories: true },
          'a block with "blockWritesOutsideWorkingDirectories" on',
        )
      : dropped(at, `"${at.key}" must be an object`);
  }
  const fields: Record<string, unknown> = {};
  const issues: PluginIssue[] = [];
  const unreadable: string[] = [];
  for (const [name, raw] of Object.entries(value)) {
    if (raw === null) continue;
    const read = readField(name, raw, at);
    issues.push(...read.issues);
    if (read.value !== undefined) fields[name] = read.value;
    else if (RESTRICTIONS.some((each) => each === name)) unreadable.push(name);
  }
  issues.push(...withheld(fields, unreadable, at));
  return kept(fields, issues);
};

/** `disableAutoMode` at the top level of a file. */
export const disableValue: Repair = (value, at) => lockValue(value, at, at.key);
