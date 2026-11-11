import type { SkillOrigin } from '../../format/skill-types.ts';
import {
  placesBelow,
  SCOPE_PLACES,
  type ScopeContext,
  type ScopePlaces,
  type ScopeRequest,
} from '../../foundation/scope-folders.ts';
import type { SkillsOrigin } from '../../settings/customization/sources.ts';

/**
 * Where skills and command files are read from, one rule per scope (skills.md, "Choose where skills
 * load"; permissions.md, "Additional directories grant file access, not configuration"). A registry
 * typed over the scopes, so a new scope fails the typecheck until it says where it reads and what it
 * loads as. `rank` is the precedence of "Resolve skills that share a name": the managed (enterprise)
 * directory over the personal folder over the project, then the skills below the working
 * directory, then the added directories, then the skills synced from claude.ai.
 */
export const SCAN_SCOPES = [
  'managed',
  'user',
  'project',
  'nested',
  'additional',
  'synced',
] as const;
export type ScanScope = (typeof SCAN_SCOPES)[number];

/** What a scan is asked for. */
export interface ScanRequest extends ScopeRequest {
  /** Directories below `cwd` whose `.claude/skills` the session loaded (see `scanNested`). */
  readonly nestedDirectories?: readonly string[];
}

export interface ScanContext extends ScopeContext<ScanRequest> {
  /** Whether `strictPluginOnlyCustomization` lets a source load; absent, every source does. */
  readonly allows?: (origin: SkillsOrigin) => boolean;
}

interface Container {
  /** The folder below a base directory's scope folder (`.claude`, or an extra one): `skills`. */
  readonly folder: string;
  /** The name `strictPluginOnlyCustomization` knows this source by. */
  readonly origin: SkillsOrigin;
}

export interface ScopeRule {
  readonly rank: number;
  /** What a skill or command of this scope is read as. */
  readonly origin: SkillOrigin;
  readonly skills: Container | undefined;
  readonly commands: Container | undefined;
  /**
   * Whether the session watches the skills folder for changes (skills.md, "Edit a skill during a
   * session": the personal folder, the project's and each added directory's).
   */
  readonly watched: boolean;
  /** Whether a skill folder at the `index`th base may be a plugin (`<name>@skills-dir`); only below `.claude`. */
  pluginsAt(index: number): boolean;
  /** Whether the host's extra scope folders are read too (`scopeFoldersOf`), or `.claude` alone. */
  readonly extraFolders: boolean;
  /**
   * The folders read, for the scope folders asked: each base directory's `.claude` (the configuration
   * directory itself for the user scope), then the extra ones. Order is precedence within the scope.
   */
  readonly places: ScopePlaces<ScanContext>;
}

const SKILLS = 'skills';
const COMMANDS = 'commands';

export const SCOPE_RULES: { readonly [S in ScanScope]: ScopeRule } = {
  managed: {
    rank: 0,
    origin: { kind: 'managed' },
    skills: { folder: SKILLS, origin: 'managedDirectory' },
    commands: undefined,
    watched: false,
    pluginsAt: () => false,
    extraFolders: true,
    places: SCOPE_PLACES.managed,
  },
  user: {
    rank: 1,
    origin: { kind: 'user' },
    skills: { folder: SKILLS, origin: 'userSkills' },
    commands: { folder: COMMANDS, origin: 'userCommands' },
    watched: true,
    pluginsAt: () => true,
    extraFolders: true,
    places: SCOPE_PLACES.user,
  },
  project: {
    rank: 2,
    origin: { kind: 'project' },
    skills: { folder: SKILLS, origin: 'projectSkills' },
    commands: { folder: COMMANDS, origin: 'projectCommands' },
    watched: true,
    // "unlike plain skills and commands, [plugins don't] search parent directories" (loading.md).
    pluginsAt: (index) => index === 0,
    extraFolders: true,
    places: SCOPE_PLACES.project,
  },
  nested: {
    rank: 3,
    origin: { kind: 'project' },
    skills: { folder: SKILLS, origin: 'projectSkills' },
    commands: undefined,
    watched: false,
    pluginsAt: () => false,
    extraFolders: true,
    places: placesBelow(({ request }: ScanContext) =>
      Promise.resolve(request.nestedDirectories ?? []),
    ),
  },
  additional: {
    rank: 4,
    origin: { kind: 'project' },
    skills: { folder: SKILLS, origin: 'addDir' },
    commands: { folder: COMMANDS, origin: 'addDir' },
    watched: true,
    pluginsAt: () => false,
    extraFolders: true,
    places: SCOPE_PLACES.added,
  },
  synced: {
    rank: 5,
    origin: { kind: 'synced' },
    skills: { folder: `${SKILLS}/synced`, origin: 'synced' },
    commands: undefined,
    watched: false,
    pluginsAt: () => false,
    // claude.ai's own folder: never an extra one.
    extraFolders: false,
    places: SCOPE_PLACES.user,
  },
};

/** The scopes of a full scan, in precedence order; `nested` is scanned as the session touches files. */
export const SCANNED_SCOPES = [
  'managed',
  'user',
  'project',
  'additional',
  'synced',
] as const satisfies readonly ScanScope[];
