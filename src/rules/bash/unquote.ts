import { BASH_DIALECT, type ShellDialect } from './dialect.ts';

/**
 * Judgment (spec/judgments.md, oracle 2.1.319 and 2.1.321): permissions.md does not say how a quoted
 * command reads against a rule. Claude Code matches the command name with its quoting removed, so
 * `"rm" -rf x`, `r"m"`, `\rm` and `$'rm'` are all `rm` to a rule, and leaves every argument as
 * written: `echo "x y"` matches `Bash(echo "x y")` and not `Bash(echo x y)`.
 */

/** One shell word as the shell passes it to the command, and what in it the shell still expands. */
export interface WordValue {
  /** The word with its quotes, escapes and line continuations removed. */
  readonly value: string;
  /** A `$` or backtick outside single quotes: a variable or substitution may change the value. */
  readonly expands: boolean;
  /** A `*`, `?` or `[` outside quotes: the shell may expand the word to file names. */
  readonly globs: boolean;
}

/** In double quotes a backslash escapes only these (POSIX sh, "Double-Quotes"). */
const ESCAPED_IN_DOUBLE = new Set(['$', '`', '"', '\\', '\n']);

/** Bash's `$'...'` escapes (bash(1), "QUOTING"); a `\x`, `\u` or octal escape is read by number. */
const ANSI_ESCAPES: ReadonlyMap<string, string> = new Map([
  ['n', '\n'],
  ['t', '\t'],
  ['r', '\r'],
  ['a', '\u0007'],
  ['b', '\b'],
  ['e', '\u001b'],
  ['E', '\u001b'],
  ['f', '\f'],
  ['v', '\v'],
]);
const HEX_ESCAPE = /^(?:x([0-9A-Fa-f]{1,2})|u([0-9A-Fa-f]{1,4})|U([0-9A-Fa-f]{1,8}))/;
const OCTAL_ESCAPE = /^[0-7]{1,3}/;

type Quote = 'none' | 'single' | 'double' | 'ansi';

interface Reader {
  readonly word: string;
  readonly dialect: ShellDialect;
  at: number;
  quote: Quote;
  out: string;
  expands: boolean;
  globs: boolean;
}

/** A `$` before more text, or a Bash backtick: the shell substitutes something here. */
function noteExpansion(reader: Reader, char: string): void {
  const next = reader.word[reader.at + 1];
  const dollar = char === '$' && next !== undefined && !/\s/.test(next);
  const backtick = char === '`' && reader.dialect.backtickSubstitutes;
  reader.expands ||= dollar || backtick;
}

/** A `\x`, `\u`, `\U` or octal escape (the text just past its backslash): its code and length. */
function numberedEscape(
  rest: string,
): { readonly code: number; readonly length: number } | undefined {
  const hex = HEX_ESCAPE.exec(rest);
  if (hex !== null) {
    const digits = hex[1] ?? hex[2] ?? hex[3] ?? '0';
    return { code: Number.parseInt(digits, 16), length: hex[0].length };
  }
  const octal = OCTAL_ESCAPE.exec(rest);
  return octal === null
    ? undefined
    : { code: Number.parseInt(octal[0], 8), length: octal[0].length };
}

/** A `$'...'` escape (the text just past its backslash): its character and its length. */
function ansiEscape(rest: string): { readonly text: string; readonly length: number } {
  const numbered = numberedEscape(rest);
  if (numbered !== undefined) {
    const text = String.fromCodePoint(Math.min(numbered.code, 0x10ffff));
    return { text, length: numbered.length };
  }
  const char = rest[0] ?? '';
  return { text: ANSI_ESCAPES.get(char) ?? char, length: 1 };
}

/** An escape character: the next character literally (when `escapes` it), a newline not at all. */
function readEscaped(reader: Reader, escapes: (next: string) => boolean): void {
  const next = reader.word[reader.at + 1];
  if (next === undefined || !escapes(next)) {
    reader.out += reader.word[reader.at] ?? '';
    reader.at += 1;
    return;
  }
  reader.out += next === '\n' ? '' : next;
  reader.at += 2;
}

/** Plain text: a character that may expand or glob. */
function readPlain(reader: Reader, char: string, globs: boolean): void {
  noteExpansion(reader, char);
  reader.globs ||= globs && /[*?[]/.test(char);
  reader.out += char;
  reader.at += 1;
}

/** The quote a `$'` (ANSI-C) or `$"` (locale) opens in Bash, or `undefined`. */
const DOLLAR_QUOTES: ReadonlyMap<string, Quote> = new Map([
  ["'", 'ansi'],
  ['"', 'double'],
]);
const QUOTES: ReadonlyMap<string, Quote> = new Map([
  ["'", 'single'],
  ['"', 'double'],
]);

/** What one character does in each quoting state. */
const STEP: { readonly [Q in Quote]: (reader: Reader, char: string) => void } = {
  none: (reader, char) => {
    const { dialect } = reader;
    const dollar = char === '$' && dialect.hasKeywords;
    const opened = dollar ? DOLLAR_QUOTES.get(reader.word[reader.at + 1] ?? '') : QUOTES.get(char);
    if (opened !== undefined) {
      reader.quote = opened;
      reader.at += dollar ? 2 : 1;
    } else if (char === dialect.escape) readEscaped(reader, () => true);
    else readPlain(reader, char, true);
  },
  single: (reader, char) => {
    reader.quote = char === "'" ? 'none' : 'single';
    reader.out += char === "'" ? '' : char;
    reader.at += 1;
  },
  double: (reader, char) => {
    const { dialect } = reader;
    if (char === '"') {
      reader.quote = 'none';
      reader.at += 1;
    } else if (char === dialect.escape) {
      readEscaped(reader, (next) => !dialect.hasKeywords || ESCAPED_IN_DOUBLE.has(next));
    } else readPlain(reader, char, false);
  },
  ansi: (reader, char) => {
    if (char === "'") reader.quote = 'none';
    const escape = char === '\\' ? ansiEscape(reader.word.slice(reader.at + 1)) : undefined;
    reader.out += escape?.text ?? (char === "'" ? '' : char);
    reader.at += 1 + (escape?.length ?? 0);
  },
};

/** One shell word read the way the shell reads it (`WordValue`). */
export function readWord(word: string, dialect: ShellDialect = BASH_DIALECT): WordValue {
  const reader: Reader = {
    word,
    dialect,
    at: 0,
    quote: 'none',
    out: '',
    expands: false,
    globs: false,
  };
  while (reader.at < word.length) STEP[reader.quote](reader, word[reader.at] ?? '');
  return { value: reader.out, expands: reader.expands, globs: reader.globs };
}
