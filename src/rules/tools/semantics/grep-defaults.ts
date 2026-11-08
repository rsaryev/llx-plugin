import { GREP_OUTPUT_MODES, type GrepOutputMode } from '../inputs/grep.ts';
import { isRecord } from '../inputs/record.ts';

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

/**
 * tools-reference.md, "Grep tool behavior": "By default, patterns match within a single line.
 * Claude can set `multiline: true`"; the SDK's GrepInput says "Default: false". Only `true` turns
 * it on (spec/judgments.md).
 */
export function effectiveGrepMultiline(input: unknown): boolean {
  return isRecord(input) && input.multiline === true;
}

/** The SDK's GrepInput: `head_limit` "Defaults to 250 when unspecified. Pass 0 for unlimited". */
const DEFAULT_HEAD_LIMIT = 250;

export interface GrepWindowRequest {
  /** "Skip first N lines/entries before applying head_limit"; 0 when absent. */
  readonly offset?: number | undefined;
  /** "Limit output to first N lines/entries"; 250 when absent, 0 for no limit. */
  readonly head_limit?: number | undefined;
}

export interface GrepCount {
  readonly path: string;
  readonly count: number;
}

const wholeOr = (value: number | undefined, fallback: number): number =>
  value !== undefined && Number.isInteger(value) && value >= 0 ? value : fallback;

/** `| tail -n +offset | head -head_limit` over the entries (SDK GrepInput). */
function sliceWindow<T>(entries: readonly T[], request: GrepWindowRequest): readonly T[] {
  const offset = wholeOr(request.offset, 0);
  const limit = wholeOr(request.head_limit, DEFAULT_HEAD_LIMIT);
  return entries.slice(offset, limit === 0 ? undefined : offset + limit);
}

export interface GrepWindow {
  readonly lines: readonly string[];
  /** "No entries at this offset" when the offset is past the last of a pattern that has matches. */
  readonly notice: string | undefined;
}

export const NO_ENTRIES_AT_OFFSET = 'No entries at this offset';

/**
 * The lines Grep returns in `content` mode (tools-reference.md, "Grep tool behavior"): the window
 * `offset` and `head_limit` select. "When the tool's `offset` parameter points past the last match
 * for a pattern that has matches, Grep returns `No entries at this offset`"; a pattern with no
 * match has no such notice (spec/judgments.md).
 */
export function windowGrepContent(
  matches: readonly string[],
  request: GrepWindowRequest,
): GrepWindow {
  const lines = sliceWindow(matches, request);
  const pastEnd = matches.length > 0 && wholeOr(request.offset, 0) >= matches.length;
  return { lines, notice: pastEnd ? NO_ENTRIES_AT_OFFSET : undefined };
}

/** "A total across all matching files" that "covers every match" however the listing is cut. */
export const totalGrepCount = (counts: readonly GrepCount[]): number =>
  counts.reduce((sum, entry) => sum + entry.count, 0);

/** The per-file entries of `count` mode after `offset` and `head_limit`, with the whole total. */
export function windowGrepCounts(
  counts: readonly GrepCount[],
  request: GrepWindowRequest,
): { readonly entries: readonly GrepCount[]; readonly total: number } {
  return { entries: sliceWindow(counts, request), total: totalGrepCount(counts) };
}
