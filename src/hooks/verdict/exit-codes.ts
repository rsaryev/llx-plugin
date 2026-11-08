/**
 * The table of "Exit code output" (hooks.md): what a hook's stdout and its exit code come to
 * together. The rows are the kinds of stdout, the columns the exit codes; each cell is what the
 * doc says, as data.
 */

export type ExitClass = 'zero' | 'two' | 'other';

/** "JSON object that passes schema validation", "JSON that can't be parsed or fails schema validation", "Plain text, or nothing". */
export type StdoutClass = 'json-valid' | 'json-invalid' | 'plain';

export const exitClassOf = (exitCode: number): ExitClass =>
  exitCode === 0 ? 'zero' : exitCode === 2 ? 'two' : 'other';

export type Result =
  /** "Success". */
  | 'success'
  /** "Blocking error". */
  | 'blocking'
  /** "Non-blocking error". */
  | 'non-blocking-error';

/** Whether the JSON fields count. */
export type Fields =
  /** "The fields apply". */
  | 'apply'
  /** "Claude Code still reads the fields, but they can't override the block". */
  | 'read-no-override'
  /** "Claude Code ignores the exit code, and the fields alone decide". */
  | 'decide-alone'
  | 'none';

/** What the message of the outcome is made of. */
export type MessageFrom =
  /** "Your stderr is the reason". */
  | 'stderr'
  /** "The notice carries the parse or validation message". */
  | 'validation'
  /** "The notice carries the first line of your stderr". */
  | 'first-stderr-line'
  | 'none';

export interface Cell {
  readonly result: Result;
  readonly fields: Fields;
  readonly message: MessageFrom;
  /**
   * For a hook "whose failure blocks the action": the run counts as a failure. Doc: "Success. Claude
   * Code ignores the exit code ... For hooks whose failure blocks the action, the run counts as a
   * failure instead"; and "Plain-text stdout from a command hook isn't a failure" (exit 0).
   */
  readonly failure: boolean;
}

const cell = (
  result: Result,
  fields: Fields,
  message: MessageFrom,
  failure = result === 'non-blocking-error',
): Cell => ({ result, fields, message, failure });

export const EXIT_TABLE: {
  readonly [X in ExitClass]: { readonly [S in StdoutClass]: Cell };
} = {
  zero: {
    'json-valid': cell('success', 'apply', 'none'),
    'json-invalid': cell('non-blocking-error', 'none', 'validation'),
    plain: cell('success', 'none', 'none'),
  },
  two: {
    'json-valid': cell('blocking', 'read-no-override', 'stderr'),
    'json-invalid': cell('blocking', 'none', 'stderr'),
    plain: cell('blocking', 'none', 'stderr'),
  },
  other: {
    'json-valid': cell('success', 'decide-alone', 'none', true),
    'json-invalid': cell('non-blocking-error', 'none', 'validation'),
    plain: cell('non-blocking-error', 'none', 'first-stderr-line'),
  },
};
