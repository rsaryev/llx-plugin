import type { PluginIssue } from '../../format/issues.ts';
import {
  kept,
  mustBe,
  note,
  presentButInvalid,
  type Repair,
  type RepairAt,
  type Repaired,
} from '../repair/support.ts';
import { isRecord } from '../../protocol/is-record.ts';

/**
 * The `worktree` and `attribution` blocks of a managed source, repaired per field instead of dropped
 * whole (managed-settings.md, "Keys that fail closed": "Claude Code repairs the `permissions`,
 * `autoMode`, `worktree`, and `attribution` blocks per field"). The docs give no field rule for these
 * two blocks: an invalid field is dropped with a warning and the field takes its default, except
 * `worktree.bgIsolation`, whose default `worktree` is the restrictive value and which reads as it
 * (spec/judgments.md). A field the kit does not know stays as written.
 */
interface Field {
  readonly valid: (value: unknown) => boolean;
  /** The value an invalid field reads as; absent when the field is dropped. */
  readonly reads?: string;
}

const isText = (value: unknown): value is string => typeof value === 'string';
const texts = (value: unknown): boolean => Array.isArray(value) && value.every(isText);
const oneOf =
  (...allowed: readonly string[]) =>
  (value: unknown): boolean =>
    isText(value) && allowed.includes(value);

const WORKTREE: Readonly<Record<string, Field>> = {
  symlinkDirectories: { valid: texts },
  sparsePaths: { valid: texts },
  baseRef: { valid: oneOf('fresh', 'head') },
  bgIsolation: { valid: oneOf('worktree', 'none'), reads: 'worktree' },
  location: { valid: (value) => isText(value) && /^(?:\/|~\/|[A-Za-z]:[\\/])/.test(value) },
};

const ATTRIBUTION: Readonly<Record<string, Field>> = {
  commit: { valid: isText },
  pr: { valid: isText },
  sessionUrl: { valid: (value) => typeof value === 'boolean' },
};

function repairField(at: RepairAt, name: string, field: Field) {
  if (field.reads !== undefined) {
    return {
      value: field.reads,
      issue: presentButInvalid(at, `it is treated as "${field.reads}"`, `.${name}`),
    };
  }
  return {
    value: undefined,
    issue: note(at, `.${name}`, `"${at.key}.${name}" is invalid; the field is dropped`),
  };
}

/** The block with each invalid field repaired as `fields` says. */
function repairFields(
  at: RepairAt,
  value: Readonly<Record<string, unknown>>,
  fields: Readonly<Record<string, Field>>,
): Repaired {
  const issues: PluginIssue[] = [];
  const entries = Object.entries(value).flatMap(([name, one]): [string, unknown][] => {
    const field = fields[name];
    if (field === undefined || field.valid(one)) return [[name, one]];
    const repaired = repairField(at, name, at.closed ? field : { valid: field.valid });
    issues.push(repaired.issue);
    return repaired.value === undefined ? [] : [[name, repaired.value]];
  });
  return kept(Object.fromEntries(entries), issues);
}

const blockCheck =
  (fields: Readonly<Record<string, Field>>, allowsBoolean: boolean): Repair =>
  (value, at) => {
    if (allowsBoolean && typeof value === 'boolean') return kept(value);
    if (!isRecord(value)) return mustBe(at, allowsBoolean ? 'an object or a boolean' : 'an object');
    return repairFields(at, value, fields);
  };

export const worktree: Repair = blockCheck(WORKTREE, false);

/** `attribution` is also `false` ("to hide all attribution") or `true`. */
export const attribution: Repair = blockCheck(ATTRIBUTION, true);
