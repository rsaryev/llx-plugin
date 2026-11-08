import { isRecord } from '../inputs/record.ts';

/** hooks.md, "Grep": "`content`, `files_with_matches`, or `count`". */
export const GREP_OUTPUT_MODES = ['content', 'files_with_matches', 'count'] as const;
export type GrepOutputMode = (typeof GREP_OUTPUT_MODES)[number];

/** "Defaults to `files_with_matches`"; tools-reference.md: "file paths only, no line content. This is the default." */
const DEFAULT_MODE: GrepOutputMode = 'files_with_matches';

/**
 * The output mode a Grep call runs in. A value that is not one of the three is read as absent here;
 * `parseToolInput` reports it (spec/judgments.md).
 */
export function effectiveGrepOutputMode(input: unknown): GrepOutputMode {
  const mode = isRecord(input) ? input.output_mode : undefined;
  return GREP_OUTPUT_MODES.find((known) => known === mode) ?? DEFAULT_MODE;
}
