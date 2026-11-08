import type { PluginOnlySurface } from '../../protocol/settings-keys.ts';
import type { PolicyHookSource } from '../hooks/origins.ts';
import { stopsOf } from '../hooks/origin-stops.ts';

/**
 * Which origins each locked surface still loads: one table per surface, typed over that surface's own
 * origins, from the **Stops** and **Keeps** lists of its sub-key entry in settings-reference.md. A host's
 * discovery (`~/.claude/skills`, `.claude/agents`, `.mcp.json`, `--add-dir`) asks per candidate.
 */
export type SkillsOrigin =
  | 'userSkills'
  | 'projectSkills'
  | 'userCommands'
  | 'projectCommands'
  | 'addDir'
  | 'synced'
  | 'bundled'
  | 'managedDirectory'
  | 'plugin'
  | 'skillsDirPlugin';

export type AgentsOrigin =
  | 'userAgents'
  | 'projectAgents'
  | 'addDir'
  | 'builtIn'
  | 'managedDirectory'
  | 'plugin'
  | 'skillsDirPlugin';

/**
 * `userConfig` is the user-scope servers and `localConfig` the local-scope ones (the default of
 * `claude mcp add`): both live in `~/.claude.json` (mcp.md § Scopes), which the lock stops loading from.
 */
export type McpOrigin =
  | 'userConfig'
  | 'localConfig'
  | 'projectFile'
  | 'managedFile'
  | 'managedSettings'
  | 'plugin'
  | 'skillsDirPlugin';

/** The hooks of every origin the hook policy knows: the same vocabulary, one decision about it. */
export type HooksOrigin = PolicyHookSource;

/** The origins a host names, per surface. */
export interface OriginOf {
  readonly skills: SkillsOrigin;
  readonly agents: AgentsOrigin;
  readonly hooks: HooksOrigin;
  readonly mcp: McpOrigin;
}

export type LockedSurfaces = ReadonlySet<PluginOnlySurface>;

/**
 * When the lock stops an origin: with its own surface locked, with any surface locked (a
 * skills-directory plugin, skipped whole "when any one kind is locked", plugins/loading.md), or never
 * (managed, bundled and the plugins a marketplace delivers).
 */
const BLOCKS = ['whenSurfaceLocked', 'whenAnyLocked', 'never'] as const;
type Blocks = (typeof BLOCKS)[number];

const STOPS: {
  readonly [B in Blocks]: (locked: LockedSurfaces, surface: PluginOnlySurface) => boolean;
} = {
  whenSurfaceLocked: (locked, surface) => locked.has(surface),
  whenAnyLocked: (locked) => locked.size > 0,
  never: () => false,
};

const SKILLS: { readonly [O in SkillsOrigin]: Blocks } = {
  userSkills: 'whenSurfaceLocked',
  projectSkills: 'whenSurfaceLocked',
  userCommands: 'whenSurfaceLocked',
  projectCommands: 'whenSurfaceLocked',
  addDir: 'whenSurfaceLocked',
  synced: 'whenSurfaceLocked',
  bundled: 'never',
  managedDirectory: 'never',
  plugin: 'never',
  skillsDirPlugin: 'whenAnyLocked',
};

const AGENTS: { readonly [O in AgentsOrigin]: Blocks } = {
  userAgents: 'whenSurfaceLocked',
  projectAgents: 'whenSurfaceLocked',
  addDir: 'whenSurfaceLocked',
  builtIn: 'never',
  managedDirectory: 'never',
  plugin: 'never',
  skillsDirPlugin: 'whenAnyLocked',
};

const MCP: { readonly [O in McpOrigin]: Blocks } = {
  userConfig: 'whenSurfaceLocked',
  localConfig: 'whenSurfaceLocked',
  projectFile: 'whenSurfaceLocked',
  managedFile: 'never',
  managedSettings: 'never',
  plugin: 'never',
  skillsDirPlugin: 'whenAnyLocked',
};

const tableLoads =
  <O extends string>(surface: PluginOnlySurface, table: { readonly [P in O]: Blocks }) =>
  (locked: LockedSurfaces, origin: O): boolean =>
    !STOPS[table[origin]](locked, surface);

/** The skills-directory plugin a hook belongs to, itself or through the skill that declares it. */
function ownedBySkillsDirPlugin(origin: PolicyHookSource): boolean {
  if ('skillsDirPlugin' in origin) return origin.skillsDirPlugin;
  return 'plugin' in origin && origin.plugin.skillsDirPlugin;
}

/**
 * The hooks surface asks the hook policy's own table what the lock stops (settings files, frontmatter
 * of the user's, the project's and added directories' skills and agents, skills-directory plugins), so
 * the two never describe one origin two ways; a skills-directory plugin also stops under any other lock.
 */
const hooksLoads = (locked: LockedSurfaces, origin: HooksOrigin): boolean =>
  !(
    (locked.has('hooks') && stopsOf(origin, () => false).pluginOnly) ||
    (locked.size > 0 && ownedBySkillsDirPlugin(origin))
  );

type Loads = {
  readonly [S in PluginOnlySurface]: (locked: LockedSurfaces, origin: OriginOf[S]) => boolean;
};

const LOADS: Loads = {
  skills: tableLoads('skills', SKILLS),
  agents: tableLoads('agents', AGENTS),
  hooks: hooksLoads,
  mcp: tableLoads('mcp', MCP),
};

function apply<S extends PluginOnlySurface>(
  registry: {
    readonly [P in S]: (locked: LockedSurfaces, origin: OriginOf[P]) => boolean;
  },
  surface: S,
  locked: LockedSurfaces,
  origin: OriginOf[S],
): boolean {
  return registry[surface](locked, origin);
}

/** Whether a customization of `surface` from `origin` loads under these locks. */
export const loads = <S extends PluginOnlySurface>(
  locked: LockedSurfaces,
  surface: S,
  origin: OriginOf[S],
): boolean => apply(LOADS, surface, locked, origin);
