/**
 * Whether a folder is a plugin (plugins/loading.md, "Find where a plugin came from"; plugins/
 * manifest-reference.md, "Standard layout"; plugins/create.md, "Plugin layout" and "Name the plugin's
 * skills"; skills.md, "Skill folder as a plugin"): the probe a host runs over a folder of a skills
 * directory (`@skills-dir`) or one handed to `--plugin-dir` (`@inline`). It reads the folder through
 * `PluginFiles` and decides; loading the plugin stays `loadPlugin`'s.
 */
import { componentsAt, type ComponentKind } from '../format/layout.ts';
import type { PluginIssue } from '../format/issues.ts';
import { nameLoadIssues } from '../format/names.ts';
import { readSkill } from '../format/skill.ts';
import type { SkillOrigin } from '../format/skill-types.ts';
import type { PluginFiles } from '../ports/files.ts';
import { loadManifest } from './load-plugin.ts';
import type { Plugin } from './plugin-model.ts';
import { listSorted } from '../format/listing.ts';

/** `skills-dir`: a folder of `~/.claude/skills/` or `.claude/skills/`; `inline`: a `--plugin-dir` directory. */
export const FOLDER_ORIGINS = ['skills-dir', 'inline'] as const;
export type FolderOrigin = (typeof FOLDER_ORIGINS)[number];

interface OriginRules {
  /** Where a marketplace name would stand in `<name>@<origin>`. */
  readonly suffix: string;
  /** Without `.claude-plugin/plugin.json` the folder is not a plugin of this origin. */
  readonly manifestRequired: boolean;
}

/**
 * `@skills-dir` is "a plugin directory that has a `.claude-plugin/plugin.json`"; a plugin loaded with
 * `--plugin-dir` may omit it ("Claude Code names the plugin after its directory").
 */
const ORIGINS: { readonly [O in FolderOrigin]: OriginRules } = {
  'skills-dir': { suffix: 'skills-dir', manifestRequired: true },
  inline: { suffix: 'inline', manifestRequired: false },
};

export interface FolderPlugin {
  /** The manifest's `name`, else the folder's name. */
  readonly name: string;
  /** `<name>@skills-dir` or `<name>@inline`. */
  readonly id: string;
  /** The manifest's `defaultEnabled`, `true` when it sets none. */
  readonly defaultEnabled: boolean;
  /** A `SKILL.md` sits at the plugin root. */
  readonly rootSkill: boolean;
  /** The component kinds the folder shows at its root, in layout order. */
  readonly components: readonly ComponentKind[];
}

export interface FolderProbe {
  readonly plugin: FolderPlugin | undefined;
  /** A skills-directory folder with a root `SKILL.md` and no manifest: a plain skill named after the folder. */
  readonly plainSkill: { readonly name: string } | undefined;
  /** Why a manifest or a name keeps the folder from being a plugin. */
  readonly issues: readonly PluginIssue[];
}

const NEITHER: FolderProbe = { plugin: undefined, plainSkill: undefined, issues: [] };

function pluginOf(
  name: string,
  origin: FolderOrigin,
  facts: Pick<FolderPlugin, 'defaultEnabled' | 'rootSkill' | 'components'>,
): FolderPlugin {
  return { name, id: `${name}@${ORIGINS[origin].suffix}`, ...facts };
}

type FolderFacts = Pick<FolderPlugin, 'rootSkill' | 'components'>;

/** A folder without a manifest: a `--plugin-dir` plugin named after the folder, a plain skill, or nothing. */
function probeUnnamed(folderName: string, origin: FolderOrigin, facts: FolderFacts): FolderProbe {
  if (ORIGINS[origin].manifestRequired) {
    return facts.rootSkill ? { ...NEITHER, plainSkill: { name: folderName } } : NEITHER;
  }
  if (!facts.rootSkill && facts.components.length === 0) return NEITHER;
  const issues = nameLoadIssues(folderName);
  if (issues.length > 0) return { ...NEITHER, issues };
  return { ...NEITHER, plugin: pluginOf(folderName, origin, { defaultEnabled: true, ...facts }) };
}

/**
 * Probes one folder. With a manifest the folder is a plugin named by it. Without one, a `--plugin-dir`
 * folder with any component (or a root `SKILL.md`) is a plugin named after the folder, and a
 * skills-directory folder is a plain skill when it has a root `SKILL.md`, otherwise nothing.
 */
export async function probeFolder(
  files: PluginFiles,
  folderName: string,
  origin: FolderOrigin,
  { signal }: { readonly signal?: AbortSignal | undefined } = {},
): Promise<FolderProbe> {
  const names = ((await listSorted(files, '.', signal)) ?? []).map((entry) => entry.name);
  const facts: FolderFacts = {
    rootSkill: names.includes('SKILL.md'),
    components: componentsAt(names),
  };
  const step = await loadManifest(files, signal);
  if (!step.present) return probeUnnamed(folderName, origin, facts);
  const { manifest } = step;
  if (!manifest) return { ...NEITHER, issues: step.issues };
  const plugin = pluginOf(manifest.name, origin, {
    defaultEnabled: manifest.defaultEnabled ?? true,
    ...facts,
  });
  return { ...NEITHER, plugin, issues: step.issues };
}

/**
 * Whether a skills-directory plugin is on: "The manifest's `defaultEnabled`, unless a settings file
 * sets `<name>@skills-dir` to `true` or `false`."
 */
export const skillsDirPluginEnabled = (
  defaultEnabled: boolean,
  setting: boolean | undefined,
): boolean => setting ?? defaultEnabled;

export interface SkillsDirFolder {
  /** The folder's name under the skills directory. */
  readonly name: string;
  readonly scope: 'user' | 'project';
  /** The text of the `SKILL.md` at the folder's root, when there is one. */
  readonly rootSkill?: string | undefined;
}

/**
 * The commands of a skills-directory plugin (plugins/create.md, "Name the plugin's skills"): "The root
 * skill ... is also a personal skill, so you invoke it as `/my-tool`, not `/my-tool:my-tool`. Skills you
 * add under `skills/` inside the plugin get the plugin-name prefix, such as `/my-tool:example`." The
 * root skill is the folder's, not the plugin's: it is a skill of the skills directory whether or not
 * the plugin loads it too, so the plugin's own copy of it is left out.
 */
export function skillsDirCommands(plugin: Plugin, folder: SkillsDirFolder): readonly string[] {
  const own = folder.rootSkill === undefined ? [] : [rootCommand(folder, folder.rootSkill)];
  const prefixed = plugin.skills
    .filter((file) => file.directory !== '.')
    .map((file) => {
      const origin: SkillOrigin = { kind: 'plugin', plugin: plugin.name };
      const layout = { origin, dirName: file.name };
      return `/${readSkill(file.path ?? 'SKILL.md', file.text, layout).skill.command}`;
    });
  return [...own, ...prefixed];
}

const rootCommand = (folder: SkillsDirFolder, text: string): string => {
  const layout = { origin: { kind: folder.scope }, dirName: folder.name } as const;
  return `/${readSkill('SKILL.md', text, layout).skill.command}`;
};
