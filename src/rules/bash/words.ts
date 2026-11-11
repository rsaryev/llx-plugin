import { BASH_DIALECT, type ShellDialect } from './dialect.ts';
import { isBlank, newScan, skipUnit } from './scanner.ts';
import { readWord, type WordValue } from './unquote.ts';

/**
 * The words and redirections of one command (bash(1), "SHELL GRAMMAR" and "REDIRECTION"). An
 * unquoted `<` or `>` ends a word wherever it stands, so `echo x>/etc/x` is `echo x` writing
 * `/etc/x`; a descriptor number or `{name}` written right before the operator is part of it.
 */

/** A word or a redirection operator of a command, with where it starts and ends in the command. */
export interface Word {
  readonly text: string;
  readonly start: number;
  readonly end: number;
  /** A redirection operator (`>`, `2>&`, `<<`), whose target is the next word. */
  readonly operator: boolean;
}

/** A word of the command as written and as the shell reads it. */
export interface ShellWord extends Word, WordValue {}

/**
 * What a redirection does with its target: writes it, reads it, both (`<>`), names a descriptor
 * (`2>&1`, `<&-`), or holds text (a here-document or here-string).
 */
export type RedirectKind = 'output' | 'input' | 'both' | 'descriptor' | 'here';

export interface Redirect {
  /** The operator as written, its descriptor included (`2>`, `{fd}>`, `&>>`). */
  readonly operator: string;
  readonly kind: RedirectKind;
  /** The word after the operator; `undefined` when none follows, which the shell rejects. */
  readonly target: ShellWord | undefined;
}

/** One command: its words with every redirection taken out, and the redirections. */
export interface ShellCommand {
  readonly text: string;
  readonly words: readonly ShellWord[];
  readonly redirects: readonly Redirect[];
}

/** The operators, longest first; `<(` and `>(` open a process substitution instead. */
const OPERATOR = /&>>|&>|<<<|<<-|<<|<>|<&|>&|>>|>\||<(?!\()|>(?!\()/y;
const DESCRIPTOR_PREFIX = /^(?:\d+|\{[A-Za-z_][A-Za-z0-9_]*\})$/;
const DESCRIPTOR_TARGET = /^(?:\d+-?|-)$/;

function operatorAt(command: string, at: number): string | undefined {
  OPERATOR.lastIndex = at;
  return OPERATOR.exec(command)?.[0];
}

/** Only line continuations: the shell reads nothing there. */
const isContinuation = (text: string, dialect: ShellDialect): boolean =>
  text.replaceAll(`${dialect.escape}\n`, '') === '';

interface Lexer {
  readonly command: string;
  readonly dialect: ShellDialect;
  readonly words: Word[];
  /** Where the word being read starts, or -1 between words. */
  start: number;
}

/** Ends the word being read at `end`; a word of only line continuations is no word. */
function close(lexer: Lexer, end: number): void {
  const { start } = lexer;
  const text = lexer.command.slice(start, end);
  if (start >= 0 && !isContinuation(text, lexer.dialect)) {
    lexer.words.push({ text, start, end, operator: false });
  }
  lexer.start = -1;
}

/** An operator at `at`, its descriptor prefix (`2`, `{fd}`) taken from the word before it. */
function pushOperator(lexer: Lexer, at: number, operator: string): number {
  const { command, start } = lexer;
  const prefixed = start >= 0 && DESCRIPTOR_PREFIX.test(command.slice(start, at));
  const from = prefixed ? start : at;
  if (!prefixed) close(lexer, at);
  const end = at + operator.length;
  lexer.words.push({ text: command.slice(from, end), start: from, end, operator: true });
  lexer.start = -1;
  return end;
}

/** The words and operators of one command, quoted and nested parts kept whole. */
export function wordsOf(command: string, dialect: ShellDialect = BASH_DIALECT): readonly Word[] {
  const scan = newScan(command, dialect, 0);
  const lexer: Lexer = { command, dialect, words: [], start: -1 };
  while (scan.pos < command.length) {
    const at = scan.pos;
    const blank = isBlank(command[at]);
    const operator = blank ? undefined : operatorAt(command, at);
    if (operator !== undefined) scan.pos = pushOperator(lexer, at, operator);
    else if (blank) {
      close(lexer, at);
      scan.pos += 1;
    } else {
      if (lexer.start < 0) lexer.start = at;
      skipUnit(scan);
    }
  }
  close(lexer, Math.min(scan.pos, command.length));
  return lexer.words;
}

/** What each operator does with its target, the descriptor prefix left out. */
const KINDS: { readonly [operator: string]: (target: string) => RedirectKind } = {
  '>': () => 'output',
  '>>': () => 'output',
  '>|': () => 'output',
  '&>': () => 'output',
  '&>>': () => 'output',
  '<': () => 'input',
  '<>': () => 'both',
  '>&': (target) => (DESCRIPTOR_TARGET.test(target) ? 'descriptor' : 'output'),
  '<&': (target) => (DESCRIPTOR_TARGET.test(target) ? 'descriptor' : 'input'),
  '<<': () => 'here',
  '<<-': () => 'here',
  '<<<': () => 'here',
};

const kindOf = (operator: string, target: ShellWord | undefined): RedirectKind => {
  const bare = operator.replace(/^(?:\d+|\{[^}]*\})/, '');
  const kind = Object.hasOwn(KINDS, bare) ? KINDS[bare] : undefined;
  return kind?.(target?.value ?? '') ?? 'output';
};

const shellWord = (word: Word, dialect: ShellDialect): ShellWord => ({
  ...word,
  ...readWord(word.text, dialect),
});

/** One command read into its words and redirections. */
export function readCommand(text: string, dialect: ShellDialect = BASH_DIALECT): ShellCommand {
  const tokens = wordsOf(text, dialect);
  const words: ShellWord[] = [];
  const redirects: Redirect[] = [];
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token === undefined) continue;
    if (!token.operator) {
      words.push(shellWord(token, dialect));
      continue;
    }
    const next = tokens[index + 1];
    const target = next === undefined || next.operator ? undefined : shellWord(next, dialect);
    if (target !== undefined) index += 1;
    redirects.push({ operator: token.text, kind: kindOf(token.text, target), target });
  }
  return { text, words, redirects };
}

/**
 * A word as the shell passes it and as written. A Windows path is read both ways: its `\` is a
 * separator to the program though Bash reads it as an escape (`C:\Windows`, `\\server\share`).
 */
export const spellingsOf = (word: ShellWord): readonly string[] =>
  word.text === word.value ? [word.value] : [word.value, word.text];

/** The command's words as a rule reads them: the name unquoted, one space apart, continuations cut. */
export function spokenForm(words: readonly ShellWord[], dialect: ShellDialect): string {
  const [name, ...rest] = words;
  if (name === undefined) return '';
  const args = rest.map((word) => word.text.replaceAll(`${dialect.escape}\n`, ''));
  return [name.value, ...args].join(' ');
}
