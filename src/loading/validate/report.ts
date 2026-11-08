import type { ValidationIssue } from '../../format/validate/finding.ts';

/** What `validatePlugin` looked at: the folder's marketplace, its plugin, only its components, or nothing it knows. */
export const VALIDATION_TARGETS = ['marketplace', 'plugin', 'components', 'none'] as const;
export type ValidationTarget = (typeof VALIDATION_TARGETS)[number];

export interface ValidationReport {
  readonly target: ValidationTarget;
  /** Every finding, in the order the validator reports them: the manifest, then each file. */
  readonly issues: readonly ValidationIssue[];
}
