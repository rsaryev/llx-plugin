import type { SkillOrigin } from '../../format/skill-types.ts';
import type { FolderScan } from '../../ports/folder-scan.ts';
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
export interface ScanRequest {
  readonly home: string;
  /** The working directory the session started in (or moved to with `/cd`). */
  readonly cwd: string;
  /** The directories passed with `--add-dir` or `/add-dir`, in the order they were added. */
  readonly addedDirectories?: readonly string[];
  /** Directories below `cwd` whose `.claude/skills` the session loaded (see `scanNested`). */
  readonly nestedDirectories?: readonly string[];
}

export interface ScanContext {
  readonly folders: FolderScan;
  readonly request: ScanRequest;
  /** Whether `strictPluginOnlyCustomization` lets a source load; absent, every source does. */
  readonly allows?: (origin: SkillsOrigin) => boolean;
  readonly signal?: AbortSignal;
}

interface Container {
  /** The folder below a base directory. */
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
  /** Whether a skill folder at the `index`th base may be a plugin (`<name>@skills-dir`). */
  pluginsAt(index: number): boolean;
  /** The base directories, whose `.claude` folder is read. Order is precedence within the scope. */
  bases(context: ScanContext): Promise<readonly string[]>;
}

const SKILLS = '.claude/skills';
const COMMANDS = '.claude/commands';

const only = (dir: string | undefined): Promise<readonly string[]> =>
  Promise.resolve(dir === undefined ? [] : [dir]);

/**
 * The project's own folders: the working directory and every parent up to the repository root. In a
 * linked worktree whose top has no `.claude/skills`, the main checkout's project skills load instead
 * (v2.1.277 and later, skills.md, "Load skills in monorepos and subdirectories"). Judgment
 * (spec/judgments.md): worktrees.md titles that bullet "skills, agents, and commands", so the main
 * checkout's `.claude/commands` load too; it is never a base of a skill-folder plugin.
 */
async function projectBases(context: ScanContext): Promise<readonly string[]> {
  const { folders, request, signal } = context;
  const chain = await folders.repository(request.cwd, signal);
  const top = chain.directories.at(-1);
  if (chain.mainCheckout === undefined || top === undefined) return chain.directories;
  const folder = await folders.open(top, signal);
  const has = folder !== undefined && (await folder.files.exists(SKILLS, signal));
  return has ? chain.directories : [...chain.directories, chain.mainCheckout];
}

export const SCOPE_RULES: { readonly [S in ScanScope]: ScopeRule } = {
  managed: {
    rank: 0,
    origin: { kind: 'managed' },
    skills: { folder: SKILLS, origin: 'managedDirectory' },
    commands: undefined,
    watched: false,
    pluginsAt: () => false,
    bases: ({ folders }) => only(folders.managedDirectory()),
  },
  user: {
    rank: 1,
    origin: { kind: 'user' },
    skills: { folder: SKILLS, origin: 'userSkills' },
    commands: { folder: COMMANDS, origin: 'userCommands' },
    watched: true,
    pluginsAt: () => true,
    bases: ({ request }) => only(request.home),
  },
  project: {
    rank: 2,
    origin: { kind: 'project' },
    skills: { folder: SKILLS, origin: 'projectSkills' },
    commands: { folder: COMMANDS, origin: 'projectCommands' },
    watched: true,
    // "unlike plain skills and commands, [plugins don't] search parent directories" (loading.md).
    pluginsAt: (index) => index === 0,
    bases: projectBases,
  },
  nested: {
    rank: 3,
    origin: { kind: 'project' },
    skills: { folder: SKILLS, origin: 'projectSkills' },
    commands: undefined,
    watched: false,
    pluginsAt: () => false,
    bases: ({ request }) => Promise.resolve(request.nestedDirectories ?? []),
  },
  additional: {
    rank: 4,
    origin: { kind: 'project' },
    skills: { folder: SKILLS, origin: 'addDir' },
    commands: { folder: COMMANDS, origin: 'addDir' },
    watched: true,
    pluginsAt: () => false,
    bases: ({ request }) => Promise.resolve(request.addedDirectories ?? []),
  },
  synced: {
    rank: 5,
    origin: { kind: 'synced' },
    skills: { folder: `${SKILLS}/synced`, origin: 'synced' },
    commands: undefined,
    watched: false,
    pluginsAt: () => false,
    bases: ({ request }) => only(request.home),
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
