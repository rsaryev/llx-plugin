import type { SpecifierMatcher } from '../matchers.ts';
import { RESTRICTS } from '../restricts.ts';
import { BASH_DIALECT } from './dialect.ts';
import { matchShellRule, type Shell } from './shell.ts';
import { matchBashPattern } from './wildcard.ts';
import { spokenForm, type ShellCommand } from './words.ts';
import { formStarts } from './wrappers.ts';

/** The form that starts at word `start`: as written, and with its command name unquoted. */
function writtenForms(command: ShellCommand, start: number): readonly string[] {
  const { text, words } = command;
  const name = words[start];
  if (name === undefined) return [text];
  const from = start === 0 ? 0 : name.start;
  return [text.slice(from), `${text.slice(from, name.start)}${name.value}${text.slice(name.end)}`];
}

/**
 * Each form a subcommand takes once wrappers are stripped, as written and with its command name
 * unquoted (src/rules/bash/unquote.ts): `"rm" x` is `rm x` to a rule. A deny or ask rule also reads
 * the words as the shell passes them, one space apart and without the redirections, so a tab, a line
 * continuation or `>out` in front of the name does not hide the command from it.
 */
const bashForms: Shell['forms'] = (command, behavior, safeEnv) => {
  const starts = formStarts(command.words, behavior, safeEnv);
  const spoken = RESTRICTS[behavior]
    ? starts.map((start) => spokenForm(command.words.slice(start), BASH_DIALECT))
    : [];
  return [...new Set([...starts.flatMap((start) => writtenForms(command, start)), ...spoken])];
};

/** The Bash and Monitor command format: wrappers stripped, patterns compared as written. */
const BASH: Shell = {
  dialect: BASH_DIALECT,
  forms: bashForms,
  pattern: (pattern) => pattern,
  compare: (pattern, form) => matchBashPattern(pattern, form),
  guardsExecWrappers: true,
};

/** `Bash(...)` and `Monitor(...)` rules with a command pattern (tools-reference.md, "Rule format"). */
export const matchBashRule: SpecifierMatcher = (rule, call, ctx) =>
  matchShellRule(BASH, rule, call, ctx);
