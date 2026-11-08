import { z } from 'zod';
import type { ToolOutputSchemas } from '../../protocol/official.ts';
import { optional } from '../input/facts-shared.ts';

/**
 * The output shape of the built-in tools a `PostToolUse` hook may replace (hooks.md, "PostToolUse
 * decision control"): "For built-in tools, a value that doesn't match the tool's output schema is
 * ignored and the original output is used. MCP tool output is passed through without schema
 * validation." Each mirror is bound to the official output type in `sdk-tools.d.ts`.
 *
 * Covered: Bash, Glob, Grep, WebFetch and WebSearch. Judgment (spec/judgments.md): the other
 * built-in tools' output shapes are not mirrored, so a replacement for them is passed through
 * unchecked and the kit does not claim to have validated it.
 */

/** The official output type that has `Fields`, narrowed to the `Keys` the mirror checks. */
type Shape<Fields, Keys extends keyof Extract<ToolOutputSchemas, Fields>> = Pick<
  Extract<ToolOutputSchemas, Fields>,
  Keys
>;

const strings = z.array(z.string());

const BashOutput = z.object({
  stdout: z.string(),
  stderr: z.string(),
  rawOutputPath: optional(z.string()),
  interrupted: z.boolean(),
  isImage: optional(z.boolean()),
}) satisfies z.ZodType<
  Shape<{ stdout: string; interrupted: boolean }, 'stdout' | 'stderr' | 'interrupted'>
>;

const GlobOutput = z.object({
  durationMs: z.number(),
  numFiles: z.number(),
  filenames: strings,
  truncated: z.boolean(),
}) satisfies z.ZodType<
  Shape<
    { filenames: string[]; truncated: boolean },
    'durationMs' | 'numFiles' | 'filenames' | 'truncated'
  >
>;

const GrepOutput = z.object({
  mode: optional(z.enum(['content', 'files_with_matches', 'count'])),
  numFiles: z.number(),
  filenames: strings,
  content: optional(z.string()),
}) satisfies z.ZodType<Shape<{ numFiles: number; filenames: string[] }, 'numFiles' | 'filenames'>>;

const WebFetchOutput = z.object({
  bytes: z.number(),
  code: z.number(),
  codeText: z.string(),
  result: z.string(),
  durationMs: z.number(),
  url: z.string(),
}) satisfies z.ZodType<
  Shape<{ codeText: string }, 'bytes' | 'code' | 'codeText' | 'result' | 'durationMs' | 'url'>
>;

const WebSearchOutput = z.object({
  query: z.string(),
  results: z.array(
    z.union([
      z.string(),
      z.object({
        tool_use_id: z.string(),
        content: z.array(
          z.object({ title: z.string(), url: z.string(), snippet: optional(z.string()) }),
        ),
      }),
    ]),
  ),
  durationSeconds: z.number(),
}) satisfies z.ZodType<
  Shape<{ query: string; durationSeconds: number }, 'query' | 'durationSeconds'>
>;

const MIRRORS: ReadonlyMap<string, z.ZodType> = new Map<string, z.ZodType>([
  ['Bash', BashOutput],
  ['Glob', GlobOutput],
  ['Grep', GrepOutput],
  ['WebFetch', WebFetchOutput],
  ['WebSearch', WebSearchOutput],
]);

/** The tools whose output shape the kit checks. */
export const CHECKED_TOOL_OUTPUTS: readonly string[] = [...MIRRORS.keys()];

/** `mcp__<server>__<tool>`: "MCP tool output is passed through without schema validation". */
export const isMcpToolName = (name: string): boolean => name.startsWith('mcp__');

export type ToolOutputCheck =
  | { readonly accepted: true }
  | { readonly accepted: false; readonly message: string };

/** Whether `value` may replace the output of the built-in tool `toolName`. */
export function checkToolOutput(toolName: string, value: unknown): ToolOutputCheck {
  const mirror = MIRRORS.get(toolName);
  if (mirror === undefined) return { accepted: true };
  const parsed = mirror.safeParse(value);
  if (parsed.success) return { accepted: true };
  const first = parsed.error.issues[0];
  const where = first?.path.join('.') ?? '';
  return {
    accepted: false,
    message: `${where === '' ? '' : `${where}: `}${first?.message ?? 'does not match'}`,
  };
}
