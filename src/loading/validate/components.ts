import {
  COMPONENT_KINDS,
  frontmatterFindings,
  type ComponentKind,
} from '../../format/validate/component-frontmatter.ts';
import { inFile, type ValidationIssue } from '../../format/validate/finding.ts';
import type { PluginFiles } from '../../ports/index.ts';
import { linkedEntries, linkedFolder, unreadComponents, type FolderStyle } from './links.ts';
import { childOf, entriesOf, pluginPath } from './paths.ts';

/**
 * The Markdown components `claude plugin validate` reads (oracle 2.1.319): each skill folder's
 * `SKILL.md`, and every `.md` below `agents/` and `commands/` at any depth. Paths the manifest
 * declares are not read for frontmatter. A link is never followed: the folder or entry is skipped,
 * and a skills folder says so.
 */
const SKILL_FILE = 'SKILL.md';
const isMarkdown = (name: string): boolean => name.toLowerCase().endsWith('.md');

/** The strings of a manifest key: one path, or the paths of a list. */
export function manifestPaths(value: unknown): string[] {
  if (typeof value === 'string') return [pluginPath(value)];
  return Array.isArray(value)
    ? value.flatMap((entry) => (typeof entry === 'string' ? [pluginPath(entry)] : []))
    : [];
}

/** What a scan of one folder found: the files to read and what it has to say about links. */
export interface Scan {
  readonly files: readonly string[];
  readonly issues: readonly ValidationIssue[];
}

/** The `SKILL.md` of each skill folder directly below `dir`, and the links among them. */
export async function scanSkillFolders(
  files: PluginFiles,
  dir: string,
  style: FolderStyle,
  signal?: AbortSignal,
): Promise<Scan> {
  if ((await files.stat(dir, signal))?.isSymlink === true) {
    return { files: [], issues: [linkedFolder(dir)] };
  }
  const found: string[] = [];
  let links = 0;
  let unread = 0;
  for (const entry of await entriesOf(files, dir, signal)) {
    const path = childOf(dir, entry.name);
    if ((await files.stat(path, signal))?.isSymlink === true) {
      links += 1;
      continue;
    }
    if (!entry.isDirectory) continue;
    const skill = await files.stat(childOf(path, SKILL_FILE), signal);
    if (skill === undefined) continue;
    if (skill.isFile && !skill.isSymlink) found.push(childOf(path, SKILL_FILE));
    else unread += 1;
  }
  return {
    files: found,
    issues: [...linkedEntries(dir, links, style), ...unreadComponents(dir, unread, style)],
  };
}

/** The Markdown files below a folder at any depth, links left alone; `style` decides whether they are counted. */
export async function scanMarkdownFolder(
  files: PluginFiles,
  dir: string,
  style: FolderStyle,
  signal?: AbortSignal,
): Promise<Scan> {
  if ((await files.stat(dir, signal))?.isSymlink === true) {
    return { files: [], issues: [linkedFolder(dir)] };
  }
  const found: string[] = [];
  let links = 0;
  for (const entry of await entriesOf(files, dir, signal)) {
    const path = childOf(dir, entry.name);
    if ((await files.stat(path, signal))?.isSymlink === true) {
      links += 1;
      continue;
    }
    if (entry.isFile && isMarkdown(entry.name)) found.push(path);
    if (entry.isDirectory)
      found.push(...(await scanMarkdownFolder(files, path, style, signal)).files);
  }
  return { files: found, issues: style === 'project' ? linkedEntries(dir, links, style) : [] };
}

const DEFAULT_DIR: { readonly [K in ComponentKind]: string } = {
  skill: 'skills',
  agent: 'agents',
  command: 'commands',
};

/** The scan of the default folder of one kind: skill folders, or Markdown files at any depth. */
const scanDefault = (
  kind: ComponentKind,
  files: PluginFiles,
  signal?: AbortSignal,
): Promise<Scan> =>
  kind === 'skill'
    ? scanSkillFolders(files, DEFAULT_DIR[kind], 'plugin', signal)
    : scanMarkdownFolder(files, DEFAULT_DIR[kind], 'plugin', signal);

/** The frontmatter findings of the files of a scan. */
export async function frontmatterIssues(
  kind: ComponentKind,
  files: PluginFiles,
  paths: readonly string[],
  signal?: AbortSignal,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  for (const path of paths) {
    const text = await files.readText(path, signal);
    if (text !== undefined) issues.push(...inFile(path, frontmatterFindings(kind, text)));
  }
  return issues;
}

/** Link warnings and frontmatter findings of every skill, agent and command file, kind by kind. */
export async function componentIssues(
  files: PluginFiles,
  signal?: AbortSignal,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  for (const kind of COMPONENT_KINDS) {
    const scan = await scanDefault(kind, files, signal);
    issues.push(...scan.issues, ...(await frontmatterIssues(kind, files, scan.files, signal)));
  }
  return issues;
}
