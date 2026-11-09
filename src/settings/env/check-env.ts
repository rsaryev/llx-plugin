import { SCOPE_LABEL } from '../broken-file.ts';
import { drop, keep, type Check, type Found } from '../general/check-support.ts';
import type { PolicyScope } from '../layers.ts';
import { isRecord } from '../record.ts';
import { ignoredBecause } from './ignored-variables.ts';

/**
 * What a file may hold under `env` (settings-reference.md, `env`: "object mapping variable names to
 * string values"; "Variables Claude Code ignores in `env`"): the variables Claude Code drops from the
 * file's scope are removed, named and never with their value, and so is an entry whose name no
 * process could carry. A value that is not a string is read as JavaScript's `String(value)`, as
 * claude 2.1.321 sets it (`1` is "1", `true` "true", `null` "null", `[1,2]` "1,2"), and is reported
 * so the author sees it (spec/judgments.md).
 */
const hasPossibleName = (name: string): boolean => name !== '' && !/[=\0]/.test(name);

const NO_FILE_REASONS: readonly (string | undefined)[] = ['identity', 'launch-only'];

/** The value as the process gets it: claude sets `String(value)` (oracle 2.1.321). */
const asText = (value: unknown): string => (typeof value === 'string' ? value : String(value));

function problem(scope: PolicyScope, name: string, value: string): string | undefined {
  if (!hasPossibleName(name)) return `"${name}" cannot be the name of an environment variable`;
  const reason = ignoredBecause(scope, name, value);
  if (reason === undefined) return undefined;
  const who = NO_FILE_REASONS.includes(reason)
    ? 'no settings file can set it'
    : 'a checked-out repository cannot set it';
  return `"${name}" is ignored from ${SCOPE_LABEL[scope]}: ${who}`;
}

const coerced = (name: string, value: unknown): Found[] =>
  typeof value === 'string'
    ? []
    : [{ at: `.${name}`, message: `"${name}" is not a string; it is read as "${asText(value)}"` }];

/** `env`: the entries Claude Code ignores or cannot read are removed, each reported by name. */
export const env: Check = (value, context) => {
  if (!isRecord(value)) return drop(context.name, 'an object');
  const found: Found[] = [];
  const kept = Object.entries(value).flatMap(([name, one]): [string, string][] => {
    const text = asText(one);
    const message = problem(context.scope, name, text);
    if (message !== undefined) found.push({ at: `.${name}`, message });
    else found.push(...coerced(name, one));
    return message === undefined ? [[name, text]] : [];
  });
  return keep(Object.fromEntries(kept), found);
};
