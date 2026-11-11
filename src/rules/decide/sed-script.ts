import type { ShellWord } from '../bash/words.ts';

/**
 * Whether a `sed` call only edits the files it names (permission-modes.md, "Auto-approve file edits
 * with acceptEdits mode" lists `sed` as an edit of its operands). A script can also write another
 * file (`w`, `W`, the `s///w` flag), run a command (`e`, the `s///e` flag) or read one (`r`, `R`),
 * and `-f` reads the script from a file the kit does not see: none of those is an edit of the
 * operands, so the call is not approved (spec/judgments.md). The reading is GNU sed's; a script the
 * reader does not know is unsafe.
 */

interface Cursor {
  readonly text: string;
  at: number;
}

const peek = (cursor: Cursor): string => cursor.text[cursor.at] ?? '';

/** Text up to an unescaped `delimiter`, the cursor left past it; false when it never comes. */
function skipDelimited(cursor: Cursor, delimiter: string): boolean {
  while (cursor.at < cursor.text.length) {
    const char = peek(cursor);
    cursor.at += char === '\\' ? 2 : 1;
    if (char === delimiter) return true;
  }
  return false;
}

const skipWhile = (cursor: Cursor, pattern: RegExp): void => {
  while (cursor.at < cursor.text.length && pattern.test(peek(cursor))) cursor.at += 1;
};

/** One address: a line number, `$`, `/regex/` or `\cregexc`, with its `I` and `M` flags. */
function skipAddress(cursor: Cursor): boolean {
  const char = peek(cursor);
  if (/[0-9$]/.test(char)) {
    skipWhile(cursor, /[0-9$~]/);
    return true;
  }
  const custom = char === '\\';
  if (char !== '/' && !custom) return true;
  cursor.at += custom ? 2 : 1;
  const closed = skipDelimited(cursor, custom ? (cursor.text[cursor.at - 1] ?? '') : '/');
  skipWhile(cursor, /[IM]/);
  return closed;
}

/** The address range of a command and its `!`. */
function skipAddresses(cursor: Cursor): boolean {
  if (!skipAddress(cursor)) return false;
  if (peek(cursor) === ',') {
    cursor.at += 1;
    if (peek(cursor) === '+' || peek(cursor) === '~') cursor.at += 1;
    if (!skipAddress(cursor)) return false;
  }
  skipWhile(cursor, /[\s!]/);
  return true;
}

/** `s` flags that change only what is printed or matched; `w` writes a file and `e` runs the result. */
const SUBSTITUTE_FLAGS = /[gpiImM0-9]/;

const substitute = (cursor: Cursor): boolean => {
  const delimiter = peek(cursor);
  cursor.at += 1;
  if (delimiter === '' || delimiter === '\n' || delimiter === '\\') return false;
  if (!skipDelimited(cursor, delimiter) || !skipDelimited(cursor, delimiter)) return false;
  skipWhile(cursor, SUBSTITUTE_FLAGS);
  return true;
};

const transliterate = (cursor: Cursor): boolean => {
  const delimiter = peek(cursor);
  cursor.at += 1;
  return delimiter !== '' && skipDelimited(cursor, delimiter) && skipDelimited(cursor, delimiter);
};

/** `a`, `i`, `c`, `#` and the labels of `b`, `t`, `T`, `:` run to the end of the line or the `;`. */
const toLineEnd = (cursor: Cursor): boolean => {
  skipWhile(cursor, /[^\n]/);
  return true;
};
const toCommandEnd = (cursor: Cursor): boolean => {
  skipWhile(cursor, /[^\n;}]/);
  return true;
};
const bare = (): boolean => true;
const withNumber = (cursor: Cursor): boolean => {
  skipWhile(cursor, /[\s0-9]/);
  return true;
};

type Read = (cursor: Cursor) => boolean;

const each = (names: string, read: Read): [string, Read][] =>
  names.split('').map((name) => [name, read]);

/** The commands that touch nothing but the pattern and hold spaces and the output. */
const COMMANDS: ReadonlyMap<string, Read> = new Map([
  ['s', substitute],
  ['y', transliterate],
  ...each('aic#', toLineEnd),
  ...each('btT:v', toCommandEnd),
  ...each('qQlL', withNumber),
  ...each('pdDnNgGhHxz={}', bare),
]);

/** One command and what may follow it: a `;`, a newline, a `}` or the end. */
function readCommand(cursor: Cursor): boolean {
  if (!skipAddresses(cursor)) return false;
  const name = peek(cursor);
  const read = COMMANDS.get(name);
  cursor.at += 1;
  if (read === undefined || !read(cursor)) return false;
  skipWhile(cursor, /[ \t]/);
  // A `{` opens a block: the next command may follow it on the same line.
  return name === '{' || /^[;\n}]?$/.test(peek(cursor));
}

/** Whether every command of a sed script is one of `COMMANDS`. */
function isSafeSedScript(script: string): boolean {
  const cursor: Cursor = { text: script, at: 0 };
  for (;;) {
    skipWhile(cursor, /[\s;]/);
    if (cursor.at >= script.length) return true;
    if (!readCommand(cursor)) return false;
  }
}

/** Options that change nothing but how the operands are read and written. */
const PLAIN_OPTION =
  /^(?:-[nrEsuz]*(?:i.*)?|--(?:in-place(?:=.*)?|quiet|silent|regexp-extended|separate|null-data|posix|debug|unbuffered|follow-symlinks|sandbox))$/;
const EXPRESSION = /^(?:-[nrEsuz]*e(.*)|--expression(?:=(.*))?)$/s;

interface SedCall {
  readonly scripts: ShellWord[];
  readonly operands: ShellWord[];
  safe: boolean;
}

/** One option of a sed call: a plain one, an `-e` script (here or in the next word), or an unsafe one. */
function readOption(words: readonly ShellWord[], at: number, call: SedCall): number {
  const { value } = words[at] ?? { value: '' };
  const expression = EXPRESSION.exec(value);
  if (expression === null) {
    call.safe &&= PLAIN_OPTION.test(value);
    return at;
  }
  const attached = expression[1] ?? expression[2];
  const word = words[at];
  if (attached !== undefined && attached !== '' && word !== undefined) {
    call.scripts.push({ ...word, value: attached });
    return at;
  }
  const next = words[at + 1];
  if (next === undefined) call.safe = false;
  else call.scripts.push(next);
  return at + 1;
}

/**
 * The files a sed call edits, or `undefined` when its script does more than edit them (a script
 * a variable hides counts as unsafe).
 */
export function sedOperands(args: readonly ShellWord[]): readonly ShellWord[] | undefined {
  const call: SedCall = { scripts: [], operands: [], safe: true };
  let options = true;
  for (let at = 0; at < args.length; at++) {
    const word = args[at];
    if (word === undefined) continue;
    if (options && word.value === '--') options = false;
    else if (options && word.value.startsWith('-')) at = readOption(args, at, call);
    else call.operands.push(word);
  }
  return editedFiles(call);
}

/** The operands left once the script is known safe: with no `-e`, the first operand is the script. */
function editedFiles(call: SedCall): readonly ShellWord[] | undefined {
  const inline = call.scripts.length === 0;
  const scripts = inline ? call.operands.slice(0, 1) : call.scripts;
  const safe =
    call.safe &&
    scripts.length > 0 &&
    scripts.every((script) => !script.expands && isSafeSedScript(script.value));
  return safe ? call.operands.slice(inline ? 1 : 0) : undefined;
}
