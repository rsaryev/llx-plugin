/** hooks.md, "Grep": "`content`, `files_with_matches`, or `count`". The one list of the modes. */
export const GREP_OUTPUT_MODES = ['content', 'files_with_matches', 'count'] as const;
export type GrepOutputMode = (typeof GREP_OUTPUT_MODES)[number];
