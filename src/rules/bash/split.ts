import { BASH_DIALECT, type ShellDialect } from './dialect.ts';
import { stripKeywords } from './keywords.ts';

/** The subcommands a command line runs, and whether the kit could read it all. */
export interface SplitCommand {
  /** In reading order, a command before the ones nested in it; best effort when not parseable. */
  readonly subcommands: readonly string[];
  /** False for a command with nothing after `&&` or `||`, or an unclosed quote or bracket. */
  readonly parseable: boolean;
}

/** A split command plus whether it expands or substitutes anything outside single quotes. */
export interface CommandScan extends SplitCommand {
  /**
   * `$(`, a backtick (Bash), `${` or `$NAME` outside single quotes and not escaped: the command may
   * run something its text does not show. Read by the quote-aware scanner, so an apostrophe inside
   * double quotes does not hide one.
   */
  readonly substitutes: boolean;
}

/** Nesting deeper than this is not read: no real command nests substitutions this far. */
const MAX_DEPTH = 32;

interface Scan {
  readonly src: string;
  readonly dialect: ShellDialect;
  readonly subs: string[];
  /** Quoted here-document delimiters read on the current line, whose bodies follow it. */
  readonly heredocs: Heredoc[];
  pos: number;
  depth: number;
  ok: boolean;
  /** Set when a substitution or expansion is read outside single quotes. */
  substitutes: boolean;
}

interface Heredoc {
  readonly delimiter: string;
  /** `<<-` lets the closing line be indented with tabs. */
  readonly indented: boolean;
}

const newScan = (src: string, dialect: ShellDialect, depth: number): Scan => ({
  src,
  dialect,
  subs: [],
  heredocs: [],
  pos: 0,
  depth,
  ok: true,
  substitutes: false,
});

const WHITESPACE = /\s/;
const isBlank = (char: string | undefined): boolean => char !== undefined && WHITESPACE.test(char);

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

/**
 * A double-quoted part: text, except for what is substituted inside it, which runs. `scan.pos`
 * moves past the closing quote; a quote that never closes is unparseable.
 */
function skipDouble(scan: Scan): void {
  let i = scan.pos + 1;
  while (i < scan.src.length) {
    const char = scan.src[i];
    noteExpansion(scan, i);
    if (char === scan.dialect.escape) i += 2;
    else if (char === '"') {
      scan.pos = i + 1;
      return;
    } else if (scan.src.startsWith('$(', i)) {
      scan.pos = i;
      skipNested(scan, 2, ')');
      i = scan.pos;
    } else if (char === '`' && scan.dialect.backtickSubstitutes) {
      scan.pos = i;
      skipBacktick(scan);
      i = scan.pos;
    } else i += 1;
  }
  fail(scan);
}

/** A backtick substitution: what is between the backticks is a command line of its own. */
function skipBacktick(scan: Scan): void {
  let i = scan.pos + 1;
  while (i < scan.src.length && scan.src[i] !== '`') i += scan.src[i] === '\\' ? 2 : 1;
  if (i >= scan.src.length) return fail(scan);
  const inner = scan.src.slice(scan.pos + 1, i).replaceAll('\\`', '`');
  const nested = scanText(inner, scan.dialect, scan.depth + 1);
  scan.subs.push(...nested.subcommands);
  scan.ok = scan.ok && nested.parseable;
  scan.pos = i + 1;
}

/** `$(...)`, `(...)` and, where braces hold commands, `{...}`: a list of its own up to `closer`. */
function skipNested(scan: Scan, opener: number, closer: string): void {
  scan.pos += opener;
  scan.depth += 1;
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

/**
 * `<<'EOF'` or `<<"EOF"`: "here-documents" with a quoted delimiter hold text, never commands. The
 * `<<` of a here-string (`<<< 'text'`) is not an opener: its lookbehind rejects a `<` before it.
 */
const QUOTED_HEREDOC = /(?<!<)<<(?!<)(-?)[ \t]*(['"])([^'"\n]+)\2/y;

/** Notes a here-document that starts at `scan.pos`; its body is skipped at the end of the line. */
function noteHeredoc(scan: Scan): boolean {
  QUOTED_HEREDOC.lastIndex = scan.pos;
  const found = QUOTED_HEREDOC.exec(scan.src);
  if (found === null) return false;
  scan.heredocs.push({ delimiter: found[3] ?? '', indented: found[1] === '-' });
  scan.pos += found[0].length;
  return true;
}

/** After a newline: skips the bodies of the here-documents opened on the line just ended. */
function skipHeredocBodies(scan: Scan): void {
  for (const { delimiter, indented } of scan.heredocs.splice(0)) {
    while (scan.pos < scan.src.length) {
      const lineEnd = scan.src.indexOf('\n', scan.pos);
      const end = lineEnd === -1 ? scan.src.length : lineEnd;
      const line = scan.src.slice(scan.pos, end);
      scan.pos = Math.min(end + 1, scan.src.length);
      if ((indented ? line.replace(/^\t+/, '') : line) === delimiter) break;
    }
  }
}

/** Advances `scan.pos` over one unit: an escaped character, a quoted or nested part, or a character. */
function skipUnit(scan: Scan): void {
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

function endSegment(scan: Scan, segment: Segment, end: number): void {
  const text = scan.src.slice(segment.start, end).trim();
  if (text === '') {
    if (segment.afterChain) scan.ok = false;
    return;
  }
  const command = scan.dialect.hasKeywords ? stripKeywords(text) : text;
  if (command !== undefined && !command.startsWith('(')) scan.subs.splice(segment.slot, 0, command);
}

/** Reads commands up to `closer` (or the end), pushing each segment as a subcommand. */
function readList(scan: Scan, closer: string | undefined): void {
  const segment: Segment = { start: scan.pos, slot: scan.subs.length, afterChain: false };
  while (scan.pos < scan.src.length) {
    if (scan.src[scan.pos] === closer) {
      endSegment(scan, segment, scan.pos);
      scan.pos += 1;
      return;
    }
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

function scanText(src: string, dialect: ShellDialect, depth: number): CommandScan {
  const scan = newScan(src, dialect, depth);
  readList(scan, undefined);
  return { subcommands: scan.subs, parseable: scan.ok, substitutes: scan.substitutes };
}

/**
 * Splits a command line into the commands it runs (permissions.md, "Compound commands"): at every
 * separator outside quotes, and again inside `$()`, backticks, subshells and control-flow bodies,
 * so a rule sees a command nested in another. The text of each subcommand is as written. A command
 * the kit cannot read to the end is `parseable: false`, with the subcommands found so far.
 */
export function splitCommand(command: string, dialect: ShellDialect = BASH_DIALECT): SplitCommand {
  const { subcommands, parseable } = scanText(command, dialect, 0);
  return { subcommands, parseable };
}

/** `splitCommand` with whether the command substitutes or expands anything outside single quotes. */
export function scanCommand(command: string, dialect: ShellDialect = BASH_DIALECT): CommandScan {
  return scanText(command, dialect, 0);
}

/** The words of a subcommand with where each starts and ends; quoted and nested parts stay whole. */
export interface Word {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

export function wordsOf(command: string, dialect: ShellDialect = BASH_DIALECT): readonly Word[] {
  const scan = newScan(command, dialect, 0);
  const words: Word[] = [];
  while (scan.pos < command.length) {
    if (isBlank(command[scan.pos])) {
      scan.pos += 1;
      continue;
    }
    const start = scan.pos;
    while (scan.pos < command.length && !isBlank(command[scan.pos])) skipUnit(scan);
    const end = Math.min(scan.pos, command.length);
    words.push({ text: command.slice(start, end), start, end });
  }
  return words;
}
