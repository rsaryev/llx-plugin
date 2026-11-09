import { scanCommand, wordsOf } from '../bash/split.ts';
import { evaluateRules } from '../evaluate.ts';
import type { PathContext } from '../types.ts';
import type { DecideContext } from './context.ts';
import { isProtectedPath } from './protected-paths.ts';
import { expandHome, inScope } from './scope.ts';
import { absolutePath } from '../path/posix.ts';

/**
 * Redirections (permissions.md, "Redirections"): "Claude Code checks the redirect target against your
 * file rules as if Claude wrote or read that file directly". An output target (`>`, `>>`, `2>`, and
 * the files a `tee` writes) goes through the `Edit` rules, protected paths and the working directories;
 * an input target (`<`) through the `Read` rules and the working directories. "Targets with no file
 * behind them aren't checked: `/dev/null`, file-descriptor forms such as `2>&1` and `<&3`, and
 * here-docs and here-strings." Judgment (spec/judgments.md): a relative target after a `cd` in the same
 * command, output or input, cannot be told from the text, so it needs approval; so does a target a
 * variable or substitution hides.
 */
export interface RedirectFacts {
  /** A target is denied by an `Edit` rule (output) or a `Read` rule (input): "deny rules block in every mode". */
  readonly denied: boolean;
  /** A target needs approval, whatever allow rule covers the command. */
  readonly approval: boolean;
  /** An output target is a protected path. */
  readonly protectedWrite: boolean;
}

export const NO_REDIRECTS: RedirectFacts = {
  denied: false,
  approval: false,
  protectedWrite: false,
};

export interface Target {
  readonly text: string;
  readonly kind: 'output' | 'input';
  /** A `cd` ran earlier in the command. */
  readonly afterCd: boolean;
}

const OPERATOR = /^(?:\d*>>?|&>>?|>\||\d*<)(?!<|&)/;
const GLOB = /[*?[]/;

const isQuoted = (word: string): boolean => /^["']/.test(word);

/** The operator and the text attached to it (`2>out.txt`), or `undefined` when the word is no redirect. */
function operatorOf(word: string): { kind: Target['kind']; attached: string } | undefined {
  if (isQuoted(word) || /<<|^\d*[<>]&/.test(word)) return undefined;
  const found = OPERATOR.exec(word);
  if (found === null) return undefined;
  return {
    kind: found[0].includes('<') ? 'input' : 'output',
    attached: word.slice(found[0].length),
  };
}

function redirectsIn(words: readonly string[], afterCd: boolean): Target[] {
  const targets: Target[] = [];
  words.forEach((word, index) => {
    const operator = operatorOf(word);
    if (operator === undefined) return;
    const text = operator.attached === '' ? (words[index + 1] ?? '') : operator.attached;
    if (text !== '' && text !== '/dev/null' && !/^&\d*-?$/.test(text)) {
      targets.push({ text, kind: operator.kind, afterCd });
    }
  });
  return targets;
}

/** The files a `tee` writes: its operands that are not options. */
const teeTargets = (words: readonly string[], afterCd: boolean): Target[] =>
  words[0] === 'tee'
    ? words
        .slice(1)
        .filter((word) => !word.startsWith('-') && word !== '/dev/null')
        .map((text) => ({ text, kind: 'output' as const, afterCd }))
    : [];

/** The files a command's redirections and `tee`s read or write, as written, in the order they run. */
export function redirectTargets(command: string): readonly Target[] {
  const scan = scanCommand(command);
  let afterCd = false;
  const targets: Target[] = [];
  for (const subcommand of scan.subcommands) {
    const words = wordsOf(subcommand).map((word) => word.text);
    targets.push(...redirectsIn(words, afterCd), ...teeTargets(words, afterCd));
    afterCd ||= words[0] === 'cd';
  }
  return targets;
}

const unquote = (word: string): string => word.replaceAll('"', '').replaceAll("'", '');

const relativeAfterCd = (text: string, afterCd: boolean): boolean =>
  afterCd && !text.startsWith('/') && !text.startsWith('~');

/** What differs between the two directions: the rules that judge the file, and when its text is not enough. */
interface Direction {
  readonly tool: 'Edit' | 'Read';
  readonly unsure: (text: string, afterCd: boolean) => boolean;
  readonly checksProtected: boolean;
}

const DIRECTIONS: { readonly [K in Target['kind']]: Direction } = {
  output: {
    tool: 'Edit',
    unsure: (text, afterCd) => text.startsWith('~') || relativeAfterCd(text, afterCd),
    checksProtected: true,
  },
  input: { tool: 'Read', unsure: relativeAfterCd, checksProtected: false },
};

/** The absolute path of a target, or `undefined` when a variable or substitution hides it. */
const literalOf = (text: string, paths: PathContext): string | undefined =>
  /[$`]/.test(text) ? undefined : absolutePath(expandHome(text, paths), paths);

/** What the rules say about the file as the tool of its direction would see it. */
const ruleSays = (literal: string | undefined, tool: Direction['tool'], ctx: DecideContext) =>
  literal === undefined
    ? undefined
    : evaluateRules(ctx.rules, { toolName: tool, input: { file_path: literal } }, ctx.match)
        .behavior;

/** What one target needs: a denial, an approval, a protected write, or nothing. */
function judgeTarget(target: Target, ctx: DecideContext): RedirectFacts {
  const text = unquote(target.text);
  const { paths } = ctx.match;
  const direction = DIRECTIONS[target.kind];
  const literal = literalOf(text, paths);
  const behavior = ruleSays(literal, direction.tool, ctx);
  const unsure = GLOB.test(text) || literal === undefined || direction.unsure(text, target.afterCd);
  const covered = literal !== undefined && (inScope(literal, paths) || behavior === 'allow');
  return {
    denied: behavior === 'deny',
    approval: unsure || behavior === 'ask' || !covered,
    protectedWrite:
      direction.checksProtected &&
      literal !== undefined &&
      isProtectedPath(literal, paths, ctx.protectedPaths ?? {}),
  };
}

/** What the redirect targets of a Bash command ask of the permission check. */
export function redirectFacts(command: string, ctx: DecideContext): RedirectFacts {
  const judged = redirectTargets(command).map((target) => judgeTarget(target, ctx));
  return {
    denied: judged.some((fact) => fact.denied),
    approval: judged.some((fact) => fact.approval),
    protectedWrite: judged.some((fact) => fact.protectedWrite),
  };
}
