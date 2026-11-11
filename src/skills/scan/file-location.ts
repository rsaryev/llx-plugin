import { SCOPE_RULES, type ScanScope } from './locations.ts';
import { SKILL_FILE } from './read.ts';

/** A skill folder (`SKILL.md`) or an older command file (skills.md, "Command files"). */
export type ScopeFileKind = 'skill' | 'command';

/** The path below a scope's container of a file of each kind named `name`. */
const BELOW: { readonly [K in ScopeFileKind]: (name: string) => string } = {
  skill: (name) => `${name}/${SKILL_FILE}`,
  // `.claude/commands/<path>.md`: each folder before the file is a part of the name before a `:`.
  command: (name) => `${name.split(':').join('/')}.md`,
};

const CONTAINER = { skill: 'skills', command: 'commands' } as const;

/**
 * Where a skill or command file named `name` of `scope` lives, below `scopeFolder`: the scope's
 * `.claude` folder (for `user`, the configuration directory). The rule the scan reads by
 * (`SCOPE_RULES`; skills.md, "Choose where skills load"): `skills/<name>/SKILL.md` and
 * `commands/<name>.md`. `undefined` when the scope reads no file of that kind: the managed, nested
 * and synced scopes read no commands (a synced skill's folder is claude.ai's: `skills/synced/`).
 */
export function scopeFilePath(
  scope: ScanScope,
  kind: ScopeFileKind,
  scopeFolder: string,
  name: string,
): string | undefined {
  const container = SCOPE_RULES[scope][CONTAINER[kind]];
  return container === undefined
    ? undefined
    : `${scopeFolder}/${container.folder}/${BELOW[kind](name)}`;
}
