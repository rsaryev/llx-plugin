import type { ShellDialect } from './dialect.ts';
import { bodyOf, heredocOf, heredocOpener, type Heredoc } from './heredoc.ts';
import { stripKeywords } from './keywords.ts';

/**
 * The one shell lexer of the kit: it reads a command line unit by unit (a quoted part, a
 * substitution, an escaped character, a character) and splits it into the commands it runs. Words
 * and redirects are read from those commands by `words.ts`, the public reading is `split.ts`.
 */

/** Where something sits in the text that was scanned. */
export interface Span {
  readonly start: number;
  readonly end: number;
}

/** Nesting deeper than this is not read: no real command nests substitutions this far. */
const MAX_DEPTH = 32;

export interface Scan {
  readonly src: string;
  readonly dialect: ShellDialect;
  readonly subs: string[];
  /** Here-documents opened on the current line, whose bodies follow it. */
  readonly heredocs: Heredoc[];
  /** Comments, cut from the commands they end. */
  readonly comments: Span[];
  /** Here-document bodies. */
  readonly bodies: Span[];
  /** The names of the functions the line defines. */
  readonly functions: string[];
  pos: number;
  depth: number;
  ok: boolean;
  /** Set when a substitution or expansion is read outside single quotes. */
  substitutes: boolean;
  /** Set when a subshell, a command or process substitution, or an arithmetic expansion is read. */
  nests: boolean;
}

export const newScan = (src: string, dialect: ShellDialect, depth: number): Scan => ({
  src,
  dialect,
  subs: [],
  heredocs: [],
  comments: [],
  bodies: [],
  functions: [],
  pos: 0,
  depth,
  ok: true,
  substitutes: false,
  nests: false,
});

const WHITESPACE = /\s/;
export const isBlank = (char: string | undefined): boolean =>
  char !== undefined && WHITESPACE.test(char);

/** `$(`, `${` or `$NAME`: a substitution or expansion starts here. */
const EXPANSION = /\$[({A-Za-z_]/y;

/** Records an expansion or substitution that starts at `at`; never called inside single quotes. */
function noteExpansion(scan: Scan, at: number): void {
  EXPANSION.lastIndex = at;
  const backtick = scan.dialect.backtickSubstitutes && scan.src[at] === '`';
  if (backtick || EXPANSION.test(scan.src)) scan.substitutes = true;
}

const fail = (scan: Scan): void => {
  scan.ok = false;
  scan.pos = scan.src.length;
};

/** A single-quoted part is literal: `scan.pos` moves past its closing quote, or the scan fails. */
function skipSingle(scan: Scan): void {
  const close = scan.src.indexOf("'", scan.pos + 1);
  if (close === -1) return fail(scan);
  scan.pos = close + 1;
}

/** One unit of text that only substitutions run in (a double-quoted part, an unquoted body). */
function skipTextUnit(scan: Scan): void {
  const { src, pos, dialect } = scan;
  noteExpansion(scan, pos);
  if (src[pos] === dialect.escape) scan.pos += 2;
  else if (src.startsWith('$((', pos)) skipExpansion(scan, 3, '))');
  else if (src.startsWith('$(', pos)) skipNested(scan, 2, ')');
  else if (src.startsWith('${', pos)) skipExpansion(scan, 2, '}');
  else if (src[pos] === '`' && dialect.backtickSubstitutes) skipBacktick(scan);
  else scan.pos += 1;
}

/** A double-quoted part; a quote that never closes is unparseable. */
function skipDouble(scan: Scan): void {
  scan.pos += 1;
  while (scan.pos < scan.src.length && scan.src[scan.pos] !== '"') skipTextUnit(scan);
  if (scan.pos >= scan.src.length) return fail(scan);
  scan.pos += 1;
}

/** A backtick substitution: what is between the backticks is a command line of its own. */
function skipBacktick(scan: Scan): void {
  let i = scan.pos + 1;
  while (i < scan.src.length && scan.src[i] !== '`') i += scan.src[i] === '\\' ? 2 : 1;
  if (i >= scan.src.length) return fail(scan);
  const inner = newScan(scan.src.slice(scan.pos + 1, i).replaceAll('\\`', '`'), scan.dialect, 0);
  inner.depth = scan.depth + 1;
  readList(inner, undefined);
  scan.subs.push(...inner.subs);
  scan.functions.push(...inner.functions);
  scan.ok &&= inner.ok;
  scan.nests = true;
  scan.pos = i + 1;
}

/** `$(...)`, `(...)` and, where braces hold commands, `{...}`: a list of its own up to `closer`. */
function skipNested(scan: Scan, opener: number, closer: string): void {
  scan.pos += opener;
  scan.depth += 1;
  scan.nests ||= closer === ')';
  if (scan.depth > MAX_DEPTH) return fail(scan);
  readList(scan, closer);
  scan.depth -= 1;
}

/**
 * `${name:-$(cmd)}` and `$((1 + 2))` are expansions: text, except for what is substituted inside
 * them, which runs. Skipped up to `end`, reading each unit so a nested substitution is found.
 */
function skipExpansion(scan: Scan, opener: number, end: string): void {
  scan.pos += opener;
  scan.depth += 1;
  scan.nests ||= end === '))';
  if (scan.depth > MAX_DEPTH) return fail(scan);
  while (scan.pos < scan.src.length && !scan.src.startsWith(end, scan.pos)) skipUnit(scan);
  if (scan.pos >= scan.src.length) return fail(scan);
  scan.pos += end.length;
  scan.depth -= 1;
}

/** What opens a unit that is skipped whole, and how: longest opener first. */
const OPENERS: readonly { readonly open: string; readonly skip: (scan: Scan) => void }[] = [
  { open: '$((', skip: (scan) => skipExpansion(scan, 3, '))') },
  { open: '$(', skip: (scan) => skipNested(scan, 2, ')') },
  { open: '${', skip: (scan) => skipExpansion(scan, 2, '}') },
  { open: '(', skip: (scan) => skipNested(scan, 1, ')') },
  { open: "'", skip: skipSingle },
  { open: '"', skip: skipDouble },
];

/** What ends a word besides a blank: an operator character. */
const METACHARACTER = /[;&|()<>]/;

/** A here-document opener at `scan.pos`: its delimiter word is read, its body skipped at the line's end. */
function noteHeredoc(scan: Scan): boolean {
  const opener = heredocOpener(scan.src, scan.pos);
  if (opener === undefined) return false;
  scan.pos += opener.length;
  const start = scan.pos;
  while (scan.pos < scan.src.length && !isBlank(scan.src[scan.pos])) {
    if (METACHARACTER.test(scan.src[scan.pos] ?? '')) break;
    skipUnit(scan);
  }
  if (scan.pos === start) fail(scan);
  else scan.heredocs.push(heredocOf(scan.src.slice(start, scan.pos), opener.indented));
  return true;
}

/** After a newline: skips the bodies of the here-documents opened on the line just ended. */
function skipHeredocBodies(scan: Scan): void {
  for (const heredoc of scan.heredocs.splice(0)) {
    const body = bodyOf(scan.src, scan.pos, heredoc);
    scan.bodies.push({ start: scan.pos, end: body.end });
    if (!heredoc.quoted) {
      while (scan.pos < body.end) skipTextUnit(scan);
      if (scan.pos > body.end) return fail(scan);
    }
    scan.pos = body.next;
  }
}

/** Advances `scan.pos` over one unit: an escaped character, a quoted or nested part, or a character. */
export function skipUnit(scan: Scan): void {
  const { src, pos, dialect } = scan;
  if (src[pos] === dialect.escape) {
    scan.pos += 2;
    return;
  }
  noteExpansion(scan, pos);
  if (src[pos] === '`' && dialect.backtickSubstitutes) return skipBacktick(scan);
  if (src[pos] === '{' && dialect.bracesHoldCommands) return skipNested(scan, 1, '}');
  if (src[pos] === '<' && dialect.hasKeywords && noteHeredoc(scan)) return;
  const opener = OPENERS.find(({ open }) => src.startsWith(open, pos));
  if (opener === undefined) scan.pos += 1;
  else opener.skip(scan);
}

/** The separator at `pos`, ignoring the `&` of a redirect (`2>&1`, `<&3`, `&>file`). */
function separatorAt(scan: Scan): string | undefined {
  const { src, pos, dialect } = scan;
  const found = dialect.separators.find((separator) => src.startsWith(separator, pos));
  if (found !== '&') return found;
  const redirect = src[pos - 1] === '>' || src[pos - 1] === '<' || src[pos + 1] === '>';
  return redirect ? undefined : found;
}

/**
 * A comment at `scan.pos`: a `#` that starts a word runs to the end of its line, and PowerShell's
 * `<# ... #>` to its closer. Its end, or `undefined` when no comment starts here.
 */
function commentEnd(scan: Scan): number | undefined {
  const { src, pos, dialect } = scan;
  if (pos > 0 && !isBlank(src[pos - 1]) && !METACHARACTER.test(src[pos - 1] ?? ''))
    return undefined;
  if (dialect.blockComments && src.startsWith('<#', pos)) {
    const close = src.indexOf('#>', pos + 2);
    return close === -1 ? src.length + 1 : close + 2;
  }
  if (src[pos] !== '#') return undefined;
  const lineEnd = src.indexOf('\n', pos);
  return lineEnd === -1 ? src.length : lineEnd;
}

/** Skips a comment at `scan.pos`, if one starts there; an unclosed block comment is unparseable. */
function skipComment(scan: Scan): boolean {
  const end = commentEnd(scan);
  if (end === undefined) return false;
  if (end > scan.src.length) fail(scan);
  else {
    scan.comments.push({ start: scan.pos, end });
    scan.pos = end;
  }
  return true;
}

function skipBlanks(scan: Scan): void {
  while (isBlank(scan.src[scan.pos])) scan.pos += 1;
}

/** What the scanner knows about the segment being read. */
interface Segment {
  start: number;
  /** Where its command will be inserted, so a command comes before the ones nested in it. */
  slot: number;
  /** The separator before it was `&&` or `||`: an empty segment here is an unparseable command. */
  afterChain: boolean;
}

/** The text from `start` to `end` without the comments in it. */
function codeBetween(scan: Scan, start: number, end: number): string {
  let code = '';
  let from = start;
  for (const comment of scan.comments) {
    if (comment.start < from || comment.end > end) continue;
    code += scan.src.slice(from, comment.start);
    from = comment.end;
  }
  return code + scan.src.slice(from, end);
}

function endSegment(scan: Scan, segment: Segment, end: number): void {
  const text = codeBetween(scan, segment.start, end).trim();
  if (text === '') {
    if (segment.afterChain) scan.ok = false;
    return;
  }
  const command = scan.dialect.hasKeywords ? stripKeywords(text, scan.functions) : text;
  if (command !== undefined && !command.startsWith('(')) scan.subs.splice(segment.slot, 0, command);
}

/** Reads commands up to `closer` (or the end), pushing each segment as a subcommand. */
export function readList(scan: Scan, closer: string | undefined): void {
  const segment: Segment = { start: scan.pos, slot: scan.subs.length, afterChain: false };
  while (scan.pos < scan.src.length) {
    if (scan.src[scan.pos] === closer) {
      endSegment(scan, segment, scan.pos);
      scan.pos += 1;
      return;
    }
    if (skipComment(scan)) continue;
    const separator = separatorAt(scan);
    if (separator === undefined) {
      skipUnit(scan);
      continue;
    }
    endSegment(scan, segment, scan.pos);
    scan.pos += separator.length;
    const chains = scan.dialect.chains.includes(separator);
    if (chains) skipBlanks(scan);
    if (separator === '\n') skipHeredocBodies(scan);
    Object.assign(segment, { start: scan.pos, slot: scan.subs.length, afterChain: chains });
  }
  if (closer !== undefined) scan.ok = false;
  endSegment(scan, segment, scan.src.length);
}
