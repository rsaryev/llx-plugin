import { SCOPE_RULES } from '../skills/scan/locations.ts';
import { resolveFolderSkills, type ScannedEntry, type Resolution } from '../skills/index.ts';
import { createCustomizationPolicy } from '../settings/customization/index.ts';
import type { SessionDirectories } from './session-directories.ts';
import type { HostState } from './state.ts';
import type { FolderEntry, FolderSkillSources } from './session-folders.ts';

const sourcesOf = (resolution: Resolution): FolderSkillSources => ({
  entries: resolution.resolved.map(({ invocable, names, scope, yielded }) => ({
    command: invocable.command,
    names,
    scope,
    origin: invocable.origin,
    yielded,
  })),
  shadowed: resolution.shadowed,
});

/** Memoized names and source-policy decisions, invalidated by scans and host.update. */
export function createFolderResolution(
  stateOf: () => HostState,
  directories: SessionDirectories,
  taken: () => readonly string[],
) {
  let scanned: readonly ScannedEntry[] = [];
  let previous: HostState | undefined;
  let listed: readonly FolderEntry[] = [];
  let sources: FolderSkillSources = { entries: [], shadowed: [] };
  const resolve = () => {
    const state = stateOf();
    if (previous === state) return;
    const policy = createCustomizationPolicy(state.view, state.parent);
    const kinds = { skill: 'skills', command: 'commands' } as const;
    const allowed = scanned.filter((entry) => {
      const source = SCOPE_RULES[entry.scope][kinds[entry.invocable.kind]];
      return source !== undefined && policy.loads('skills', source.origin);
    });
    const resolution = resolveFolderSkills(allowed, {
      cwd: directories.cwd(),
      addedDirectories: directories.added(),
      taken: taken(),
    });
    listed = resolution.resolved.map(({ invocable, names, readBody }) => ({
      invocable,
      names,
      readBody,
    }));
    sources = sourcesOf(resolution);
    previous = state;
  };
  return {
    set(entries: readonly ScannedEntry[]) {
      scanned = entries;
      previous = undefined;
      resolve();
    },
    current() {
      resolve();
      return listed;
    },
    sources() {
      resolve();
      return sources;
    },
  };
}
