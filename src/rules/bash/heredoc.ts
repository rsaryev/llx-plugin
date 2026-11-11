import { readWord } from './unquote.ts';

/**
 * Here-documents (bash(1), "Here Documents"): `<<word` or `<<-word`. The delimiter is the whole word
 * with its quotes removed, so `'E'OF` ends at a line `EOF`; any quoted part makes the body plain
 * text, otherwise the body still undergoes "parameter and variable expansion, command substitution,
 * and arithmetic expansion". The body starts on the line after the opener and ends at the first line
 * that is the delimiter (after leading tabs for `<<-`).
 */
export interface Heredoc {
  readonly delimiter: string;
  /** `<<-` lets the closing line be indented with tabs. */
  readonly indented: boolean;
  /** A quote or backslash in the delimiter word: the body is literal text. */
  readonly quoted: boolean;
}

/** `<<` or `<<-` and the blanks after it; the `<<<` of a here-string is no opener. */
const OPENER = /(?<!<)<<(?!<)(-?)[ \t]*/y;

/** The opener at `pos`: its length and whether it is `<<-`, or `undefined`. */
export function heredocOpener(
  src: string,
  pos: number,
): { readonly length: number; readonly indented: boolean } | undefined {
  OPENER.lastIndex = pos;
  const found = OPENER.exec(src);
  return found === null ? undefined : { length: found[0].length, indented: found[1] === '-' };
}

/** The here-document a delimiter word (as written) opens. */
export function heredocOf(word: string, indented: boolean): Heredoc {
  return { delimiter: readWord(word).value, indented, quoted: /['"\\]/.test(word) };
}

/** Where a body that starts at `from` ends (`end`, the closing line's start) and what follows it (`next`). */
export function bodyOf(
  src: string,
  from: number,
  heredoc: Heredoc,
): { readonly end: number; readonly next: number } {
  let at = from;
  while (at < src.length) {
    const lineEnd = src.indexOf('\n', at);
    const end = lineEnd === -1 ? src.length : lineEnd;
    const line = src.slice(at, end);
    if ((heredoc.indented ? line.replace(/^\t+/, '') : line) === heredoc.delimiter) {
      return { end: at, next: Math.min(end + 1, src.length) };
    }
    at = end + 1;
  }
  return { end: src.length, next: src.length };
}
