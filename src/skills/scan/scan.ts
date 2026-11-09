import {
  SCANNED_SCOPES,
  SCOPE_RULES,
  type ScanContext,
  type ScanScope,
  type ScopeRule,
} from './locations.ts';
import { readCommands, readSkills } from './read.ts';
import {
  EMPTY,
  merge,
  type ScanOutcome,
  type SkillsDirectoryPlugin,
  type Where,
} from './scan-types.ts';

export type { ScanOutcome, ScannedEntry, SkillsDirectoryPlugin } from './scan-types.ts';

/**
 * Reads the skills and command files of the scope folders through the `FolderScan` port (skills.md,
 * "Choose where skills load", "How a skill gets its command name"): `<base>/.claude/skills/<name>/SKILL.md`
 * and the flat `<base>/.claude/commands/**.md`. Nothing is resolved here: two skills of one name are
 * both returned, with the scope each came from, for `resolveFolderSkills` to decide. Entries carry no
 * body (`ScannedEntry.readBody` reads it when the skill runs).
 */

const PLUGIN_MANIFEST = '.claude-plugin/plugin.json';

/** The manifest's `name` when it reads, else the folder's. Reading never fails the scan. */
async function pluginName(where: Where, directory: string, fallback: string): Promise<string> {
  try {
    const text = await where.folder.files.readText(
      `${directory}/${PLUGIN_MANIFEST}`,
      where.context.signal,
    );
    const parsed: unknown = text === undefined ? undefined : JSON.parse(text);
    const name =
      parsed !== null && typeof parsed === 'object' ? Reflect.get(parsed, 'name') : undefined;
    return typeof name === 'string' && name !== '' ? name : fallback;
  } catch {
    return fallback;
  }
}

async function pluginOf(
  where: Where,
  name: string,
  directory: string,
): Promise<readonly SkillsDirectoryPlugin[]> {
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
    },
  ];
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
    skills === undefined
      ? EMPTY
      : readSkills(where, skills.folder, (name, path) => pluginOf(where, name, path)),
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
