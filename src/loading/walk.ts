import { STANDARD_LAYOUT } from '../format/layout.ts';
import type { DirectoryEntry, FileStat } from '../ports/index.ts';
import { childPath } from '../format/locate.ts';
import type { DiscoverContext, DiscoveredFile } from './discovered.ts';

/**
 * How each directory-shaped component turns one existing location (a file or a folder, default or
 * declared) into the files it holds (plugins/manifest-reference.md, "Standard layout" and "Path-only
 * fields"; plugins/components.md for each kind). One strategy per kind, typed over the union.
 */
export const LISTED_KINDS = [
  'skills',
  'commands',
  'agents',
  'outputStyles',
  'workflows',
  'themes',
] as const;
export type ListedKind = (typeof LISTED_KINDS)[number];

/** `declared`: the location comes from a manifest path rather than from the standard layout. */
type Walker = (
  context: DiscoverContext,
  path: string,
  stat: FileStat,
  declared: boolean,
) => Promise<DiscoveredFile[]>;

const SKILL_FILE = 'SKILL.md';
/** A folder tree deeper than this is not scanned further: a symlink loop must end somewhere (judgment). */
const MAX_DEPTH = 16;

/** The file name without its last extension. */
const stem = (name: string): string => {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
};
const baseName = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

/** A declared file is taken as given whatever its extension: the user named it. */
const single = (path: string): DiscoveredFile[] => [{ path, name: stem(baseName(path)) }];

const entriesOf = async (context: DiscoverContext, path: string): Promise<DirectoryEntry[]> => [
  ...((await context.files.list(path, context.signal)) ?? []),
];

/** The direct children of a folder that are files of the kind's extension. */
async function scanFlat(
  context: DiscoverContext,
  path: string,
  extension: string | undefined,
): Promise<DiscoveredFile[]> {
  const entries = await entriesOf(context, path);
  return entries
    .filter((one) => one.isFile && (extension === undefined || one.name.endsWith(extension)))
    .map((one) => ({ path: childPath(path, one.name), name: stem(one.name) }));
}

/**
 * Files at any depth; every folder on the way becomes a `:`-joined segment of the name
 * (`agents/review/security.md` is `review:security`, `commands/db/migrate.md` is `db:migrate`).
 */
async function scanNested(
  scan: { readonly context: DiscoverContext; readonly extension: string | undefined },
  path: string,
  prefix: string,
  depth = 0,
): Promise<DiscoveredFile[]> {
  const { context, extension } = scan;
  if (depth > MAX_DEPTH) return [];
  const entries = await entriesOf(context, path);
  const groups = await Promise.all(
    entries.map(async (one) => {
      const here = childPath(path, one.name);
      if (one.isDirectory) {
        return scanNested(scan, here, `${prefix}${one.name}:`, depth + 1);
      }
      const keep = one.isFile && (extension === undefined || one.name.endsWith(extension));
      return keep ? [{ path: here, name: `${prefix}${stem(one.name)}` }] : [];
    }),
  );
  return groups.flat();
}

/**
 * Skills: "each a directory of `<name>/SKILL.md` folders or one folder holding `SKILL.md` directly"
 * (manifest-reference, "Fields"). A folder with a `SKILL.md` of its own is one skill named after it
 * (the plugin root, named after the plugin: judgment, the frontmatter `name` decides the rest);
 * otherwise each child folder with a `SKILL.md` is a skill.
 */
const skills: Walker = async (context, path, stat, declared) => {
  if (!stat.isDirectory) return [];
  const own = await context.files.exists(childPath(path, SKILL_FILE), context.signal);
  // Oracle 2.1.319: the default `skills/` folder is only a parent, a `SKILL.md` directly in it is no skill.
  if (own && (declared || path === '.')) {
    const name = path === '.' ? context.pluginName : baseName(path);
    return [{ path: childPath(path, SKILL_FILE), name, directory: path, alone: true }];
  }
  const entries = await entriesOf(context, path);
  const checked = await Promise.all(
    entries
      .filter((one) => one.isDirectory)
      .map(async (one) => {
        const directory = childPath(path, one.name);
        const has = await context.files.exists(childPath(directory, SKILL_FILE), context.signal);
        return has ? [{ path: childPath(directory, SKILL_FILE), name: one.name, directory }] : [];
      }),
  );
  return checked.flat();
};

const nested =
  (extension: string | undefined): Walker =>
  (context, path, stat) =>
    stat.isDirectory ? scanNested({ context, extension }, path, '') : Promise.resolve(single(path));

const flat =
  (extension: string | undefined): Walker =>
  (context, path, stat) =>
    stat.isDirectory ? scanFlat(context, path, extension) : Promise.resolve(single(path));

/**
 * Commands and agents nest (components.md: `commands/db/migrate.md` is `/my-plugin:db:migrate`, "agents
 * ... loads recursively"); output styles, workflows and themes are one folder of files (judgment: the
 * docs name `output-styles/<name>.md`, `workflows/` `.js` files and `themes/<slug>.json`, no nesting).
 * A declared agent file loads without subfolder names ("a file you list there loads without subfolder
 * names"): its name is its file name.
 */
export const WALKERS: { readonly [K in ListedKind]: Walker } = {
  skills,
  commands: nested(STANDARD_LAYOUT.commands.extension),
  agents: nested(STANDARD_LAYOUT.agents.extension),
  outputStyles: flat(STANDARD_LAYOUT.outputStyles.extension),
  workflows: flat(STANDARD_LAYOUT.workflows.extension),
  themes: flat(STANDARD_LAYOUT.themes.extension),
};
