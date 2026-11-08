/**
 * The arguments a user typed after a skill's name (skills.md, "Available string substitutions":
 * "Indexed arguments use shell-style quoting, so wrap multi-word values in quotes").
 *
 * The docs give one example, `"hello world" second`. The rest is the kit's judgment
 * (spec/judgments.md): single quotes are literal; double quotes take a backslash before `"` and
 * `\`; outside quotes a backslash escapes whitespace, a quote or a backslash and stays as written
 * before anything else (so a Windows path `C:\Users\me` survives); quoted and bare parts of one
 * word join; `""` is an empty argument; a quote never closed takes the rest of the text.
 */

/** One piece of a word: a quoted run (closed, or open to the end), an escape or bare text. */
const PIECE = String.raw`"(?:\\[\s\S]|[^"\\])*"|'[^']*'|"(?:\\[\s\S]|[^"\\])*\\?$|'[^']*$|\\[\s\S]|[^\s"'\\]+|\\`;
const WORDS = new RegExp(`(?:${PIECE})+`, 'g');
const PIECES = new RegExp(PIECE, 'g');

const DOUBLE_ESCAPE = /\\(["\\])/g;
const BARE_ESCAPE = /^\\(["'\\\s])$/;

/** What a quoted run or an escape stands for, picked by its first character. */
const READERS: Readonly<Record<string, (piece: string) => string>> = {
  '"': (piece) => {
    const closed = piece.length > 1 && piece.endsWith('"') && !endsEscaped(piece);
    return piece.slice(1, closed ? -1 : undefined).replace(DOUBLE_ESCAPE, '$1');
  },
  "'": (piece) => piece.slice(1, piece.length > 1 && piece.endsWith("'") ? -1 : undefined),
  '\\': (piece) => BARE_ESCAPE.exec(piece)?.[1] ?? piece,
};

/** True when the final `"` of a double-quoted run is itself escaped (an unclosed run). */
function endsEscaped(piece: string): boolean {
  const body = piece.slice(1, -1);
  const slashes = body.length - body.replace(/\\+$/, '').length;
  return slashes % 2 === 1;
}

const unquote = (word: string): string =>
  word.replace(PIECES, (piece) => READERS[piece.charAt(0)]?.(piece) ?? piece);

/** `raw` split into arguments the way a shell would: `"hello world" second` is two. */
export function parseArguments(raw: string): readonly string[] {
  return [...raw.matchAll(WORDS)].map(([word]) => unquote(word));
}
