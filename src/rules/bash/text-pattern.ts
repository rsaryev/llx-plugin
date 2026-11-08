import type { PermissionRule, Specifier } from '../types.ts';

/** The command, path or skill text of each specifier form: only a `text` specifier has one. */
const TEXT_OF: { readonly [F in Specifier['form']]: (specifier: Specifier) => string | undefined } =
  {
    param: () => undefined,
    domain: () => undefined,
    text: (specifier) => ('pattern' in specifier ? specifier.pattern : undefined),
  };

/** The pattern a rule matches command text with, or `undefined` for a bare or non-text rule. */
export const textPatternOf = (rule: PermissionRule): string | undefined =>
  rule.specifier === undefined ? undefined : TEXT_OF[rule.specifier.form](rule.specifier);
