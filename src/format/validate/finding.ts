import type { Severity } from '../issues.ts';

/**
 * What `claude plugin validate` reports about one file (the oracle of docs/SPEC.md): the file it is
 * about, relative to the folder validated, the place in it (`skills[0]`, `userConfig.key.title`,
 * `frontmatter`), and the message as the official CLI of the same release prints it.
 */
export interface ValidationIssue {
  readonly severity: Severity;
  readonly file: string;
  readonly path: string;
  readonly message: string;
}

export const errorIn = (file: string, path: string, message: string): ValidationIssue => ({
  severity: 'error',
  file,
  path,
  message,
});

export const warningIn = (file: string, path: string, message: string): ValidationIssue => ({
  severity: 'warning',
  file,
  path,
  message,
});

/** A finding before it is attached to a file: what each checker of one file's content returns. */
export interface Finding {
  readonly severity: Severity;
  readonly path: string;
  readonly message: string;
}

export const errorAt = (path: string, message: string): Finding => ({
  severity: 'error',
  path,
  message,
});

export const warningAt = (path: string, message: string): Finding => ({
  severity: 'warning',
  path,
  message,
});

/** Attaches the findings of one file to it. */
export const inFile = (
  file: string,
  findings: readonly Finding[],
  prefix = '',
): ValidationIssue[] =>
  findings.map((found) => ({
    severity: found.severity,
    file,
    path: prefix + found.path,
    message: found.message,
  }));
