import { createFolderResolution } from './session-folder-resolution.ts';
import { warning, type PluginIssue } from '../format/issues.ts';
import type { SkillOrigin } from '../format/skill-types.ts';
import {
  scanFolders,
  scanNested,
  type ScanContext,
  type ScanOutcome,
  type ScanScope,
  type ScannedEntry,
  type ShadowedEntry,
  type SkillsDirectoryPlugin,
  type YieldedName,
} from '../skills/index.ts';
import type { CustomizationPolicy } from '../settings/customization/index.ts';
import type { SessionDirectories } from './session-directories.ts';
import { extraFoldersOf, scopeRequestOf, type ScopeUse } from './scope.ts';
import { createFirstRead } from './session-first-read.ts';
import type { Entry } from './session-skill-entries.ts';
import type { SessionOptions } from './session-types.ts';
import type { HostState } from './state.ts';
import { isStrictlyBelow } from '../skills/scan/names.ts';
import { scanScope } from '../skills/scan/scan.ts';

/**
 * The skills and commands of the folders (skills.md, "Choose where skills load"): the managed
 * directory, the personal folder, the project and its parents, the added directories, the skills
 * below the working directory a file was touched in, and the skills synced from claude.ai. The
 * session reads them through the host's `FolderScan` port when it is asked to (`reloadSkills`, the
 * `/reload-skills` of Claude Code), when Claude touches a file below the working directory, and when
 * the directories change (`/add-dir`, `/cd`).
 */

/**
 * Where one listed skill or command came from and what name it gave up: what a host needs for the
 * `claude.ai sync` group of `/skills` and for the note under it (skills.md, "When a synced skill name
 * matches another command").
 */
export interface FolderSkillSource {
  /** The listed command. */
  readonly command: string;
  readonly names: readonly string[];
  /** The folder scope it was read from; `synced` is the `claude.ai sync` group. */
  readonly scope: ScanScope;
  readonly origin: SkillOrigin;
  /** The names it prefers that another command already used, and who has each. */
  readonly yielded: readonly YieldedName[];
}

/** The folders' skills by source, and the ones that lost every name and are not listed. */
export interface FolderSkillSources {
  readonly entries: readonly FolderSkillSource[];
  readonly shadowed: readonly ShadowedEntry[];
}

/** What a read of the folders found. */
export interface SkillsReload {
  /** A name refused, a link that leads nowhere, a frontmatter that does not read. */
  readonly issues: readonly PluginIssue[];
  /** The skills folders to watch for changes, those that exist (skills.md, "Edit a skill during a session"). */
  readonly watch: readonly string[];
  /**
   * The skill folders that are also plugins, unless the settings stop skills-directory plugins
   * (`strictPluginOnlyCustomization`, `strictKnownMarketplaces`, `blockedMarketplaces`: plugins/loading.md,
   * "Skills-directory plugins blocked by managed settings"); the host loads them with `FolderScan.open`
   * and `loadPlugin`. The folder's `SKILL.md` is a plain skill either way, listed unless skills are locked.
   */
  readonly plugins: readonly SkillsDirectoryPlugin[];
}

export interface FolderSkills {
  /** What the last read listed. */
  current(): readonly Entry[];
  /** The warning while the folders are still to read (`createFirstRead`). */
  issues(): readonly PluginIssue[];
  /** Where each of those came from. */
  sources(): FolderSkillSources;
  reload(signal: AbortSignal): Promise<SkillsReload>;
  touch(path: string, signal: AbortSignal): Promise<SkillsReload>;
  addDirectory(path: string, signal: AbortSignal): Promise<SkillsReload>;
  moveTo(cwd: string, signal: AbortSignal): Promise<SkillsReload>;
}

const NOT_WIRED = warning(
  'skills',
  'the host gave no folder-scan port, so no personal, project, managed or added-directory skill is read',
);

const NOTHING: SkillsReload = { issues: [], watch: [], plugins: [] };

/** What a scan is asked for now: the live directories, and the sources `strictPluginOnlyCustomization` lets load. */
function scanContextOf(
  use: ScopeUse,
  directories: SessionDirectories,
  policy: CustomizationPolicy,
  signal: AbortSignal,
): ScanContext | undefined {
  const { folders } = use.state.options.ports;
  if (folders === undefined) return undefined;
  return {
    folders,
    request: scopeRequestOf(use, directories),
    allows: (origin) => policy.loads('skills', origin),
    signal,
    ...extraFoldersOf(use.state),
  };
}

/**
 * A session's folder skills. `taken` lists the commands other sources already use (the host's
 * built-in commands, bundled skills and MCP prompts, and the plugins' skills), which only a synced
 * skill's short name yields to; it returns the same array while they are unchanged.
 *
 * Reads never overlap: a reload, a touched file, `/add-dir` and `/cd` run one after the other, so a
 * touch that finishes during a reload cannot be overwritten by it.
 */
export function createFolderSkills(
  stateOf: () => HostState,
  options: SessionOptions,
  directories: SessionDirectories,
  taken: () => readonly string[],
): FolderSkills {
  const policyOf = () => stateOf().customization;
  let root: readonly ScannedEntry[] = [];
  let nested: readonly ScannedEntry[] = [];
  const nestedDirectories = new Set<string>();
  const resolution = createFolderResolution(stateOf, directories, taken);
  const firstRead = createFirstRead('skills', 'reloadSkills');
  let queue: Promise<unknown> = Promise.resolve();

  const serialized = <T>(task: () => Promise<T>): Promise<T> => {
    const result = queue.then(task);
    queue = result.catch(() => undefined);
    return result;
  };

  /** The nested directories still to read: one that was added with `/add-dir` is read as an added directory. */
  const nestedBases = (): readonly string[] =>
    [...nestedDirectories].filter((directory) => !directories.added().includes(directory));

  const context = (signal: AbortSignal): ScanContext | undefined =>
    scanContextOf({ state: stateOf(), options }, directories, policyOf(), signal);

  const resolve = () => resolution.set([...root, ...nested]);

  /** The skill folders that are also plugins, unless the settings stop skills-directory plugins. */
  const reloadOf = (outcome: ScanOutcome, extra: readonly PluginIssue[] = []): SkillsReload => ({
    issues: [...extra, ...outcome.issues],
    watch: outcome.watch,
    plugins: policyOf().skillsDirPlugins().admitted ? outcome.plugins : [],
  });

  const read = async (signal: AbortSignal): Promise<SkillsReload> => {
    const scan = context(signal);
    if (scan === undefined) return { ...NOTHING, issues: [NOT_WIRED] };
    const outcome = await scanFolders(scan);
    const again = await scanScope(
      { ...scan, request: { ...scan.request, nestedDirectories: nestedBases() } },
      'nested',
    );
    root = outcome.entries;
    nested = again.entries;
    resolve();
    firstRead.done();
    return reloadOf(outcome, again.issues);
  };

  return {
    current: () => resolution.current(),
    issues: () => firstRead.issues(stateOf()),
    sources: () => resolution.sources(),
    reload: (signal) => serialized(() => read(signal)),
    touch: (path, signal) =>
      serialized(async () => {
        const scan = context(signal);
        if (scan === undefined) return NOTHING;
        const loaded = new Set([...nestedDirectories, ...directories.added()]);
        const found = await scanNested(scan, path, loaded);
        for (const directory of found.directories) nestedDirectories.add(directory);
        nested = [...nested, ...found.entries];
        resolve();
        return reloadOf(found);
      }),
    addDirectory: (path, signal) =>
      serialized(() => {
        directories.add(path);
        nestedDirectories.delete(path);
        return read(signal);
      }),
    // Judgment (spec/judgments.md): the nested directories below the new directory stay, the rest are
    // project folders of the new chain or outside it.
    moveTo: (cwd, signal) =>
      serialized(() => {
        directories.moveTo(cwd);
        for (const directory of nestedDirectories) {
          if (!isStrictlyBelow(cwd, directory)) nestedDirectories.delete(directory);
        }
        return read(signal);
      }),
  };
}
