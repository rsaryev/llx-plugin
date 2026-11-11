import { SCOPE_RULES } from '../skills/scan/locations.ts';
import { resolveFolderSkills, type ScannedEntry, type Resolution } from '../skills/index.ts';
import type { SessionDirectories } from './session-directories.ts';
import type { HostState } from './state.ts';
import type { FolderSkillSources } from './session-folders.ts';
import { placeOf, type Entry } from './session-skill-entries.ts';

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

/**
 * Memoized names and source-policy decisions, invalidated by scans, host.update and a change of
 * `taken` (a new array: the host's skills changed).
 */
export function createFolderResolution(
  stateOf: () => HostState,
  directories: SessionDirectories,
  taken: () => readonly string[],
) {
  let scanned: readonly ScannedEntry[] = [];
  let previous: { readonly state: HostState; readonly taken: readonly string[] } | undefined;
  let listed: readonly Entry[] = [];
  let sources: FolderSkillSources = { entries: [], shadowed: [] };
  const resolve = () => {
    const state = stateOf();
    const names = taken();
    if (previous?.state === state && previous.taken === names) return;
    const policy = state.customization;
    const kinds = { skill: 'skills', command: 'commands' } as const;
    const allowed = scanned.filter((entry) => {
      const source = SCOPE_RULES[entry.scope][kinds[entry.invocable.kind]];
      return source !== undefined && policy.loads('skills', source.origin);
    });
    const resolution = resolveFolderSkills(allowed, {
      cwd: directories.cwd(),
      addedDirectories: directories.added(),
      taken: names,
    });
    listed = resolution.resolved.map((each): Entry => ({
      invocable: each.invocable,
      names: each.names,
      readBody: each.readBody,
      source: { kind: 'folder', scope: each.scope },
      ...placeOf(each.invocable),
    }));
    sources = sourcesOf(resolution);
    previous = { state, taken: names };
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
