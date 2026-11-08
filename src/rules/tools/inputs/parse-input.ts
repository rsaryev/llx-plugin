import type { z } from 'zod';
import { error, type PluginIssue } from '../../../format/issues.ts';
import { INPUT_SCHEMAS } from './schemas.ts';
import { isRecord } from './record.ts';

export interface InputParse {
  /** The input as sent, a copy; `{}` when it was not an object. */
  readonly input: Record<string, unknown>;
  /** Each problem, at `tool_input.<field>` (`tool_input` for the input itself). */
  readonly issues: readonly PluginIssue[];
}

const SCHEMA_OF_TOOL: ReadonlyMap<string, z.ZodType> = new Map(Object.entries(INPUT_SCHEMAS));

const ROOT = 'tool_input';

const issueOf = (found: z.core.$ZodIssue): PluginIssue =>
  error([ROOT, ...found.path.map(String)].join('.'), found.message);

/**
 * Reads a hook's `tool_input` against the table of its tool (hooks.md, "PreToolUse input"): a wrong
 * type or a missing required field is an issue and nothing throws. The input comes back whole, so a
 * hook can still read what the table does not list. A tool without a table (an MCP tool, `Skill`) is
 * returned as it is (spec/judgments.md).
 */
export function parseToolInput(tool: string, raw: unknown): InputParse {
  if (!isRecord(raw)) return { input: {}, issues: [error(ROOT, 'expected an object')] };
  const input = Object.fromEntries(Object.entries(raw));
  const result = SCHEMA_OF_TOOL.get(tool)?.safeParse(input);
  return {
    input,
    issues: result === undefined || result.success ? [] : result.error.issues.map(issueOf),
  };
}
