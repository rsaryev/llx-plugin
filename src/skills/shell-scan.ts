/**
 * Where a skill asks for dynamic context (skills.md, "Inject dynamic context"): the inline form
 * `` !`<command>` `` and a block opened with ```` ```! ````. The scan runs on the original text, so
 * a command's output, an argument or a variable can never add a placeholder: "Substitution runs
 * once over the original file ... a command cannot emit a placeholder for a later pass to expand".
 */

export type InjectionKind = 'inline' | 'fence';

export interface Injection {
  readonly kind: InjectionKind;
  /** Offsets in the scanned text; `[start, end)` is the whole placeholder. */
  readonly start: number;
  readonly end: number;
  /** What the shell runs, as written: a block's lines without the fences. */
  readonly command: string;
  /** The text before and after the command, kept to put a placeholder back as it was written. */
  readonly open: string;
  readonly close: string;
}

/**
 * Two alternatives, so a block is read as a unit and its lines are never scanned again as inline
 * spans. The inline form is "only recognized when `!` appears at the start of a line or
 * immediately after whitespace": `(?<!\S)`. Judgments (spec/judgments.md): a block is opened by a
 * line that is exactly the fence (no indentation) and closed by the first line that is exactly
 * ```` ``` ````; an inline span stays on one line. As Claude Code 2.1.322 does (oracle): any
 * JavaScript whitespace before the `!` counts (a no-break space, a BOM, U+2028), and Markdown code
 * spans and other fences are not skipped.
 */
const PLACEHOLDER = new RegExp(
  [
    '^(?<fenceOpen>```![ \\t]*\\r?\\n)(?:(?<fenceBody>[\\s\\S]*?)(?<fenceNewline>\\r?\\n))?(?<fenceClose>```[ \\t]*)$',
    '(?<!\\S)(?<inlineOpen>!`)(?<inlineBody>[^`\\n]+)(?<inlineClose>`)',
  ].join('|'),
  'gm',
);

/** What one alternative of `PLACEHOLDER` captured. */
type Captured = Readonly<Record<string, string | undefined>>;

const placeholder = (
  kind: InjectionKind,
  found: RegExpExecArray,
  parts: Pick<Injection, 'command' | 'open' | 'close'>,
): Injection => ({ kind, start: found.index, end: found.index + found[0].length, ...parts });

function fenceOf(found: RegExpExecArray, groups: Captured): Injection {
  return placeholder('fence', found, {
    command: groups['fenceBody'] ?? '',
    open: groups['fenceOpen'] ?? '',
    close: `${groups['fenceNewline'] ?? ''}${groups['fenceClose'] ?? ''}`,
  });
}

function inlineOf(found: RegExpExecArray, groups: Captured): Injection {
  return placeholder('inline', found, {
    command: groups['inlineBody'] ?? '',
    open: groups['inlineOpen'] ?? '',
    close: groups['inlineClose'] ?? '',
  });
}

function fromMatch(found: RegExpExecArray): Injection | undefined {
  const groups: Captured = found.groups ?? {};
  const injection =
    groups['fenceOpen'] === undefined ? inlineOf(found, groups) : fenceOf(found, groups);
  // A blank command runs nothing: it is left as written.
  return injection.command.trim() === '' ? undefined : injection;
}

/** The placeholders of `content`, in order, without overlap. */
export function findInjections(content: string): readonly Injection[] {
  const injections: Injection[] = [];
  for (const found of content.matchAll(PLACEHOLDER)) {
    const injection = fromMatch(found);
    if (injection !== undefined) injections.push(injection);
  }
  return injections;
}
