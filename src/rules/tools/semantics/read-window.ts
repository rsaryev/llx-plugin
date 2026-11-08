import { error, type PluginIssue } from '../../../format/issues.ts';

export interface ReadRequest {
  /** The line to start at, counting from 1. */
  readonly offset?: number | undefined;
  /** How many lines to read. */
  readonly limit?: number | undefined;
}

export interface NumberedLine {
  readonly number: number;
  readonly text: string;
}

export interface ReadSlice {
  readonly lines: readonly NumberedLine[];
  /** The lines in the whole file, whatever the window. */
  readonly lineCount: number;
  /** The notice that stands in for the lines: an empty file, or an offset past the last line. */
  readonly notice: string | undefined;
  readonly issues: readonly PluginIssue[];
}

/** A line ends at a newline or a carriage return and newline; a final newline starts no line. */
function linesOf(content: string): readonly string[] {
  if (content === '') return [];
  const lines = content.split(/\r?\n/);
  return content.endsWith('\n') ? lines.slice(0, -1) : lines;
}

const isWholeNumber = (value: number): boolean => Number.isInteger(value) && value >= 1;

/** A window value that is not a whole number from 1 is an issue and counts as absent (spec/judgments.md). */
function windowValue(
  value: number | undefined,
  field: string,
): { value: number | undefined; issues: readonly PluginIssue[] } {
  if (value === undefined || isWholeNumber(value)) return { value, issues: [] };
  return {
    value: undefined,
    issues: [error(`tool_input.${field}`, `${field} must be a whole number of 1 or more`)],
  };
}

const plural = (count: number): string => `${count} line${count === 1 ? '' : 's'}`;

/**
 * The window of a file the Read tool returns (tools-reference.md, "Read tool behavior"): the
 * contents "with line numbers", from the line `offset` ("line number to start reading from",
 * counted from 1: spec/judgments.md) for `limit` lines. An empty file and an `offset` past the last
 * line carry a notice instead of lines, the second giving the file's line count; the wording is a
 * judgment. The token and byte limits of large files are measured by the host.
 */
export function readWindow(content: string, request: ReadRequest): ReadSlice {
  const offset = windowValue(request.offset, 'offset');
  const limit = windowValue(request.limit, 'limit');
  const issues = [...offset.issues, ...limit.issues];
  const all = linesOf(content);
  const base = { lineCount: all.length, issues };
  if (all.length === 0) {
    return { ...base, lines: [], notice: 'The file exists but its contents are empty.' };
  }
  const first = offset.value ?? 1;
  if (first > all.length) {
    return {
      ...base,
      lines: [],
      notice: `The offset ${first} is past the last line: the file has ${plural(all.length)}.`,
    };
  }
  const taken = all.slice(
    first - 1,
    limit.value === undefined ? undefined : first - 1 + limit.value,
  );
  return {
    ...base,
    lines: taken.map((text, index) => ({ number: first + index, text })),
    notice: undefined,
  };
}
