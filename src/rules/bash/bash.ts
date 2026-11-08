import type { SpecifierMatcher } from '../matchers.ts';
import { BASH_DIALECT } from './dialect.ts';
import { matchShellRule, type Shell } from './shell.ts';
import { matchBashPattern } from './wildcard.ts';
import { strippedForms } from './wrappers.ts';

/** The Bash and Monitor command format: wrappers stripped, patterns compared as written. */
const BASH: Shell = {
  dialect: BASH_DIALECT,
  forms: strippedForms,
  pattern: (pattern) => pattern,
  compare: (pattern, form) => matchBashPattern(pattern, form),
  guardsExecWrappers: true,
};

/** `Bash(...)` and `Monitor(...)` rules with a command pattern (tools-reference.md, "Rule format"). */
export const matchBashRule: SpecifierMatcher = (rule, call, ctx) =>
  matchShellRule(BASH, rule, call, ctx);
