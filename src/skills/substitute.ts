import type { PluginIssue } from '../format/issues.ts';
import { parseArguments } from './arguments.ts';
import { substituteVariables, type SkillVariables } from './variables.ts';

/**
 * Argument substitution (skills.md, "Available string substitutions" and "Pass arguments to
 * skills"): `$ARGUMENTS`, `$ARGUMENTS[N]`, `$N` and `$name` over the original text in one pass, so
 * an argument value is inserted as literal text and never expanded. `${CLAUDE_*}` is substituted
 * afterwards, over the result, as the docs say: "Claude Code still replaces `${CLAUDE_*}`
 * variables such as `${CLAUDE_SKILL_DIR}` after it inserts the arguments".
 */

export interface ArgumentInput {
  /** The text after the command name, as typed. */
  readonly rawArguments: string;
  /** `arguments` of the frontmatter: the names of `$name`, in argument order. */
  readonly names: readonly string[];
}

/** What a placeholder at one position stands for. `value` undefined: it stays as written. */
interface Placeholder {
  readonly length: number;
  readonly value: string | undefined;
  /** Whether it counts as receiving an argument (decides the `ARGUMENTS:` append). */
  readonly receives: boolean;
}

interface Typed extends ArgumentInput {
  readonly args: readonly string[];
}

type Recognizer = (text: string, at: number, typed: Typed) => Placeholder | undefined;

const INDEXED = /\$ARGUMENTS\[(\d+)\]/y;
const WHOLE = /\$ARGUMENTS(?![A-Za-z0-9_])/y;
const SHORT = /\$(\d+)/y;
const IDENTIFIER_CHAR = /[A-Za-z0-9_]/;

const match = (pattern: RegExp, text: string, at: number): RegExpExecArray | null => {
  pattern.lastIndex = at;
  return pattern.exec(text);
};

/** The argument at a 0-based index; a number too large to be an index reads nothing. */
function argumentAt(typed: Typed, digits: string): string | undefined {
  const index = Number(digits);
  return Number.isSafeInteger(index) ? typed.args[index] : undefined;
}

const indexedPlaceholder = (found: RegExpExecArray, typed: Typed): Placeholder => {
  const value = argumentAt(typed, found[1] ?? '');
  return { length: found[0].length, value, receives: value !== undefined };
};

const indexedForm: Recognizer = (text, at, typed) => {
  const found = match(INDEXED, text, at);
  return found ? indexedPlaceholder(found, typed) : undefined;
};

const wholeForm: Recognizer = (text, at, typed) => {
  const found = match(WHOLE, text, at);
  return found ? { length: found[0].length, value: typed.rawArguments, receives: true } : undefined;
};

const shorthandForm: Recognizer = (text, at, typed) => {
  const found = match(SHORT, text, at);
  return found ? indexedPlaceholder(found, typed) : undefined;
};

/** `$name` for a declared name: the longest declared name wins, and a name is read whole. */
const namedForm: Recognizer = (text, at, typed) => {
  const candidates = typed.names
    .filter((name) => name !== '')
    .toSorted((a, b) => b.length - a.length);
  for (const name of candidates) {
    const end = at + 1 + name.length;
    const whole = text.startsWith(name, at + 1) && !IDENTIFIER_CHAR.test(text.charAt(end));
    if (whole) {
      return {
        length: 1 + name.length,
        value: typed.args[typed.names.indexOf(name)] ?? '',
        receives: true,
      };
    }
  }
  return undefined;
};

/** In order: `$ARGUMENTS[N]` before `$ARGUMENTS`, which would otherwise take its first part. */
const RECOGNIZERS: readonly Recognizer[] = [indexedForm, wholeForm, shorthandForm, namedForm];

function recognize(text: string, at: number, typed: Typed): Placeholder | undefined {
  for (const recognizer of RECOGNIZERS) {
    const found = recognizer(text, at, typed);
    if (found) return found;
  }
  return undefined;
}

/** A `$`, with the backslash directly before it when there is one. */
const DOLLAR = /\\?\$/g;

interface Scanned {
  readonly text: string;
  readonly received: boolean;
}

/**
 * One pass. A single backslash directly before a placeholder escapes it: the backslash goes and
 * the placeholder stays as text. After a backslash that is itself preceded by one (`\\$1`) the
 * placeholder expands and both backslashes stay. A backslash before a `$` that is no placeholder
 * stays as written.
 */
function scan(content: string, typed: Typed): Scanned {
  let out = '';
  let cursor = 0;
  let received = false;
  for (const found of content.matchAll(DOLLAR)) {
    const slash = found[0].length === 2;
    const dollar = found.index + found[0].length - 1;
    // A `$` inside a name already consumed is part of that name, not a placeholder of its own.
    if (dollar < cursor) continue;
    const placeholder = recognize(content, dollar, typed);
    if (!placeholder) continue;
    const written = content.slice(dollar, dollar + placeholder.length);
    const escaped = slash && content.charAt(found.index - 1) !== '\\';
    out += content.slice(cursor, found.index);
    out += escaped ? written : (slash ? '\\' : '') + (placeholder.value ?? written);
    received ||= !escaped && placeholder.receives;
    cursor = dollar + placeholder.length;
  }
  return { text: out + content.slice(cursor), received };
}

/**
 * Judgment: the appended line is `ARGUMENTS: <value>` after a blank line (the docs give the line,
 * not the separator), with the arguments as typed.
 */
const APPENDED = (rawArguments: string): string => `\n\nARGUMENTS: ${rawArguments}`;

/**
 * `substituteArguments` over the pieces of one text, for a text cut at its `` !`command` ``
 * placeholders (`skills/expand`): a placeholder in any piece counts as receiving the arguments, and
 * the `ARGUMENTS:` line, when none did, ends the last piece. Each piece is scanned alone, so an
 * argument value inserted into one can never reach another.
 */
export function substituteArgumentPieces(
  pieces: readonly string[],
  input: ArgumentInput,
): readonly string[] {
  const typed: Typed = { ...input, args: parseArguments(input.rawArguments) };
  const scanned = pieces.map((piece) => scan(piece, typed));
  const append = !scanned.some((piece) => piece.received) && input.rawArguments.trim() !== '';
  return scanned.map((piece, index) =>
    append && index === scanned.length - 1 ? piece.text + APPENDED(input.rawArguments) : piece.text,
  );
}

/**
 * `$ARGUMENTS`, `$ARGUMENTS[N]`, `$N` and `$name` in `content`. With arguments typed and no
 * placeholder receiving one, `ARGUMENTS: <value>` is appended to the end.
 */
export function substituteArguments(content: string, input: ArgumentInput): string {
  return substituteArgumentPieces([content], input).join('');
}

export interface SubstitutionInput extends ArgumentInput {
  readonly vars: SkillVariables;
}

export interface Substitution {
  readonly text: string;
  readonly issues: readonly PluginIssue[];
}

/** Arguments first, then `${CLAUDE_*}` over the result (so over the inserted arguments too). */
export async function substitute(
  content: string,
  input: SubstitutionInput,
  path = '',
): Promise<Substitution> {
  return substituteVariables(substituteArguments(content, input), input.vars, path);
}
