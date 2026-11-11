import { SCOPE_LABEL } from '../broken-file.ts';
import type { PluginIssue } from '../../format/issues.ts';
import { kept, mustBe, note, type Repair, type RepairAt } from '../repair/support.ts';
import type { PolicyScope } from '../layers.ts';
import { envText, ignoredBecause } from './ignored-variables.ts';
import { isRecord } from '../../protocol/is-record.ts';

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

function problem(scope: PolicyScope, name: string, value: string): string | undefined {
  if (!hasPossibleName(name)) return `"${name}" cannot be the name of an environment variable`;
  const reason = ignoredBecause(scope, name, value);
  if (reason === undefined) return undefined;
  const who = NO_FILE_REASONS.includes(reason)
    ? 'no settings file can set it'
    : 'a checked-out repository cannot set it';
  return `"${name}" is ignored from ${SCOPE_LABEL[scope]}: ${who}`;
}

const coerced = (at: RepairAt, name: string, value: unknown): PluginIssue[] =>
  typeof value === 'string'
    ? []
    : [note(at, `.${name}`, `"${name}" is not a string; it is read as "${envText(value)}"`)];

/** `env`: the entries Claude Code ignores or cannot read are removed, each reported by name. */
export const env: Repair = (value, at) => {
  if (!isRecord(value)) return mustBe(at, 'an object');
  const issues: PluginIssue[] = [];
  const entries = Object.entries(value).flatMap(([name, one]): [string, string][] => {
    const text = envText(one);
    const message = problem(at.scope, name, text);
    if (message !== undefined) issues.push(note(at, `.${name}`, message));
    else issues.push(...coerced(at, name, one));
    return message === undefined ? [[name, text]] : [];
  });
  return kept(Object.fromEntries(entries), issues);
};
