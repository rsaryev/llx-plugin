import { warning, type PluginIssue } from '../format/issues.ts';
import type { Command, Skill } from '../format/skill-types.ts';
import {
  resolveFolderSkills,
  scanFolders,
  scanNested,
  scanScope,
  type ScanContext,
  type ScanOutcome,
  type ScannedEntry,
  type SkillsDirectoryPlugin,
} from '../skills/index.ts';
import { createCustomizationPolicy } from '../settings/customization/index.ts';
import type { HostState } from './state.ts';
import type { SessionOptions } from './types.ts';

/**
 * The skills and commands of the folders (skills.md, "Choose where skills load"): the managed
 * directory, the personal folder, the project and its parents, the added directories, the skills
 * below the working directory a file was touched in, and the skills synced from claude.ai. The
 * session reads them through the host's `FolderScan` port when it is asked to (`reloadSkills`, the
 * `/reload-skills` of Claude Code) and when Claude touches a file below the working directory.
 */

export interface FolderEntry {
  readonly invocable: Skill | Command;
  /** Every name that invokes it, the listed command first. */
  readonly names: readonly string[];
}

/** What a read of the folders found. */
export interface SkillsReload {
  /** A name refused, a link that leads nowhere, a frontmatter that does not read. */
  readonly issues: readonly PluginIssue[];
  /** The skills folders to watch for changes, those that exist (skills.md, "Edit a skill during a session"). */
  readonly watch: readonly string[];
  /** The skill folders that are also plugins; the host loads them with `FolderScan.open` and `loadPlugin`. */
  readonly plugins: readonly SkillsDirectoryPlugin[];
}

export interface FolderSkills {
  /** What the last read listed. */
  current(): readonly FolderEntry[];
  reload(signal: AbortSignal): Promise<SkillsReload>;
  touch(path: string, signal: AbortSignal): Promise<SkillsReload>;
}

const NOT_WIRED = warning(
  'skills',
  'the host gave no folder-scan port, so no personal, project, managed or added-directory skill is read',
);

const reloadOf = (outcome: ScanOutcome, extra: readonly PluginIssue[] = []): SkillsReload => ({
  issues: [...extra, ...outcome.issues],
  watch: outcome.watch,
  plugins: outcome.plugins,
});

/**
 * A session's folder skills. `taken` lists the commands the plugins already use, which only a synced
 * skill's short name yields to.
 */
export function createFolderSkills(
  state: HostState,
  options: SessionOptions,
  taken: () => readonly string[],
): FolderSkills {
  const { folders, locations } = state.options.ports;
  const policy = createCustomizationPolicy(state.view, state.parent);
  let root: readonly ScannedEntry[] = [];
  let nested: readonly ScannedEntry[] = [];
  const nestedDirectories = new Set<string>();
  let listed: readonly FolderEntry[] = [];

  const context = (signal: AbortSignal): ScanContext | undefined =>
    folders === undefined
      ? undefined
      : {
          folders,
          request: {
            home: locations.homeDir(),
            cwd: options.cwd,
            ...(options.addedDirectories === undefined
              ? {}
              : { addedDirectories: options.addedDirectories }),
          },
          allows: (origin) => policy.loads('skills', origin),
          signal,
        };

  const resolve = (): void => {
    const resolution = resolveFolderSkills([...root, ...nested], {
      cwd: options.cwd,
      ...(options.addedDirectories === undefined
        ? {}
        : { addedDirectories: options.addedDirectories }),
      taken: taken(),
    });
    listed = resolution.resolved.map(({ invocable, names }) => ({ invocable, names }));
  };

  return {
    current: () => listed,
    async reload(signal) {
      const scan = context(signal);
      if (scan === undefined) return { issues: [NOT_WIRED], watch: [], plugins: [] };
      const outcome = await scanFolders(scan);
      root = outcome.entries;
      const again = await scanScope(
        { ...scan, request: { ...scan.request, nestedDirectories: [...nestedDirectories] } },
        'nested',
      );
      nested = again.entries;
      resolve();
      return reloadOf(outcome, again.issues);
    },
    async touch(path, signal) {
      const scan = context(signal);
      if (scan === undefined) return { issues: [], watch: [], plugins: [] };
      const found = await scanNested(scan, path, nestedDirectories);
      for (const directory of found.directories) nestedDirectories.add(directory);
      nested = [...nested, ...found.entries];
      resolve();
      return reloadOf(found);
    },
  };
}
