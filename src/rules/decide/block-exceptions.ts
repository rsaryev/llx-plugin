import type { PathContext } from '../types.ts';
import { relativeWithin } from '../path/posix.ts';
import type { DecideContext } from './context.ts';
import { configDirectoryOf, isOwnFile } from './protected-paths.ts';
import { inScope, posixOf } from './scope.ts';

/**
 * The read and write blocks (settings-reference.md, `permissions.blockReadsOutsideWorkingDirectories`
 * and `permissions.blockWritesOutsideWorkingDirectories`): what they refuse and the files Claude
 * Code itself needs, which stay open.
 */

const SETTINGS_NAMES: ReadonlySet<string> = new Set([
  'settings.json',
  'settings.local.json',
  'managed-settings.json',
]);

/**
 * "Claude Code settings files": `settings.json` and `settings.local.json` in a `.claude` directory
 * (project, local and user scope), in the configuration directory, and the managed settings file.
 * The write block refuses these "inside the working directories too, because a settings file can
 * lift the block". The list is the kit's reading (spec/judgments.md).
 */
function isSettingsFile(path: string, paths: PathContext, ctx: DecideContext): boolean {
  const segments = path.split('/').filter((segment) => segment !== '');
  const name = segments.at(-1) ?? '';
  const parent = segments.at(-2);
  if (!SETTINGS_NAMES.has(name)) return false;
  const configured = configDirectoryOf(paths, ctx.protectedPaths ?? {});
  return (
    parent === '.claude' || name === 'managed-settings.json' || path === `${configured}/${name}`
  );
}

/** The directories of the configuration directory that "Files Claude Code itself needs" are read from. */
const READ_DIRECTORIES: readonly string[] = ['skills', 'plugins', 'rules', 'agents', 'commands'];

const inSessionDirectory = (path: string, ctx: DecideContext): boolean =>
  (ctx.sessionDirectories ?? []).some(
    (directory) => relativeWithin(posixOf(directory, ctx.match.paths), path) !== undefined,
  );

/**
 * Whether the read block leaves `path` readable although it is outside the working directories:
 * "your skills, plugins, rules, agents, commands, and the `CLAUDE.md` memory file under `~/.claude/`",
 * and the session's own directories.
 */
function readableUnderBlock(path: string, ctx: DecideContext): boolean {
  const configured = configDirectoryOf(ctx.match.paths, ctx.protectedPaths ?? {});
  const below = relativeWithin(configured, path);
  const top = below?.split('/')[0];
  const own = top !== undefined && (top === 'CLAUDE.md' || READ_DIRECTORIES.includes(top));
  return own || inSessionDirectory(path, ctx);
}

/**
 * Whether the write block leaves `path` writable although it is outside the working directories:
 * "plan files, the scratchpad, a background session's `tmp` directory, and `.md` files in this
 * project's auto memory".
 */
const writableUnderBlock = (path: string, ctx: DecideContext): boolean =>
  isOwnFile(path, ctx.match.paths, ctx.protectedPaths ?? {}) || inSessionDirectory(path, ctx);

/**
 * The working directories as the blocks count them: a directory that only repository settings add
 * "doesn't count" (settings-reference.md, `permissions.blockReadsOutsideWorkingDirectories`).
 */
export function blockPaths(ctx: DecideContext): PathContext {
  const { paths } = ctx.match;
  const excluded = (ctx.repositoryDirectories ?? []).map((directory) => posixOf(directory, paths));
  if (excluded.length === 0) return paths;
  return {
    ...paths,
    additionalDirectories: paths.additionalDirectories.filter(
      (directory) => !excluded.includes(posixOf(directory, paths)),
    ),
  };
}

/** Why the write block refuses `paths`, or `undefined` when it lets them through. */
export function writeBlockReason(
  paths: readonly string[],
  ctx: DecideContext,
): 'settings-file' | 'outside-working-directory' | undefined {
  if (ctx.blockWritesOutsideWorkingDirectories !== true) return undefined;
  if (paths.some((path) => isSettingsFile(path, ctx.match.paths, ctx))) return 'settings-file';
  const counted = blockPaths(ctx);
  const outside = paths.some((path) => !inScope(path, counted) && !writableUnderBlock(path, ctx));
  return outside ? 'outside-working-directory' : undefined;
}

/** Whether the read block refuses a read of `paths`. */
export const readBlocked = (paths: readonly string[], ctx: DecideContext): boolean =>
  ctx.blockReadsOutsideWorkingDirectories === true &&
  paths.some((path) => !inScope(path, blockPaths(ctx)) && !readableUnderBlock(path, ctx));
