import { isRecord } from '../../../protocol/is-record.ts';

/** hooks.md ("WebSearch"): `"standard"` requests a lighter search and `"extended"` the full search. */
export const WEB_SEARCH_MODES = ['standard', 'extended'] as const;
export type WebSearchMode = (typeof WEB_SEARCH_MODES)[number];

/** "Some sessions don't send `mode`, and a call without it runs the full search." */
const DEFAULT_MODE: WebSearchMode = 'extended';

/**
 * The search a call runs. A `mode` that is neither of the two is read as absent here;
 * `parseToolInput` reports it.
 */
export function effectiveSearchMode(input: unknown): WebSearchMode {
  const mode = isRecord(input) ? input.mode : undefined;
  return WEB_SEARCH_MODES.find((known) => known === mode) ?? DEFAULT_MODE;
}
