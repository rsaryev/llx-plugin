import { isRecord } from '../record.ts';
import { closedFound, drop, keep, type Check, type Checked, type Found } from './check-support.ts';

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

function repairField(name: string, block: string, field: Field) {
  const path = `${block}.${name}`;
  if (field.reads !== undefined) {
    return {
      value: field.reads,
      found: closedFound(path, `it is treated as "${field.reads}"`, `.${name}`),
    };
  }
  return {
    value: undefined,
    found: { at: `.${name}`, message: `"${path}" is invalid; the field is dropped` },
  };
}

/** The block with each invalid field repaired as `fields` says. */
function repairFields(
  block: string,
  value: Readonly<Record<string, unknown>>,
  fields: Readonly<Record<string, Field>>,
  closed: boolean,
): Checked {
  const found: Found[] = [];
  const entries = Object.entries(value).flatMap(([name, one]): [string, unknown][] => {
    const field = fields[name];
    if (field === undefined || field.valid(one)) return [[name, one]];
    const repaired = repairField(name, block, closed ? field : { valid: field.valid });
    found.push(repaired.found);
    return repaired.value === undefined ? [] : [[name, repaired.value]];
  });
  return keep(Object.fromEntries(entries), found);
}

const blockCheck =
  (fields: Readonly<Record<string, Field>>, allowsBoolean: boolean): Check =>
  (value, context) => {
    if (allowsBoolean && typeof value === 'boolean') return keep(value);
    if (!isRecord(value))
      return drop(context.name, allowsBoolean ? 'an object or a boolean' : 'an object');
    const read = repairFields(context.name, value, fields, context.closed);
    if (context.name !== 'worktree' || context.scope === 'user' || value.location === undefined)
      return read;
    const { location: _location, ...kept } = isRecord(read.value) ? read.value : {};
    return keep(kept, [
      ...read.found,
      {
        at: '.location',
        message: '"worktree.location" is not read from this scope; the key is ignored',
      },
    ]);
  };

export const worktree: Check = blockCheck(WORKTREE, false);

/** `attribution` is also `false` ("to hide all attribution") or `true`. */
export const attribution: Check = blockCheck(ATTRIBUTION, true);
