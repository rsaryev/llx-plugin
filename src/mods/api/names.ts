import { MOD_LIMITS, MOD_NAME_PATTERN } from '../../protocol/mods-limits.ts';

/**
 * Whether `name` can name a command, a tool, a subagent type or a pane: letters, digits, `_` and
 * `-`, up to 64 characters (plugins/mods/reference.md, "Limits").
 */
export const isValidModName = (name: unknown): name is string =>
  typeof name === 'string' && MOD_NAME_PATTERN.test(name);

/**
 * Why `name` cannot name a `what` (`command`, `tool`...), or `undefined` when it can. Judgment: the
 * docs give the rule and no message, so the wording is the kit's.
 */
export function nameProblem(what: string, name: unknown): string | undefined {
  if (isValidModName(name)) return undefined;
  return `${what} name ${JSON.stringify(name)} is not valid: use letters, digits, _ and -, up to ${MOD_LIMITS.nameChars} characters`;
}
