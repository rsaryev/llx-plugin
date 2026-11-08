import { readCommand } from '../../format/command.ts';
import { blocksLoading, type PluginIssue } from '../../format/issues.ts';
import { readSkill } from '../../format/skill.ts';
import type { Command, Skill } from '../../format/skill-types.ts';
import { listChildren, walkFiles } from '../../foundation/folder-walk.ts';
import type { ScanFolder } from '../../ports/folder-scan.ts';
import {
  SCANNED_SCOPES,
  SCOPE_RULES,
  type ScanContext,
  type ScanScope,
  type ScopeRule,
} from './locations.ts';

/**
 * Reads the skills and command files of the scope folders through the `FolderScan` port (skills.md,
 * "Choose where skills load", "How a skill gets its command name"): `<base>/.claude/skills/<name>/SKILL.md`
 * and the flat `<base>/.claude/commands/**.md`. Nothing is resolved here: two skills of one name are
 * both returned, with the scope each came from, for `resolveFolderSkills` to decide.
 */

export interface ScannedEntry {
  readonly invocable: Skill | Command;
  readonly scope: ScanScope;
  /** The skill folder's name, or the command's name: the other name a skill is typed by. */
  readonly dirName: string;
  /** The base directory the entry was read below. */
  readonly base: string;
  /** Where the folder (or file) really lives; two entries with one target are one skill. */
  readonly canonical?: string;
}

/** A skill folder that is also a plugin, `<name>@skills-dir` (skills.md, "Skill folder as a plugin"). */
export interface SkillsDirectoryPlugin {
  readonly id: string;
  /** The plugin's name: its manifest's, else its folder's. */
  readonly name: string;
  /** The folder's host path; `FolderScan.open` gives the files to load it with. */
  readonly dir: string;
  readonly scope: ScanScope;
  /** A project's plugin loads only after the workspace trust dialog is accepted. */
  readonly requiresTrust: boolean;
}

export interface ScanOutcome {
  readonly entries: readonly ScannedEntry[];
  readonly plugins: readonly SkillsDirectoryPlugin[];
  readonly issues: readonly PluginIssue[];
  /** The skills folders the session watches for changes (those that exist). */
  readonly watch: readonly string[];
}

const EMPTY: ScanOutcome = { entries: [], plugins: [], issues: [], watch: [] };

const SKILL_FILE = 'SKILL.md';
const PLUGIN_MANIFEST = '.claude-plugin/plugin.json';
/** Where Claude Code moves the skill folders it removes; they stay out of every scan (skills.md, "Personal skills disappeared"). */
const TRASH = '.trash';

const merge = (parts: readonly ScanOutcome[]): ScanOutcome => ({
  entries: parts.flatMap((part) => part.entries),
  plugins: parts.flatMap((part) => part.plugins),
  issues: parts.flatMap((part) => part.issues),
  watch: parts.flatMap((part) => part.watch),
});

interface Where {
  readonly context: ScanContext;
  readonly rule: ScopeRule;
  readonly scope: ScanScope;
  readonly folder: ScanFolder;
  readonly index: number;
}

/** The manifest's `name` when it reads, else the folder's. Reading never fails the scan. */
async function pluginName(where: Where, directory: string, fallback: string): Promise<string> {
  const text = await where.folder.files.readText(
    `${directory}/${PLUGIN_MANIFEST}`,
    where.context.signal,
  );
  try {
    const parsed: unknown = text === undefined ? undefined : JSON.parse(text);
    const name =
      parsed !== null && typeof parsed === 'object' ? Reflect.get(parsed, 'name') : undefined;
    return typeof name === 'string' && name !== '' ? name : fallback;
  } catch {
    return fallback;
  }
}

async function pluginOf(where: Where, directory: string, name: string) {
  const { folder, context, scope, rule } = where;
  if (!rule.pluginsAt(where.index)) return [];
  if (!(await folder.files.exists(`${directory}/${PLUGIN_MANIFEST}`, context.signal))) return [];
  const pluginNamed = await pluginName(where, directory, name);
  return [
    {
      id: `${pluginNamed}@skills-dir`,
      name: pluginNamed,
      dir: folder.hostPath(directory),
      scope,
      requiresTrust: scope === 'project',
    } satisfies SkillsDirectoryPlugin,
  ];
}

async function readSkillFolder(where: Where, name: string, path: string, canonical?: string) {
  const { folder, context, rule, scope } = where;
  const file = `${path}/${SKILL_FILE}`;
  const text = await folder.files.readText(file, context.signal);
  const plugins = await pluginOf(where, path, name);
  if (text === undefined) return { ...EMPTY, plugins };
  const read = readSkill(folder.hostPath(file), text, { origin: rule.origin, dirName: name });
  const loads = !blocksLoading(read.issues);
  const entry: ScannedEntry = {
    invocable: read.skill,
    scope,
    dirName: name,
    base: folder.dir,
    ...(canonical === undefined ? {} : { canonical }),
  };
  return { ...EMPTY, entries: loads ? [entry] : [], plugins, issues: read.issues };
}

/** `.claude/skills/<name>/SKILL.md`: one level, a folder (or a link to one) per skill. */
async function readSkills(where: Where, container: string): Promise<ScanOutcome> {
  const listed = await listChildren(where.folder, container, where.context.signal);
  const folders = listed.found.filter((child) => child.isDirectory && child.name !== TRASH);
  const parts = await Promise.all(
    folders.map((child) => readSkillFolder(where, child.name, child.path, child.canonical)),
  );
  const found = merge(parts);
  return { ...found, issues: [...listed.issues, ...found.issues] };
}

/** What one command file gave. */
interface CommandRead {
  readonly entries: readonly ScannedEntry[];
  readonly issues: readonly PluginIssue[];
}

/** `.claude/commands/<path>.md`: the file name, and each folder before it joined by `:`. */
async function readCommands(where: Where, container: string): Promise<ScanOutcome> {
  const { folder, context, rule, scope } = where;
  const walked = await walkFiles(folder, container, {
    extension: '.md',
    ...(context.signal === undefined ? {} : { signal: context.signal }),
  });
  const reads = await Promise.all(
    walked.found.map(async (file): Promise<CommandRead> => {
      const text = await folder.files.readText(file.path, context.signal);
      if (text === undefined) return { issues: [], entries: [] };
      const relativePath = file.segments.join('/');
      const read = readCommand(folder.hostPath(file.path), text, {
        origin: rule.origin,
        relativePath,
      });
      const entries: ScannedEntry[] =
        read.command === undefined
          ? []
          : [
              {
                invocable: read.command,
                scope,
                dirName: read.command.name,
                base: folder.dir,
                ...(file.canonical === undefined ? {} : { canonical: file.canonical }),
              },
            ];
      return { entries, issues: read.issues };
    }),
  );
  return {
    ...EMPTY,
    entries: reads.flatMap((read) => read.entries),
    issues: [...walked.issues, ...reads.flatMap((read) => read.issues)],
  };
}

type Container = NonNullable<ScopeRule['skills']>;

/** The container a source loads from, unless `strictPluginOnlyCustomization` stops that source. */
const allowedContainer = (context: ScanContext, container: Container | undefined) =>
  container !== undefined && (context.allows?.(container.origin) ?? true) ? container : undefined;

async function scanBase(
  context: ScanContext,
  scope: ScanScope,
  base: string,
  index: number,
): Promise<ScanOutcome> {
  const rule = SCOPE_RULES[scope];
  const folder = await context.folders.open(base, context.signal);
  if (folder === undefined) return EMPTY;
  const where: Where = { context, rule, scope, folder, index };
  const skills = allowedContainer(context, rule.skills);
  const commands = allowedContainer(context, rule.commands);
  const parts = await Promise.all([
    skills === undefined ? EMPTY : readSkills(where, skills.folder),
    commands === undefined ? EMPTY : readCommands(where, commands.folder),
  ]);
  const watching =
    skills !== undefined &&
    rule.watched &&
    (await folder.files.exists(skills.folder, context.signal));
  return { ...merge(parts), watch: watching ? [folder.hostPath(skills.folder)] : [] };
}

/** One scope: every base directory of it, in order. */
export async function scanScope(context: ScanContext, scope: ScanScope): Promise<ScanOutcome> {
  const bases = await SCOPE_RULES[scope].bases(context);
  const parts: ScanOutcome[] = [];
  for (const [index, base] of bases.entries()) {
    parts.push(await scanBase(context, scope, base, index));
  }
  return merge(parts);
}

/**
 * Every scope of a session, in precedence order: managed, personal, project (the working directory
 * and its parents), the added directories, and the skills synced from claude.ai. The skills below
 * the working directory are `scanNested`'s, as the session touches files there.
 */
export async function scanFolders(context: ScanContext): Promise<ScanOutcome> {
  const parts = await Promise.all(SCANNED_SCOPES.map((scope) => scanScope(context, scope)));
  return merge(parts);
}
