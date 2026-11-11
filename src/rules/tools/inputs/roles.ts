import { TOOL_INPUT_FIELDS, type FieldRole, type FieldSpec } from './fields.ts';

const FIELDS_OF_TOOL: ReadonlyMap<string, Readonly<Record<string, FieldSpec>>> = new Map(
  Object.entries(TOOL_INPUT_FIELDS),
);

/** The field a tool's table documents, or `undefined` for any other (a tool or a field without a table). */
const inputFieldOf = (toolName: string, field: string): FieldSpec | undefined => {
  const fields = FIELDS_OF_TOOL.get(toolName);
  return fields !== undefined && Object.hasOwn(fields, field) ? fields[field] : undefined;
};

/**
 * permissions.md ("Match by input parameter"): "You can't match a tool's primary content field this
 * way ... Claude Code ignores it and emits a startup warning." The only role a parameter rule
 * ignores; the others are read as the parameter they are (a structured field never matches).
 */
const IGNORED_IN_PARAMETER_RULE: { readonly [R in FieldRole]: boolean } = {
  primary: true,
  subject: false,
  param: false,
  structured: false,
};

export const isIgnoredInParameterRule = (toolName: string, field: string): boolean => {
  const role = inputFieldOf(toolName, field)?.role;
  return role !== undefined && IGNORED_IN_PARAMETER_RULE[role];
};
