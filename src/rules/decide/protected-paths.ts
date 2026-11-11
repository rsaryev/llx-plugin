import type { PathContext } from '../types.ts';
import { foldPath, relativeWithin } from '../path/posix.ts';
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

/** The names of `path`, as the platform compares them (`foldPath`). */
const segmentsOf = (path: string, paths: PathContext): readonly string[] =>
  foldPath(path, paths.platform)
    .split('/')
    .filter((segment) => segment !== '');

/** Whether a host path and a kit path are the same file on the platform. */
const samePath = (file: string, path: string, paths: PathContext): boolean =>
  relativeWithin(posixOf(file, paths), path, paths.platform) === '';

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
const OWN_FILES: readonly ((claude: ClaudeContext) => boolean)[] = [
  ({ path, homeClaude, paths }) =>
    relativeWithin(`${homeClaude}/plans`, path, paths.platform) !== undefined,
  ({ path, options, paths }) =>
    options.plansDirectory !== undefined &&
    relativeWithin(posixOf(options.plansDirectory, paths), path, paths.platform) !== undefined,
  ({ path, rest, homeClaude, paths }) =>
    relativeWithin(`${homeClaude}/jobs`, path, paths.platform) !== undefined && rest[2] === 'tmp',
  ({ path, rest, homeClaude, options, paths }) =>
    options.restricted !== true &&
    isMarkdown(path) &&
    relativeWithin(`${homeClaude}/projects`, path, paths.platform) !== undefined &&
    rest[2] === 'memory',
  ({ path, rest, options }) =>
    options.restricted !== true && isMarkdown(path) && rest[0] === 'agent-memory',
];

const CLAUDE_EXCEPTIONS: readonly ((claude: ClaudeContext) => boolean)[] = [
  ({ rest }) => rest[0] === 'worktrees',
  ...OWN_FILES,
];

/** Where Claude Code keeps its own files: `~/.claude`, or the directory `CLAUDE_CONFIG_DIR` points to. */
export const configDirectoryOf = (paths: PathContext, options: ProtectedPathOptions): string =>
  options.configDirectory === undefined
    ? `${posixOf(paths.home, paths)}/${CLAUDE}`
    : posixOf(options.configDirectory, paths);

/** The segments of `path` below the configuration directory, or below the first `.claude`, or none. */
function restOf(
  segments: readonly string[],
  path: string,
  configDirectory: string,
  paths: PathContext,
): readonly string[] {
  const below = relativeWithin(configDirectory, path, paths.platform);
  if (below !== undefined) return below.split('/').filter((segment) => segment !== '');
  const at = segments.indexOf(CLAUDE);
  return at < 0 ? [] : segments.slice(at + 1);
}

function claudeContext(
  segments: readonly string[],
  path: string,
  paths: PathContext,
  options: ProtectedPathOptions,
): ClaudeContext {
  const homeClaude = configDirectoryOf(paths, options);
  return { path, rest: restOf(segments, path, homeClaude, paths), homeClaude, options, paths };
}

/**
 * Whether `path` is one of Claude Code's own files for the session: its plan files, a background
 * session's scratch directory, and Markdown in the auto memory and subagent memory directories (the
 * files the write block leaves writable, settings-reference.md, "What the write block refuses and
 * what stays writable"). The kit cannot tell the session's own plan file from another one (spec/judgments.md).
 */
export function isOwnFile(
  path: string,
  paths: PathContext,
  options: ProtectedPathOptions,
): boolean {
  const segments = segmentsOf(path, paths);
  const claude = claudeContext(segments, path, paths, options);
  return OWN_FILES.some((exception) => exception(claude));
}

function protectedByClaude(
  segments: readonly string[],
  path: string,
  paths: PathContext,
  options: ProtectedPathOptions,
): boolean {
  if (segments.indexOf(CLAUDE) < 0) return false;
  const claude = claudeContext(segments, path, paths, options);
  return !CLAUDE_EXCEPTIONS.some((exception) => exception(claude));
}

/** "`~/.claude/dev-mods/`, or `dev-mods/` in the directory `CLAUDE_CONFIG_DIR` points to". */
const inDevMods = (path: string, paths: PathContext, options: ProtectedPathOptions): boolean =>
  relativeWithin(`${configDirectoryOf(paths, options)}/dev-mods`, path, paths.platform) !==
  undefined;

/**
 * Whether `path` is the target of a symlinked settings file (`options.symlinkTargets`) and is not
 * protected for another reason: "If the file's own path is also that of a settings file ... the write
 * goes to the classifier as other protected-path writes do".
 */
export function isSymlinkTargetOnly(
  path: string,
  paths: PathContext,
  options: ProtectedPathOptions,
): boolean {
  const target = (options.symlinkTargets ?? []).some((file) => samePath(file, path, paths));
  return target && !isProtectedPath(path, paths, options);
}

/**
 * Whether a write to `path` (absolute, POSIX) is a write to a protected path: a protected
 * directory or file, `.claude` apart from its exceptions, a file the session was started with
 * (`--settings`, `--mcp-config`, `--agents`), a directory loaded with `--plugin-dir`, or `dev-mods`.
 * The target of a symlinked settings file is `isSymlinkTargetOnly`.
 */
export function isProtectedPath(
  path: string,
  paths: PathContext,
  options: ProtectedPathOptions = {},
): boolean {
  const segments = segmentsOf(path, paths);
  const name = segments.at(-1) ?? '';
  const sessionFile = (options.files ?? []).some((file) => samePath(file, path, paths));
  const sessionDirectory = (options.directories ?? []).some(
    (directory) => relativeWithin(posixOf(directory, paths), path, paths.platform) !== undefined,
  );
  return (
    hasDirectory(segments) ||
    FILES.has(name) ||
    sessionFile ||
    sessionDirectory ||
    inDevMods(path, paths, options) ||
    protectedByClaude(segments, path, paths, options)
  );
}
