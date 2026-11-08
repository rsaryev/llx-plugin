import { SCOPE_LABEL } from '../broken-file.ts';
import { drop, keep, type Check, type Found } from '../general/check-support.ts';
import type { PolicyScope } from '../layers.ts';
import { isRecord } from '../record.ts';
import { ignoredBecause } from './ignored-variables.ts';

/**
 * What a file may hold under `env` (settings-reference.md, `env`: "object mapping variable names to
 * string values"; "Variables Claude Code ignores in `env`"): the variables Claude Code drops from the
 * file's scope are removed, named and never with their value, and so is an entry whose value is not
 * a string or whose name no process could carry (spec/judgments.md).
 */
const hasPossibleName = (name: string): boolean => name !== '' && !/[=\0]/.test(name);

const NO_FILE_REASONS: readonly (string | undefined)[] = ['identity', 'launch-only'];

function problem(scope: PolicyScope, name: string, value: unknown): string | undefined {
  if (!hasPossibleName(name)) return `"${name}" cannot be the name of an environment variable`;
  if (typeof value !== 'string') return `"${name}" must be a string; the variable is skipped`;
  const reason = ignoredBecause(scope, name, value);
  if (reason === undefined) return undefined;
  const who = NO_FILE_REASONS.includes(reason)
    ? 'no settings file can set it'
    : 'a checked-out repository cannot set it';
  return `"${name}" is ignored from ${SCOPE_LABEL[scope]}: ${who}`;
}

/** `env`: the entries Claude Code ignores or cannot read are removed, each reported by name. */
export const env: Check = (value, context) => {
  if (!isRecord(value)) return drop(context.name, 'an object');
  const found: Found[] = [];
  const kept = Object.entries(value).filter(([name, one]) => {
    const message = problem(context.scope, name, one);
    if (message !== undefined) found.push({ at: `.${name}`, message });
    return message === undefined;
  });
  return keep(Object.fromEntries(kept), found);
};
