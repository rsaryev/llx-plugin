import { error, type PluginIssue } from '../format/issues.ts';
import { STANDARD_LAYOUT, declaredKey } from '../format/layout.ts';
import { pathNotFound } from '../format/messages.ts';
import type { CommandEntry, PluginManifest } from '../format/manifest-schema.ts';
import { COMBINE } from './combine.ts';
import type { DiscoverContext, DiscoveredFile, Found } from './discovered.ts';
import { ignoredFolderIssues } from './ignored-folder.ts';
import { locate, rootRelative } from './locate.ts';
import { DECLARED_SHAPE } from './declared-shape.ts';
import { WALKERS, type ListedKind } from './walk.ts';

/** The `commands` object map of a manifest, when it uses one. */
const commandMapOf = (
  manifest: PluginManifest | undefined,
): Readonly<Record<string, CommandEntry>> | undefined => {
  const commands = manifest?.commands;
  return commands !== undefined && typeof commands === 'object' && !Array.isArray(commands)
    ? commands
    : undefined;
};

/** The `source` of every entry of a `commands` object map. */
const mapSources = (map: Readonly<Record<string, CommandEntry>>): string[] =>
  Object.values(map).flatMap((entry) => (entry.source === undefined ? [] : [entry.source]));

/** Every path a manifest value names: a path, an array of paths, or the sources of a command map. */
function declaredPaths(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string');
  }
  return [];
}

/**
 * The locations scanned when the manifest does not set the key. Skills have one more: "a `SKILL.md`
 * at the plugin root, with no `skills/` directory and no `skills` manifest key loads as one skill"
 * (components.md, "Skills").
 */
async function defaultLocations(
  kind: ListedKind,
  context: DiscoverContext,
): Promise<Found<string>> {
  const standard = { found: [STANDARD_LAYOUT[kind].location], issues: [] };
  if (kind !== 'skills' || declaredKey(context.manifest, kind) !== undefined) return standard;
  const folder = await context.files.stat(STANDARD_LAYOUT.skills.location, context.signal);
  if (folder?.isDirectory) return standard;
  const root = await locate(context.files, kind, 'SKILL.md', context.signal);
  if (root.issue) return { found: standard.found, issues: [root.issue] };
  return root.stat?.isFile ? { found: ['.'], issues: [] } : standard;
}

/** The entries of a `commands` object map: a file named by `source`, or inline `content`. */
async function commandMap(
  map: Readonly<Record<string, CommandEntry>>,
  context: DiscoverContext,
): Promise<Found<DiscoveredFile>> {
  const results = await Promise.all(
    Object.entries(map).map(async ([name, entry]): Promise<Found<DiscoveredFile>> => {
      const { source } = entry;
      if (source === undefined) return { found: [{ path: undefined, name, entry }], issues: [] };
      const located = await locate(context.files, 'commands', source, context.signal);
      if (located.issue) return { found: [], issues: [located.issue] };
      if (!located.stat) {
        return { found: [], issues: [error('commands', pathNotFound('commands', source))] };
      }
      return { found: [{ path: rootRelative(source), name, entry }], issues: [] };
    }),
  );
  return {
    found: results.flatMap((one) => one.found),
    issues: results.flatMap((one) => one.issues),
  };
}

/** One location, default or declared: what it holds, or why it does not load. */
async function walkOne(
  kind: ListedKind,
  path: string,
  written: string | undefined,
  context: DiscoverContext,
): Promise<Found<DiscoveredFile>> {
  const located = await locate(context.files, kind, written ?? path, context.signal);
  if (located.issue) return { found: [], issues: [located.issue] };
  if (!located.stat) {
    const missing: PluginIssue[] =
      written === undefined ? [] : [error(kind, pathNotFound(kind, written))];
    return { found: [], issues: missing };
  }
  const wrong = written === undefined ? undefined : DECLARED_SHAPE[kind](located.stat, written);
  if (wrong !== undefined) return { found: [], issues: [error(kind, wrong)] };
  return {
    found: await WALKERS[kind](context, path, located.stat, written !== undefined),
    issues: [],
  };
}

interface Place {
  /** Where the file really lives: a link inside the plugin counts as its target (`realPath`). */
  readonly key: string | undefined;
  readonly linked: boolean;
}

/**
 * Where a found file really lives: a link inside the plugin counts as its target (`realPath`, relative
 * to the folder), so `agents/a.agent.md -> a.md` or `skills/alias -> real` is the same file as its
 * target; a skill is its folder. Inline commands have no path.
 */
async function placeOf(file: DiscoveredFile, context: DiscoverContext): Promise<Place> {
  const path = file.directory ?? file.path;
  if (path === undefined) return { key: undefined, linked: false };
  const stat = await context.files.stat(path, context.signal);
  const linked = stat?.isSymlink === true && stat.realPath !== undefined;
  return { key: linked ? stat.realPath : path, linked };
}

/**
 * Which occurrence of a file reached twice stays (oracle 2.1.319,
 * tests/fixtures/runtime/symlinked-duplicates): for a skill folder the first in folder order, for an
 * agent or command file the file itself over a link to it, whatever their order.
 */
function keeperOf(found: readonly DiscoveredFile[], places: readonly Place[]): Map<string, number> {
  const keeper = new Map<string, number>();
  places.forEach((place, index) => {
    if (place.key === undefined) return;
    const kept = keeper.get(place.key);
    const skill = found[index]?.directory !== undefined;
    const better = kept !== undefined && !skill && places[kept]?.linked === true && !place.linked;
    if (kept === undefined || better) keeper.set(place.key, index);
  });
  return keeper;
}

/**
 * A file reached twice loads once (oracle 2.1.319): a folder listed in the manifest that is also
 * inside the default `skills/` folder, or a link inside the plugin to another file of the same
 * component. Inline commands have no path and all stay.
 */
async function firstOfEach(
  found: readonly DiscoveredFile[],
  context: DiscoverContext,
): Promise<DiscoveredFile[]> {
  const places = await Promise.all(found.map((file) => placeOf(file, context)));
  const keeper = keeperOf(found, places);
  return found.filter((_, index) => {
    const key = places[index]?.key;
    return key === undefined || keeper.get(key) === index;
  });
}

/**
 * The files of one directory-shaped component (plugins/manifest-reference.md, "Standard layout",
 * "How each key combines with its default location"): the default location and the manifest's paths,
 * combined by the kind's rule; a default that is not there is skipped, a declared path that is not
 * there is `<component> path not found: <path>`.
 */
export async function discoverListed(
  kind: ListedKind,
  context: DiscoverContext,
): Promise<Found<DiscoveredFile>> {
  const declared = declaredKey(context.manifest, kind);
  const map = kind === 'commands' ? commandMapOf(context.manifest) : undefined;
  const paths =
    declared === undefined ? undefined : map ? mapSources(map) : declaredPaths(declared.value);
  const warnings = await ignoredFolderIssues(kind, paths ?? [], context);
  if (map !== undefined) {
    const entries = await commandMap(map, context);
    return { found: entries.found, issues: [...warnings, ...entries.issues] };
  }
  const defaults = await defaultLocations(kind, context);
  const written = new Map((paths ?? []).map((path) => [rootRelative(path), path]));
  const order = COMBINE[STANDARD_LAYOUT[kind].combine ?? 'replace'](
    defaults.found.map(rootRelative),
    paths?.map(rootRelative),
  );
  const walked = await Promise.all(
    order.map((path) => walkOne(kind, path, written.get(path), context)),
  );
  return {
    found: await firstOfEach(
      walked.flatMap((one) => one.found),
      context,
    ),
    issues: [...defaults.issues, ...warnings, ...walked.flatMap((one) => one.issues)],
  };
}
