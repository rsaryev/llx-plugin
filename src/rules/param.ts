import type { SpecifierSyntax } from './specifier-formats.ts';
import { wildcardRegExp } from './tool-pattern.ts';
import type { Specifier } from './types.ts';

type ParamSpecifier = Extract<Specifier, { readonly form: 'param' }>;

/**
 * The primary content field of each tool: a parameter rule on one "would be bypassable by a
 * compound command, so Claude Code ignores it and emits a startup warning" (permissions.md,
 * "Match by input parameter").
 */
const PRIMARY_FIELDS: ReadonlySet<string> = new Set([
  'command',
  'file_path',
  'path',
  'notebook_path',
  'url',
]);

export const isPrimaryField = (name: string): boolean => PRIMARY_FIELDS.has(name);

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
export function matchesParam(specifier: ParamSpecifier, input: unknown): boolean {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return false;
  if (!Object.hasOwn(input, specifier.name)) return false;
  const text = scalarText(Reflect.get(input, specifier.name));
  return text !== undefined && wildcardRegExp(specifier.value).test(text);
}
