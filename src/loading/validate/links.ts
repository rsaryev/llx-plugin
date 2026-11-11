import { warningIn, type ValidationIssue } from '../../format/validate/finding.ts';
import type { PluginFiles } from '../../ports/index.ts';

/**
 * What the validator says about links (oracle 2.1.319). It never follows a symlink: a folder that
 * is one is not read, an entry that is one is not read, and each warns, because Claude Code does
 * follow them in some places. A plugin's own folders and a project's `.claude` folders word it
 * differently, for a session always follows the links of a project it loads.
 */
export const FOLDER_STYLES = ['plugin', 'project'] as const;
export type FolderStyle = (typeof FOLDER_STYLES)[number];

const INSTALLED_FOLLOWS =
  "inside the plugin's installed folder, or, for a plugin read in place from a local marketplace folder, inside that folder; a project's .claude/skills plugin, only if it points inside the folder holding that .claude.";

const FOLDER_LINK = `This directory is a symlink, so the validator read nothing in it. An installed plugin loads it only if it points ${INSTALLED_FOLLOWS} Otherwise replace the link with a copy of the folder. To check its files, validate the folder it points to.`;

const FOLLOWED_AT: { readonly [S in FolderStyle]: string } = {
  plugin: `A session started with --plugin-dir on this plugin follows a symlink here. An installed plugin follows one only if it points ${INSTALLED_FOLLOWS} To check what a symlink points to, validate that path.`,
  project:
    'A session loading this directory does follow them, so validate the real paths separately.',
};

const NOT_REGULAR =
  'the path is not a regular file (a symlink, a FIFO, a directory). A FIFO or a directory is never read.';

export const isLink = async (
  files: PluginFiles,
  path: string,
  signal?: AbortSignal,
): Promise<boolean> => (await files.stat(path, signal))?.isSymlink === true;

/** A folder that is itself a link: nothing in it is read. */
export const linkedFolder = (folder: string): ValidationIssue =>
  warningIn(folder, 'directory', FOLDER_LINK);

const plural = (count: number, one: string, many: string): string => (count === 1 ? one : many);

/** The entries of a folder that are links and were skipped: "3 entries here are symlinks …". */
export function linkedEntries(
  folder: string,
  count: number,
  style: FolderStyle,
): ValidationIssue[] {
  if (count === 0) return [];
  const noun = plural(
    count,
    'entry here is a symlink and was',
    'entries here are symlinks and were',
  );
  const message = `${count} ${noun} not read — components are read without following symlinks. ${FOLLOWED_AT[style]}`;
  return [warningIn(folder, 'directory', message)];
}

/** Skill files that exist but are not regular files: "1 component here was not read — …". */
export function unreadComponents(
  folder: string,
  count: number,
  style: FolderStyle,
): ValidationIssue[] {
  if (count === 0) return [];
  const noun = plural(count, 'component here was', 'components here were');
  const message = `${count} ${noun} not read — ${NOT_REGULAR} ${FOLLOWED_AT[style]}`;
  return [warningIn(folder, 'directory', message)];
}

const CAP = 'are read without following symlinks and are capped at 1048576 bytes.';

/** The hooks folder is a link, or `hooks.json` is not a regular file. */
export const HOOKS_LINK = {
  folder: `The hooks directory is a link (a symlink or a Windows junction) and was not read — hooks ${CAP} The plugin loader has neither limit and fails the whole plugin on bad hook config, so validate the real file separately.`,
  file: `hooks.json is not a regular file (a symlink, a FIFO, a directory) — hooks ${CAP} The plugin loader has neither limit and fails the whole plugin on bad hook config, so validate the real file separately.`,
} as const;

export const MCP_NOT_REGULAR = `The file is not a regular file (a symlink, a FIFO, a directory) and was not read — MCP server files ${CAP} The plugin loader has neither limit, so validate the real file separately.`;
