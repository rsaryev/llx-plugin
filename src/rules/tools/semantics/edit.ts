import { error, type PluginIssue } from '../../../format/issues.ts';

/** The `old_string`, `new_string` and `replace_all` of an Edit call (hooks.md, "Edit"). */
export interface EditRequest {
  readonly old_string: string;
  readonly new_string: string;
  readonly replace_all?: boolean | undefined;
}

export interface EditResult {
  /** The file after the edit; the file as it was when `issues` is not empty. */
  readonly content: string;
  readonly replacements: number;
  readonly issues: readonly PluginIssue[];
}

const OLD_STRING = 'tool_input.old_string';

const refused = (content: string, message: string): EditResult => ({
  content,
  replacements: 0,
  issues: [error(OLD_STRING, message)],
});

/**
 * Occurrences of `needle`, left to right and without overlap (spec/judgments.md: the docs say
 * "exactly once" and do not say how `aa` counts in `aaa`).
 */
function occurrences(content: string, needle: string): number {
  let count = 0;
  for (
    let at = content.indexOf(needle);
    at !== -1;
    at = content.indexOf(needle, at + needle.length)
  ) {
    count += 1;
  }
  return count;
}

/**
 * The Edit tool's replacement (tools-reference.md, "Edit tool behavior"): exact string replacement,
 * no regex and no fuzzy matching. `old_string` must be in the file as written (Match) and appear
 * exactly once unless `replace_all` is true (Uniqueness). `new_string` is inserted as plain text,
 * so `$&` stays `$&`. An empty `old_string` has nothing to find and is refused (spec/judgments.md),
 * as are the wordings of the refusals. Reading and writing the file, and the read-before-edit
 * check, are the host's.
 */
export function applyEdit(content: string, request: EditRequest): EditResult {
  const { old_string: find, new_string: replacement, replace_all: all } = request;
  if (find === '') return refused(content, 'old_string is empty: there is no text to find');
  const found = occurrences(content, find);
  if (found === 0) {
    return refused(
      content,
      'old_string was not found in the file: it must appear exactly as written, including whitespace and indentation',
    );
  }
  if (found > 1 && all !== true) {
    return refused(
      content,
      `old_string appears ${found} times in the file: add surrounding context to make it unique, or set replace_all to true`,
    );
  }
  const first = content.indexOf(find);
  const edited =
    all === true
      ? content.split(find).join(replacement)
      : content.slice(0, first) + replacement + content.slice(first + find.length);
  return { content: edited, replacements: all === true ? found : 1, issues: [] };
}
