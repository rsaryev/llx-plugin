import type { PathContext, RuleSource } from '../types.ts';
import { dirnameOf, normalizeAbsolute, resolvePath, toPosixPath } from './posix.ts';

/**
 * The four pattern types of permissions.md ("How path patterns match"): `//path` is an absolute path
 * from the filesystem root, `~/path` is from the home directory, `/path` is relative to the settings
 * source, and `path` or `./path` is relative to the current directory. Each anchor is a root
 * directory; the registry below is typed over the ids, so a fifth type fails the typecheck here.
 */
export const ANCHORS = ['root', 'home', 'source', 'cwd'] as const;
export type AnchorId = (typeof ANCHORS)[number];

/** A path pattern as written: its anchor, the gitignore text after the prefix, and whether it is a `!`. */
export interface PathSpecifier {
  readonly anchor: AnchorId;
  readonly pattern: string;
  readonly negated: boolean;
}

/** The prefixes that anchor a pattern, longest first. */
const PREFIXES: readonly (readonly [string, AnchorId])[] = [
  ['//', 'root'],
  ['~/', 'home'],
  ['/', 'source'],
];

/**
 * A deny or ask pattern that starts with `!` is a negation. "Claude Code reads a `!` pattern relative
 * to the current directory even when `/`, `~/`, or `//` follows the `!`", so its text is kept whole.
 */
export function readPathSpecifier(text: string): PathSpecifier {
  const negated = text.startsWith('!');
  const body = negated ? text.slice(1) : text;
  if (negated) return { anchor: 'cwd', pattern: body, negated };
  const prefix = PREFIXES.find(([lead]) => body.startsWith(lead));
  if (prefix !== undefined)
    return { anchor: prefix[1], pattern: body.slice(prefix[0].length), negated };
  return { anchor: 'cwd', pattern: body.startsWith('./') ? body.slice(2) : body, negated };
}

/**
 * Where a `/path` pattern anchors, per settings source (permissions.md, "Where a pattern anchors"):
 * project, local, CLI and session rules at the primary working directory, user settings at
 * `~/.claude`, a `--settings <file>` at the directory of that file. The managed tiers are not in the
 * table; they anchor at the primary working directory like the command line (a judgment).
 */
const SOURCE_ROOTS: {
  readonly [K in RuleSource['kind']]: (source: RuleSource, paths: PathContext) => string;
} = {
  project: (_, paths) => primaryDirectory(paths),
  local: (_, paths) => primaryDirectory(paths),
  user: (_, paths) => `${home(paths)}/.claude`,
  'flag-settings': (source, paths) => dirnameOf(flagSettingsFile(source, paths)),
  cli: (_, paths) => primaryDirectory(paths),
  session: (_, paths) => primaryDirectory(paths),
  managed: (_, paths) => primaryDirectory(paths),
  'embedder-managed': (_, paths) => primaryDirectory(paths),
};

const folder = (path: string, paths: PathContext): string =>
  normalizeAbsolute(toPosixPath(path, paths.platform));
const primaryDirectory = (paths: PathContext): string =>
  folder(paths.primaryWorkingDirectory, paths);
const home = (paths: PathContext): string => {
  const directory = folder(paths.home, paths);
  return directory === '/' ? '' : directory;
};

function flagSettingsFile(source: RuleSource, paths: PathContext): string {
  const file = 'file' in source ? source.file : paths.primaryWorkingDirectory;
  return resolvePath(primaryDirectory(paths), toPosixPath(file, paths.platform));
}

const ANCHOR_ROOTS: {
  readonly [A in AnchorId]: (source: RuleSource, paths: PathContext) => string;
} = {
  root: () => '/',
  home: (_, paths) => home(paths) || '/',
  source: (source, paths) => SOURCE_ROOTS[source.kind](source, paths) || '/',
  cwd: (_, paths) => folder(paths.cwd, paths),
};

/** A pattern placed under a directory: the gitignore text is relative to `root`. */
export interface Anchored {
  readonly root: string;
  readonly pattern: string;
  /** Whether the pattern is the current directory's own (no `/`, `~/`, `//` and no `../` climb). */
  readonly underCwd: boolean;
}

const CLIMB = /^\.\.\//;

export function anchorPattern(
  specifier: PathSpecifier,
  source: RuleSource,
  paths: PathContext,
): Anchored {
  let root = ANCHOR_ROOTS[specifier.anchor](source, paths);
  let { pattern } = specifier;
  let climbed = false;
  // A relative pattern may name a parent (`../shared/**`); the docs are silent, so it is resolved
  // against the current directory like any relative path (spec/judgments.md).
  while (specifier.anchor === 'cwd' && CLIMB.test(pattern)) {
    root = dirnameOf(root);
    pattern = pattern.slice(3);
    climbed = true;
  }
  // `//`, `~/` and `/` patterns are paths from their root: gitignore anchors them with a slash.
  const text = specifier.anchor === 'cwd' ? pattern : `/${pattern}`;
  return { root, pattern: text, underCwd: specifier.anchor === 'cwd' && !climbed };
}
