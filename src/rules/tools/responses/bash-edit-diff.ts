import { z } from 'zod';
import { error, warning, type PluginIssue } from '../../../format/issues.ts';
import { flag, list, num, text } from '../inputs/field-schemas.ts';
import { isRecord } from '../inputs/record.ts';
import { issuesOf, objectOf, RESPONSE_ROOT } from './shape.ts';

/**
 * One entry of `bashEditDiff.files` (hooks.md, "Bash"): the diff of a changed file "for display".
 * `hunks` is shown in the table and its shape is not documented, so it is kept as it came and is
 * not required (spec/judgments.md). The SDK's `BashOutput` has no `bashEditDiff` (the docs name
 * Claude Code v2.1.269), so nothing ties these types to the SDK.
 */
export interface BashEditFile {
  readonly filePath: string;
  readonly hunks?: readonly unknown[] | undefined;
  /** `true` for a file the command added. */
  readonly created?: boolean | undefined;
  /** `true` for a file the command removed. */
  readonly deleted?: boolean | undefined;
}

/** `tool_response.bashEditDiff`: "best effort and in public beta", read field by field. */
export interface BashEditDiff {
  /** Absolute paths of the changed files, at most 200. */
  readonly changedFiles?: readonly string[] | undefined;
  /** Diffs of up to 5 changed files. */
  readonly files?: readonly BashEditFile[] | undefined;
  /** Count of changed files with no diff in `files`. */
  readonly moreFiles?: number | undefined;
  /** The diff is incomplete or could not be taken. */
  readonly unavailable?: boolean | undefined;
  /** A Git command that moves the working tree: no diff was taken. */
  readonly skipped?: boolean | undefined;
  /** Another Bash call ran in the same repository at the same time. */
  readonly shared?: boolean | undefined;
}

export interface BashEditDiffParse {
  /** `undefined` when the call carries no `bashEditDiff` or it could not be read. */
  readonly diff: BashEditDiff | undefined;
  readonly issues: readonly PluginIssue[];
}

/** "at most 200" paths and "up to 5" diffs. */
export const MAX_CHANGED_FILES = 200;
export const MAX_DIFFED_FILES = 5;

const FIELD = `${RESPONSE_ROOT}.bashEditDiff`;

const count = num.refine((value) => Number.isInteger(value) && value >= 0, {
  error: 'expected a whole number from 0',
});

const SCHEMA = objectOf({
  changedFiles: list(text).optional(),
  files: list(
    objectOf({
      filePath: text,
      hunks: list(z.unknown()).optional(),
      created: flag.optional(),
      deleted: flag.optional(),
    }),
  ).optional(),
  moreFiles: count.optional(),
  unavailable: flag.optional(),
  skipped: flag.optional(),
  shared: flag.optional(),
});

/** A POSIX path, a Windows drive path or a UNC path; hooks receive native separators. */
const ABSOLUTE = /^(?:[\\/]|[A-Za-z]:[\\/])/;

const notAbsolute = (paths: readonly string[], at: string): PluginIssue[] =>
  paths.flatMap((path, index) =>
    ABSOLUTE.test(path) ? [] : [warning(`${at}.${index}`, 'is not an absolute path')],
  );

type Check = (diff: BashEditDiff) => readonly PluginIssue[];

/** What the table states as a limit or an invariant; a violation is a warning that keeps the data. */
const CHECKS: readonly Check[] = [
  ({ changedFiles }) =>
    changedFiles !== undefined && changedFiles.length > MAX_CHANGED_FILES
      ? [
          warning(
            `${FIELD}.changedFiles`,
            `lists ${changedFiles.length} paths and the docs allow at most ${MAX_CHANGED_FILES}`,
          ),
        ]
      : [],
  ({ files }) =>
    files !== undefined && files.length > MAX_DIFFED_FILES
      ? [
          warning(
            `${FIELD}.files`,
            `holds ${files.length} diffs and the docs allow at most ${MAX_DIFFED_FILES}`,
          ),
        ]
      : [],
  ({ changedFiles, files = [], moreFiles = 0 }) =>
    changedFiles === undefined && (files.length > 0 || moreFiles > 0)
      ? [
          warning(
            `${FIELD}.changedFiles`,
            'is missing, it is present whenever files holds a diff or moreFiles is above zero',
          ),
        ]
      : [],
  ({ changedFiles = [], files = [] }) => [
    ...notAbsolute(changedFiles, `${FIELD}.changedFiles`),
    ...files.flatMap((file, index) =>
      notAbsolute([file.filePath], `${FIELD}.files.${index}`).map((found) => ({
        ...found,
        path: `${FIELD}.files.${index}.filePath`,
      })),
    ),
  ],
  ({ files = [] }) =>
    files.flatMap((file, index) =>
      file.created === true && file.deleted === true
        ? [warning(`${FIELD}.files.${index}`, 'is marked both created and deleted')]
        : [],
    ),
  ({ skipped, files = [] }) =>
    skipped === true && files.length > 0
      ? [
          warning(
            `${FIELD}.skipped`,
            'is set, so Claude Code takes no diff and files should be empty',
          ),
        ]
      : [],
];

/**
 * Reads `tool_response.bashEditDiff` of a Bash PostToolUse call (hooks.md, "Bash"): "the changed
 * files". A call without the field has no diff (background and read-only commands carry none, and
 * recording may be off); a wrong type is an error issue and nothing throws; a broken limit is a
 * warning and the data is kept whole.
 */
export function parseBashEditDiff(toolResponse: unknown): BashEditDiffParse {
  if (!isRecord(toolResponse)) {
    return { diff: undefined, issues: [error(RESPONSE_ROOT, 'expected an object')] };
  }
  const { bashEditDiff } = toolResponse;
  if (bashEditDiff === undefined) return { diff: undefined, issues: [] };
  const parsed = SCHEMA.safeParse(bashEditDiff);
  if (!parsed.success) return { diff: undefined, issues: issuesOf(FIELD, parsed.error) };
  return { diff: parsed.data, issues: CHECKS.flatMap((check) => check(parsed.data)) };
}

/** How far a list can be relied on: "how complete and how reliable that list is". */
export interface BashEditDiffTrust {
  /** `false` when the diff is incomplete or could not be taken (`unavailable`), or was not taken (`skipped`). */
  readonly complete: boolean;
  /** `false` when another Bash call ran in the repository meanwhile, so some changes may be its (`shared`). */
  readonly attributable: boolean;
}

/** The two flags that say a list is incomplete and the one that says it may hold another command's changes. */
export function bashEditDiffTrust(
  diff: Pick<BashEditDiff, 'unavailable' | 'skipped' | 'shared'>,
): BashEditDiffTrust {
  return {
    complete: diff.unavailable !== true && diff.skipped !== true,
    attributable: diff.shared !== true,
  };
}
