import {
  CLAUDE_FOLDER,
  placePath,
  scopeFoldersOf,
  watchedFolder,
  type ScopePlace,
} from '../../foundation/scope-folders.ts';
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
import { readJson } from '../../format/read-json.ts';
import { isRecord } from '../../protocol/is-record.ts';

export type { ScanOutcome, ScannedEntry, SkillsDirectoryPlugin } from './scan-types.ts';

/**
 * Reads the skills and command files of the scope folders through the `FolderScan` port (skills.md,
 * "Choose where skills load", "How a skill gets its command name"): `<base>/.claude/skills/<name>/SKILL.md`
 * and the flat `<base>/.claude/commands/**.md`, then the same below each extra scope folder the host
 * names (`ScopeContext.extraScopeFolders`). Nothing is resolved here: two skills of one name are
 * both returned, with the scope each came from, for `resolveFolderSkills` to decide. Entries carry no
 * body (`ScannedEntry.readBody` reads it when the skill runs).
 */

const PLUGIN_MANIFEST = '.claude-plugin/plugin.json';

/** The manifest's `name` when it reads, else the folder's. Reading never fails the scan. */
async function pluginName(where: Where, directory: string, fallback: string): Promise<string> {
  const read = await readJson(
    where.folder.files,
    `${directory}/${PLUGIN_MANIFEST}`,
    where.context.signal,
  );
  const name = 'value' in read && isRecord(read.value) ? read.value['name'] : undefined;
  return typeof name === 'string' && name !== '' ? name : fallback;
}

async function pluginOf(
  where: Where,
  name: string,
  directory: string,
): Promise<readonly SkillsDirectoryPlugin[]> {
  const { folder, context, scope, rule } = where;
  // "Skill folder as a plugin" names the `.claude` skills folders only.
  if (!where.place.documented || !rule.pluginsAt(where.place.index)) return [];
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
  place: ScopePlace,
): Promise<ScanOutcome> {
  const rule = SCOPE_RULES[scope];
  const folder = await context.folders.open(place.base, context.signal);
  if (folder === undefined) return EMPTY;
  const where: Where = { context, rule, scope, folder, place };
  const skills = allowedContainer(context, rule.skills);
  const commands = allowedContainer(context, rule.commands);
  const skillsPath = skills && placePath(place, skills.folder);
  const parts = await Promise.all([
    skillsPath === undefined
      ? EMPTY
      : readSkills(where, skillsPath, (name, path) => pluginOf(where, name, path)),
    commands === undefined ? EMPTY : readCommands(where, placePath(place, commands.folder)),
  ]);
  const watch =
    skillsPath === undefined
      ? []
      : await watchedFolder(folder, skillsPath, {
          watched: rule.watched,
          signal: context.signal,
        });
  return { ...merge(parts), watch };
}

/**
 * One scope: every base directory of it, in order, below `.claude` and then below each of the host's
 * extra folders (`scopeFoldersOf`), so an extra folder's entries come after every `.claude` entry of
 * the scope and lose a shared name to them.
 */
export async function scanScope(context: ScanContext, scope: ScanScope): Promise<ScanOutcome> {
  const rule = SCOPE_RULES[scope];
  const roots = rule.extraFolders ? scopeFoldersOf(context) : [CLAUDE_FOLDER];
  const parts: ScanOutcome[] = [];
  for (const place of await rule.places(context, roots)) {
    parts.push(await scanBase(context, scope, place));
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
