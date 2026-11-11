import { STANDARD_LAYOUT } from '../format/layout.ts';
import type { DirectoryEntry, FileStat } from '../ports/index.ts';
import type { PluginIssue } from '../format/issues.ts';
import { locate } from '../format/locate.ts';
import { childPath } from '../format/path-text.ts';
import type { DiscoverContext, DiscoveredFile, Found } from './discovered.ts';
import { listSorted } from '../format/listing.ts';

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
) => Promise<Found<DiscoveredFile>>;

const SKILL_FILE = 'SKILL.md';
/**
 * A folder tree deeper than this is not scanned further: a port that reports no links cannot tell
 * the scan that a folder loops (judgment); a reported link is never entered by a nested scan.
 */
const MAX_DEPTH = 16;

/** The file name without its last extension. */
const stem = (name: string): string => {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
};
const baseName = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

/** A declared file is taken as given whatever its extension: the user named it. */
const single = (path: string): Found<DiscoveredFile> => ({
  found: [{ path, name: stem(baseName(path)) }],
  issues: [],
});

const entriesOf = async (context: DiscoverContext, path: string): Promise<DirectoryEntry[]> => [
  ...((await listSorted(context.files, path, context.signal)) ?? []),
];

/**
 * Whether a scan enters a symlinked folder it finds (Claude Code 2.1.322, spec/judgments.md): a
 * skills scan follows a linked skill folder, a commands or agents scan does not enter a linked
 * folder at all; the flat kinds read no folders.
 */
const FOLLOWS_LINKS: { readonly [K in ListedKind]: boolean } = {
  skills: true,
  commands: false,
  agents: false,
  outputStyles: false,
  workflows: false,
  themes: false,
};

/** One scan of one location, and the links it refused. */
interface Scan {
  readonly context: DiscoverContext;
  readonly kind: ListedKind;
  readonly issues: PluginIssue[];
}

const startScan = (context: DiscoverContext, kind: ListedKind): Scan => ({
  context,
  kind,
  issues: [],
});

/**
 * The folder `name` below `parent`, when the scan enters it: a link only where the kind follows
 * links, and then through `locate` like a declared path ("A symlink that leads outside the plugin"
 * is a path-escapes error, loading.md). Which of a folder and a link to it loads is
 * `discover-listed`'s (`keeperOf`).
 */
async function enter(scan: Scan, parent: string, name: string): Promise<string | undefined> {
  const path = childPath(parent, name);
  const { context } = scan;
  const stat = await context.files.stat(path, context.signal);
  if (stat?.isSymlink !== true) return path;
  if (!FOLLOWS_LINKS[scan.kind]) return undefined;
  const located = await locate(context, scan.kind, path);
  if (located.issue) scan.issues.push(located.issue);
  return located.issue ? undefined : path;
}

const done = (scan: Scan, found: DiscoveredFile[]): Found<DiscoveredFile> => ({
  found,
  issues: scan.issues,
});

/** The direct children of a folder that are files of the kind's extension. */
async function scanFlat(
  context: DiscoverContext,
  path: string,
  extension: string | undefined,
): Promise<Found<DiscoveredFile>> {
  const entries = await entriesOf(context, path);
  const found = entries
    .filter((one) => one.isFile && (extension === undefined || one.name.endsWith(extension)))
    .map((one) => ({ path: childPath(path, one.name), name: stem(one.name) }));
  return { found, issues: [] };
}

interface NestedScan extends Scan {
  readonly extension: string | undefined;
  /** A folder holding `SKILL.md` is one skill, and nothing under it is scanned (commands). */
  readonly skillFolders?: true;
}

const holdsSkill = (context: DiscoverContext, folder: string): Promise<boolean> =>
  context.files.exists(childPath(folder, SKILL_FILE), context.signal);

/** A skill folder found by a commands scan: named by its folder, never by its frontmatter `name`. */
const skillFolder = (folder: string, name: string): DiscoveredFile => ({
  path: childPath(folder, SKILL_FILE),
  name,
  directory: folder,
});

/** What one child folder of a nested scan holds: a skill, or the files below it. */
async function nestedFolder(
  scan: NestedScan,
  folder: string,
  name: string,
  { prefix, depth }: { prefix: string; depth: number },
): Promise<DiscoveredFile[]> {
  if (scan.skillFolders === true && (await holdsSkill(scan.context, folder))) {
    return [skillFolder(folder, `${prefix}${name}`)];
  }
  return scanNested(scan, folder, `${prefix}${name}:`, depth + 1);
}

/**
 * Files at any depth; every folder on the way becomes a `:`-joined segment of the name
 * (`agents/review/security.md` is `review:security`, `commands/db/migrate.md` is `db:migrate`).
 * Folder by folder in sorted order.
 */
async function scanNested(
  scan: NestedScan,
  folder: string,
  prefix: string,
  depth = 0,
): Promise<DiscoveredFile[]> {
  const { context, extension } = scan;
  if (depth > MAX_DEPTH) return [];
  const found: DiscoveredFile[] = [];
  for (const one of await entriesOf(context, folder)) {
    const child = one.isDirectory ? await enter(scan, folder, one.name) : undefined;
    if (child) found.push(...(await nestedFolder(scan, child, one.name, { prefix, depth })));
    const keep = one.isFile && (extension === undefined || one.name.endsWith(extension));
    if (keep) found.push({ path: childPath(folder, one.name), name: `${prefix}${stem(one.name)}` });
  }
  return found;
}

/**
 * Skills: "each a directory of `<name>/SKILL.md` folders or one folder holding `SKILL.md` directly"
 * (manifest-reference, "Fields"). A folder with a `SKILL.md` of its own is one skill named after it
 * (the plugin root, named after the plugin: judgment, the frontmatter `name` decides the rest);
 * otherwise each child folder with a `SKILL.md` is a skill.
 */
const skills: Walker = async (context, path, stat, declared) => {
  if (!stat.isDirectory) return { found: [], issues: [] };
  const own = await holdsSkill(context, path);
  // Oracle 2.1.319: the default `skills/` folder is only a parent, a `SKILL.md` directly in it is no skill.
  if (own && (declared || path === '.')) {
    const name = path === '.' ? context.pluginName : baseName(path);
    const skill = {
      path: childPath(path, SKILL_FILE),
      name,
      directory: path,
      alone: true,
    } as const;
    return { found: [skill], issues: [] };
  }
  const scan = startScan(context, 'skills');
  const found: DiscoveredFile[] = [];
  for (const one of await entriesOf(context, path)) {
    const child = one.isDirectory ? await enter(scan, path, one.name) : undefined;
    if (child !== undefined && (await holdsSkill(context, child))) {
      found.push({ path: childPath(child, SKILL_FILE), name: one.name, directory: child });
    }
  }
  return done(scan, found);
};

const nested =
  (kind: ListedKind, extension: string | undefined): Walker =>
  async (context, path, stat) => {
    if (!stat.isDirectory) return single(path);
    const scan = startScan(context, kind);
    return done(scan, await scanNested({ ...scan, extension }, path, ''));
  };

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
/**
 * Commands, oracle 2.1.319 (spec/judgments.md): a folder holding `SKILL.md` that a commands scan
 * reaches is a skill named by its folder (`commands/nest/deep/SKILL.md` is `nest:deep`) and nothing
 * under it loads; a commands location that holds `SKILL.md` itself, the default `commands/`
 * included, is that one skill. Discovery hands these to the skills (`discoverComponents`).
 */
const commands: Walker = async (context, path, stat) => {
  if (!stat.isDirectory) return single(path);
  if (await holdsSkill(context, path)) {
    const name = path === '.' ? context.pluginName : baseName(path);
    return { found: [skillFolder(path, name)], issues: [] };
  }
  const extension = STANDARD_LAYOUT.commands.extension;
  const scan = startScan(context, 'commands');
  return done(scan, await scanNested({ ...scan, extension, skillFolders: true }, path, ''));
};

export const WALKERS: { readonly [K in ListedKind]: Walker } = {
  skills,
  commands,
  agents: nested('agents', STANDARD_LAYOUT.agents.extension),
  outputStyles: flat(STANDARD_LAYOUT.outputStyles.extension),
  workflows: flat(STANDARD_LAYOUT.workflows.extension),
  themes: flat(STANDARD_LAYOUT.themes.extension),
};
