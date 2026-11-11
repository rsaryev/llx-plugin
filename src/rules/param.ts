import type { PermissionBehavior } from '../protocol/official.ts';
import type { NotebookEditInput } from '../protocol/official-tools.ts';
import type { SpecifierSyntax } from './specifier-formats.ts';
import { isIgnoredInParameterRule } from './tools/inputs/roles.ts';
import { wildcardRegExp } from './tool-pattern.ts';
import type { PermissionRule, PreparedCall, Specifier } from './types.ts';

type ParamSpecifier = Extract<Specifier, { readonly form: 'param' }>;

/**
 * The primary content field of each tool, as permissions.md ("Match by input parameter") lists
 * them: a parameter rule on one "would be bypassable by a compound command, so Claude Code ignores
 * it and emits a startup warning". The fields of the tools hooks.md tabulates are the `primary`
 * role of `TOOL_INPUT_FIELDS` (`tools/inputs`), each checked against the SDK's input type; the one
 * tool of the list without a table is `NotebookEdit`, below. `url` is `WebFetch`'s primary field,
 * and a `url` parameter of another tool stays an ordinary parameter.
 */
const PRIMARY_FIELD_WITHOUT_TABLE: ReadonlyMap<string, string> = new Map([
  ['NotebookEdit', 'notebook_path' satisfies keyof NotebookEditInput],
]);

export const isPrimaryField = (toolName: string, field: string): boolean =>
  isIgnoredInParameterRule(toolName, field) || PRIMARY_FIELD_WITHOUT_TABLE.get(toolName) === field;

/**
 * A parameter name: an identifier of two letters or more (`model`, `run_in_background`), or a flag
 * such as Grep's `-i`. A single letter without the dash is not one, so a Windows drive in
 * `Read(C:\Users)` stays a path (spec/judgments.md).
 */
const PARAMETER_NAME = /^(?:-[A-Za-z][A-Za-z0-9_]*|[A-Za-z_][A-Za-z0-9_]+)$/;

/**
 * `name:value` with "whitespace around the colon ignored", or `undefined` when the text does not
 * read as one for a tool that reads its specifier with `syntax`.
 */
export function readParam(content: string, syntax: SpecifierSyntax): ParamSpecifier | undefined {
  const colon = content.indexOf(':');
  if (colon === -1) return undefined;
  const name = content.slice(0, colon).trim();
  const value = content.slice(colon + 1).trim();
  if (!PARAMETER_NAME.test(name)) return undefined;
  if (syntax.parameterNames !== undefined && !syntax.parameterNames.has(name)) return undefined;
  if (syntax.colonStarSuffix && value === '*') return undefined;
  return { form: 'param', name, value };
}

/** A parameter value as the text a rule compares with: scalars only. */
const scalarText = (value: unknown): string | undefined =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : undefined;

/**
 * Whether a call sets the parameter to a value the rule's value matches: a direct field of the
 * input, a scalar, present, and equal to the rule's value where `*` stands for any sequence of
 * characters. The literal input is compared, before any normalisation (permissions.md, "Match by
 * input parameter"); a parameter the call omits never matches.
 */
function matchesParam(specifier: ParamSpecifier, input: unknown): boolean {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return false;
  if (!Object.hasOwn(input, specifier.name)) return false;
  const text = scalarText(Reflect.get(input, specifier.name));
  return text !== undefined && wildcardRegExp(specifier.value).test(text);
}

/** The one parameter of the `Skill` tool: the name Claude calls the skill by. */
const SKILL_PARAMETER = 'skill';

/**
 * Only a deny rule matches a skill under every name it has: "A `Skill(skill:<name>)` deny rule
 * instead matches the skill under any of its names, such as its alias or display name"
 * (permissions.md, "Match by input parameter"; skills.md, "Restrict Claude's skill access").
 */
const MATCHES_EVERY_SKILL_NAME: { readonly [B in PermissionBehavior]: boolean } = {
  allow: false,
  deny: true,
  ask: false,
};

/**
 * Whether a parameter rule covers a call: the literal input field (`matchesParam`) and, for a
 * `Skill(skill:<name>)` deny rule, any name the host reports for the called skill.
 */
export function matchesCallParam(
  rule: PermissionRule,
  specifier: ParamSpecifier,
  call: PreparedCall,
): boolean {
  if (matchesParam(specifier, call.input)) return true;
  if (!MATCHES_EVERY_SKILL_NAME[rule.behavior]) return false;
  if (call.toolName !== 'Skill' || specifier.name !== SKILL_PARAMETER) return false;
  const pattern = wildcardRegExp(specifier.value);
  return (call.skillNames ?? []).some((name) => pattern.test(name));
}
