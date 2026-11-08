import type { PathContext } from '../types.ts';
import { relativeWithin } from '../path/posix.ts';
import type { ProtectedPathOptions } from './context.ts';
import { posixOf } from './scope.ts';

/**
 * permission-modes.md, "Protected paths": "Protected directories" and "Protected files". A
 * directory matches wherever it sits in a path (`.git` of the project and of a nested folder);
 * `.config/git` is two segments; a file matches by its name. The lists are the docs' own.
 */
const DIRECTORIES: readonly (readonly string[])[] = [
  ['.git'],
  ['.config', 'git'],
  ['.vscode'],
  ['.idea'],
  ['.husky'],
  ['.cargo'],
  ['.devcontainer'],
  ['.yarn'],
  ['.mvn'],
];

const FILES: ReadonlySet<string> = new Set([
  '.gitconfig',
  '.gitmodules',
  '.bashrc',
  '.bash_profile',
  '.bash_login',
  '.bash_aliases',
  '.bash_logout',
  '.zshrc',
  '.zprofile',
  '.zshenv',
  '.zlogin',
  '.zlogout',
  '.profile',
  '.envrc',
  '.npmrc',
  '.yarnrc',
  '.yarnrc.yml',
  '.pnp.cjs',
  '.pnp.loader.mjs',
  '.pnpmfile.cjs',
  'bunfig.toml',
  '.bunfig.toml',
  '.bazelrc',
  '.bazelversion',
  '.bazeliskrc',
  '.pre-commit-config.yaml',
  'lefthook.yml',
  'lefthook.yaml',
  '.lefthook.yml',
  '.lefthook.yaml',
  'gradle-wrapper.properties',
  'maven-wrapper.properties',
  '.devcontainer.json',
  '.ripgreprc',
  'pyrightconfig.json',
  '.mcp.json',
  '.claude.json',
  'remote-settings.json',
]);

const CLAUDE = '.claude';

const startsAt = (segments: readonly string[], at: number, names: readonly string[]): boolean =>
  names.every((name, offset) => segments[at + offset] === name);

const hasDirectory = (segments: readonly string[]): boolean =>
  DIRECTORIES.some((names) => segments.some((_, at) => startsAt(segments, at, names)));

/** The exceptions below `.claude` that follow the session: its plan files and its memory (restricted or not). */
interface ClaudeContext {
  readonly path: string;
  /** The segments after the first `.claude`. */
  readonly rest: readonly string[];
  readonly homeClaude: string;
  readonly options: ProtectedPathOptions;
  readonly paths: PathContext;
}

const isMarkdown = (path: string): boolean => path.endsWith('.md');

/**
 * Each exception of "`.claude`, with a few exceptions": Claude's own worktrees, the session's own
 * plan files (in `~/.claude/plans/` or the `plansDirectory`), a background session's scratch
 * directory, and Markdown in the auto memory and subagent memory directories of a session started
 * without `--restricted`.
 */
const CLAUDE_EXCEPTIONS: readonly ((claude: ClaudeContext) => boolean)[] = [
  ({ rest }) => rest[0] === 'worktrees',
  ({ path, homeClaude }) => relativeWithin(`${homeClaude}/plans`, path) !== undefined,
  ({ path, options, paths }) =>
    options.plansDirectory !== undefined &&
    relativeWithin(posixOf(options.plansDirectory, paths), path) !== undefined,
  ({ path, rest, homeClaude }) =>
    relativeWithin(`${homeClaude}/jobs`, path) !== undefined && rest[2] === 'tmp',
  ({ path, rest, homeClaude, options }) =>
    options.restricted !== true &&
    isMarkdown(path) &&
    relativeWithin(`${homeClaude}/projects`, path) !== undefined &&
    rest[2] === 'memory',
  ({ path, rest, options }) =>
    options.restricted !== true && isMarkdown(path) && rest[0] === 'agent-memory',
];

function protectedByClaude(
  segments: readonly string[],
  path: string,
  paths: PathContext,
  options: ProtectedPathOptions,
): boolean {
  const at = segments.indexOf(CLAUDE);
  if (at < 0) return false;
  const claude: ClaudeContext = {
    path,
    rest: segments.slice(at + 1),
    homeClaude: `${posixOf(paths.home, paths)}/${CLAUDE}`,
    options,
    paths,
  };
  return !CLAUDE_EXCEPTIONS.some((exception) => exception(claude));
}

/**
 * Whether a write to `path` (absolute, POSIX) is a write to a protected path: a protected
 * directory or file, `.claude` apart from its exceptions, a file the session was started with
 * (`--settings`, `--mcp-config`, `--agents`, the target of a symlinked settings file) or a directory
 * loaded with `--plugin-dir`.
 */
export function isProtectedPath(
  path: string,
  paths: PathContext,
  options: ProtectedPathOptions = {},
): boolean {
  const segments = path.split('/').filter((segment) => segment !== '');
  const name = segments.at(-1) ?? '';
  const sessionFile = (options.files ?? []).some((file) => posixOf(file, paths) === path);
  const sessionDirectory = (options.directories ?? []).some(
    (directory) => relativeWithin(posixOf(directory, paths), path) !== undefined,
  );
  return (
    hasDirectory(segments) ||
    FILES.has(name) ||
    sessionFile ||
    sessionDirectory ||
    protectedByClaude(segments, path, paths, options)
  );
}
