import { scanCommand } from '../bash/split.ts';
import type { RedirectKind, ShellCommand, ShellWord } from '../bash/words.ts';
import { evaluateRules } from '../evaluate.ts';
import type { PathContext } from '../types.ts';
import type { DecideContext } from './context.ts';
import { isProtectedPath } from './protected-paths.ts';
import { inScope } from './scope.ts';
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
  /**
   * A redirect writes a file that only the working directories cover, no `Edit` allow rule: "as if
   * Claude wrote ... that file directly", which only a mode that accepts such an edit lets through.
   */
  readonly inScopeWrite: boolean;
}

export const NO_REDIRECTS: RedirectFacts = {
  denied: false,
  approval: false,
  protectedWrite: false,
  inScopeWrite: false,
};

/**
 * Where a target comes from, which sets how it is judged:
 * - `redirect`: a redirection; a glob or an unsure text needs approval, a write in scope is an edit;
 * - `tee`: a file `tee` writes, judged as a redirect but `Bash(tee *)` covers one in scope;
 * - `operand`: a file a recognized file command names (`file-targets.ts`): a Bash rule covers one in
 *   scope; a glob is judged by its directory, a `..` after a directory segment needs approval;
 * - `unchecked`: a file a command names that Claude Code does not path-check (`less`, `chmod`): only
 *   a `Read` or `Edit` deny or ask rule applies (docs/SECURITY.md).
 */
export type TargetSource = 'redirect' | 'tee' | 'operand' | 'unchecked';

export interface Target {
  readonly word: ShellWord;
  readonly kind: 'output' | 'input';
  /** A `cd` ran earlier in the command (an operand is read against the starting directory). */
  readonly afterCd: boolean;
  readonly source: TargetSource;
}

/** The directions of each redirection: `<>` both reads and writes; descriptors and here-documents name no file. */
const DIRECTIONS_OF: { readonly [K in RedirectKind]: readonly Target['kind'][] } = {
  output: ['output'],
  input: ['input'],
  both: ['input', 'output'],
  descriptor: [],
  here: [],
};

const NO_FILE = '/dev/null';

function redirectsIn(command: ShellCommand, afterCd: boolean): Target[] {
  return command.redirects.flatMap(({ kind, target }) =>
    target === undefined || target.value === NO_FILE
      ? []
      : DIRECTIONS_OF[kind].map((direction) => ({
          word: target,
          kind: direction,
          afterCd,
          source: 'redirect' as const,
        })),
  );
}

/** The files a `tee` writes: its operands that are not options. */
const teeTargets = (command: ShellCommand, afterCd: boolean): Target[] =>
  command.words[0]?.value === 'tee'
    ? command.words
        .slice(1)
        .filter((word) => !word.value.startsWith('-') && word.value !== NO_FILE)
        .map((word) => ({ word, kind: 'output' as const, afterCd, source: 'tee' as const }))
    : [];

/** The files a command's redirections and `tee`s read or write, in the order they run. */
export function redirectTargets(command: string): readonly Target[] {
  let afterCd = false;
  const targets: Target[] = [];
  for (const subcommand of scanCommand(command).commands) {
    targets.push(...redirectsIn(subcommand, afterCd), ...teeTargets(subcommand, afterCd));
    afterCd ||= subcommand.words[0]?.value === 'cd';
  }
  return targets;
}

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
export const literalOf = (word: ShellWord, paths: PathContext): string | undefined =>
  word.expands ? undefined : absolutePath(word.value, paths);

/** What the rules say about a file as the tool would see it, and whether a rule naming paths allowed it. */
function ruleSays(literal: string | undefined, tool: Direction['tool'], ctx: DecideContext) {
  if (literal === undefined) return { behavior: undefined, pathAllowed: false };
  const call = { toolName: tool, input: { file_path: literal } };
  const { behavior, rule } = evaluateRules(ctx.rules, call, ctx.match);
  // Oracle 2.1.322: a bare `Read` or `Edit` allow does not cover a Bash command's file outside.
  return { behavior, pathAllowed: behavior === 'allow' && rule?.specifier !== undefined };
}

/** `sub/..`, `/tmp/../etc`: "may follow a symlink outside the working directory" (oracle 2.1.322). */
const isName = (segment: string): boolean => segment !== '' && segment !== '.' && segment !== '..';
const traversesAfterDirectory = (text: string): boolean => {
  const segments = text.split('/');
  return segments.some((segment, at) => segment === '..' && segments.slice(0, at).some(isName));
};

/** The directory a glob operand lists (`/etc/*` is `/etc`), the operand itself otherwise. */
const listedText = (word: ShellWord): string => {
  if (!word.globs) return word.value;
  const cut = word.value.slice(0, word.value.search(/[*?[]/)).lastIndexOf('/');
  return cut < 0 ? '.' : word.value.slice(0, cut) || '/';
};

/** How a target of each source is judged (`TargetSource`). */
interface SourceJudgment {
  /** The text the rules read: an operand glob is judged by the directory it lists. */
  readonly text: (word: ShellWord) => string;
  /** Whether the text alone needs approval, before any rule; `literal` is `undefined` when it expands. */
  readonly unsure: (target: Target, literal: string | undefined) => boolean;
  /** A file outside the working directories needs approval unless a path rule allows it. */
  readonly checksOutside: boolean;
  /** An output target is checked against the protected paths. */
  readonly checksProtected: boolean;
  /** An output target in scope with no `Edit` allow is an edit, for a mode that accepts one. */
  readonly editsInScope: boolean;
}

const redirectUnsure = (target: Target, literal: string | undefined): boolean =>
  literal === undefined ||
  target.word.globs ||
  DIRECTIONS[target.kind].unsure(target.word.value, target.afterCd);

const REDIRECTED = {
  text: (word: ShellWord) => word.value,
  unsure: redirectUnsure,
  checksOutside: true,
  checksProtected: true,
} as const;

const SOURCES: { readonly [S in TargetSource]: SourceJudgment } = {
  redirect: { ...REDIRECTED, editsInScope: true },
  tee: { ...REDIRECTED, editsInScope: false },
  operand: {
    text: listedText,
    unsure: (target, literal) =>
      literal === undefined || traversesAfterDirectory(target.word.value),
    checksOutside: true,
    checksProtected: false,
    editsInScope: false,
  },
  unchecked: {
    text: (word) => word.value,
    unsure: () => false,
    checksOutside: false,
    checksProtected: false,
    editsInScope: false,
  },
};

/** The absolute file a target names as its source reads it, and what the rules and the text say of it. */
function located(target: Target, ctx: DecideContext) {
  const { paths } = ctx.match;
  const source = SOURCES[target.source];
  const literal = target.word.expands ? undefined : absolutePath(source.text(target.word), paths);
  const { behavior, pathAllowed } = ruleSays(literal, DIRECTIONS[target.kind].tool, ctx);
  const outside =
    source.checksOutside && literal !== undefined && !inScope(literal, paths) && !pathAllowed;
  return {
    literal,
    behavior,
    approval: behavior === 'ask' || source.unsure(target, literal) || outside,
  };
}

/** What one target needs: a denial, an approval, a protected write, a write in scope, or nothing. */
function judgeTarget(target: Target, ctx: DecideContext): RedirectFacts {
  const { literal, behavior, approval } = located(target, ctx);
  const source = SOURCES[target.source];
  const writes = DIRECTIONS[target.kind].checksProtected && source.checksProtected;
  const isProtected = (path: string) =>
    isProtectedPath(path, ctx.match.paths, ctx.protectedPaths ?? {});
  return {
    denied: behavior === 'deny',
    approval,
    inScopeWrite: !approval && writes && source.editsInScope && behavior !== 'allow',
    protectedWrite: writes && literal !== undefined && isProtected(literal),
  };
}

/** A path the host's symlink check resolved, outside the working directories and no path rule allowing it. */
const resolvedOutside = (path: string, ctx: DecideContext): boolean =>
  !inScope(path, ctx.match.paths) &&
  !ruleSays(path, 'Read', ctx).pathAllowed &&
  !ruleSays(path, 'Edit', ctx).pathAllowed;

/**
 * What the files a Bash command names and redirects to ask of the permission check (`targets`,
 * from `commandTargets`). Where the host's symlink check says a named file leads (`resolved`) is
 * judged as a named file outside: "Each path also goes through the symlink check".
 */
export function targetFacts(
  targets: readonly Target[],
  ctx: DecideContext,
  resolved: readonly string[] = [],
): RedirectFacts {
  const judged = targets.map((target) => judgeTarget(target, ctx));
  const names = targets.some((target) => SOURCES[target.source].checksOutside);
  return {
    denied: judged.some((fact) => fact.denied),
    approval:
      judged.some((fact) => fact.approval) ||
      (names && resolved.some((path) => resolvedOutside(path, ctx))),
    protectedWrite: judged.some((fact) => fact.protectedWrite),
    inScopeWrite: judged.some((fact) => fact.inScopeWrite),
  };
}
