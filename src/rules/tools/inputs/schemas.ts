import { z } from 'zod';
import { TOOL_INPUT_FIELDS, type InputToolName } from './fields.ts';

/** The zod object of a tool's table: its fields as documented, any other field passed through. */
const schemaOf = (fields: Readonly<Record<string, { readonly schema: z.ZodType }>>): z.ZodType =>
  z.looseObject(
    Object.fromEntries(Object.entries(fields).map(([name, { schema }]) => [name, schema])),
  );

/**
 * One schema per tool of hooks.md ("PreToolUse input"). A field the table does not list passes
 * through: the SDK's input types carry fields the table leaves out (spec/judgments.md).
 */
export const INPUT_SCHEMAS: { readonly [T in InputToolName]: z.ZodType } = {
  Bash: schemaOf(TOOL_INPUT_FIELDS.Bash),
  PowerShell: schemaOf(TOOL_INPUT_FIELDS.PowerShell),
  Write: schemaOf(TOOL_INPUT_FIELDS.Write),
  Edit: schemaOf(TOOL_INPUT_FIELDS.Edit),
  Read: schemaOf(TOOL_INPUT_FIELDS.Read),
  Glob: schemaOf(TOOL_INPUT_FIELDS.Glob),
  Grep: schemaOf(TOOL_INPUT_FIELDS.Grep),
  WebFetch: schemaOf(TOOL_INPUT_FIELDS.WebFetch),
  WebSearch: schemaOf(TOOL_INPUT_FIELDS.WebSearch),
  Agent: schemaOf(TOOL_INPUT_FIELDS.Agent),
  AskUserQuestion: schemaOf(TOOL_INPUT_FIELDS.AskUserQuestion),
  ExitPlanMode: schemaOf(TOOL_INPUT_FIELDS.ExitPlanMode),
};
