import type { FileScope } from './reach.ts';

/**
 * Where the settings files are and who makes them (settings.md, "Settings files and who they
 * affect", "Find or create your settings files", "Keep personal settings out of a repository" and
 * "Where Claude Code keeps the local file in a git repository"). Pure data and decisions: the host
 * reads the folders, owns the paths' spelling (`joinPath`) and writes the files.
 */

/** Who makes a file when it is absent: the docs' "create them yourself, or let Claude Code create them". */
export type FileMaker = 'organization' | 'you' | 'claude-code';

export interface FileOrigin {
  /** The path as the docs write it, from the home folder (`~/.claude`) or the project folder (bare `.claude`). */
  readonly documentedPath: string;
  readonly madeBy: readonly FileMaker[];
  /** The person can edit it. A managed file is deployed: "You don't create or edit it". */
  readonly youEdit: boolean;
}

/** `managed-settings.json` and the other managed sources have no one path (managed-settings.md, "Delivery mechanisms"). */
export const FILE_ORIGINS: { readonly [S in FileScope]: FileOrigin } = {
  user: {
    documentedPath: '~/.claude/settings.json',
    madeBy: ['you', 'claude-code'],
    youEdit: true,
  },
  project: {
    documentedPath: '.claude/settings.json',
    // "a project that already uses Claude Code may have one committed. If not, create it"
    madeBy: ['you'],
    youEdit: true,
  },
  local: {
    documentedPath: '.claude/settings.local.json',
    madeBy: ['you', 'claude-code'],
    youEdit: true,
  },
  managed: {
    documentedPath: 'managed-settings.json',
    madeBy: ['organization'],
    youEdit: false,
  },
};

/**
 * What makes Claude Code write a settings file, and which one (settings.md, "Find or create your
 * settings files", "Use the /config menu"; model-config.md, "Setting your model"). Installing it
 * creates none: it writes `~/.claude/settings.json` "the first time you change an option in the
 * `/config` menu that it stores in user settings, such as the theme", and `.claude/settings.local.json`
 * "the first time you give a standing approval on a permission prompt". The `/config` options that
 * are global config keys go to `~/.claude.json`, which is no settings file.
 */
export const WRITE_TRIGGERS = [
  'config-option',
  'config-option-kept-local',
  'permission-standing-approval',
  'model-default',
] as const;
export type WriteTrigger = (typeof WRITE_TRIGGERS)[number];

/**
 * The files Claude Code writes: only the user file and the local file. The shared project file is
 * yours and a managed file is the organization's, so no trigger can name either: the type says it.
 */
export type WrittenScope = Extract<FileScope, 'user' | 'local'>;

export const WRITE_TARGET: { readonly [T in WriteTrigger]: WrittenScope } = {
  'config-option': 'user',
  // "A few options, such as Show tips: .claude/settings.local.json"
  'config-option-kept-local': 'local',
  'permission-standing-approval': 'local',
  // "`/model` saves your choice as the default for new sessions by writing the `model` field in your user settings"
  'model-default': 'user',
};

/** The host's facts for the files it joins paths for. */
export interface FileFacts {
  readonly homeDir: string;
  /** The `CLAUDE_CONFIG_DIR` the session starts with; empty counts as unset. */
  readonly configDirEnv: string | undefined;
  readonly projectDir: string;
  readonly joinPath: (base: string, relativePath: string) => string;
}

/**
 * The folder holding the home-directory files: `CLAUDE_CONFIG_DIR` when set, else `~/.claude`
 * ("Claude Code then stores your settings, session history, and plugins there instead").
 */
export const configDirOf = (facts: FileFacts): string =>
  facts.configDirEnv === undefined || facts.configDirEnv === ''
    ? facts.joinPath(facts.homeDir, '.claude')
    : facts.configDirEnv;

/** The user file, `~/.claude/settings.json` or the one under `CLAUDE_CONFIG_DIR`. */
export const userSettingsFile = (facts: FileFacts): string =>
  facts.joinPath(configDirOf(facts), 'settings.json');

/** The shared project file, in the project folder (the session's primary working directory). */
export const projectSettingsFile = (facts: FileFacts): string =>
  facts.joinPath(facts.projectDir, '.claude/settings.json');

/** What the host found about the git repository the session starts in. */
export interface RepositoryFacts {
  /** The repository root; in a worktree, the main checkout's root. */
  readonly root: string;
  /** The root, its `.git` and its `.claude` entry are all owned by the user. */
  readonly ownedByUser: boolean;
}

export interface LocalPlacementFacts {
  readonly homeDir: string;
  readonly windows: boolean;
  /** `undefined` outside a git repository. */
  readonly repository: RepositoryFacts | undefined;
}

/**
 * The folder whose `.claude/settings.local.json` is the local file: the repository root. The file
 * stays with `.claude/settings.json` (`undefined` here) "outside a git repository, when the
 * repository root is your home directory, on Windows, or when the repository root or its `.git` or
 * `.claude` entry isn't owned by your user".
 */
export function localSettingsRoot(facts: LocalPlacementFacts): string | undefined {
  const { repository } = facts;
  if (repository === undefined || facts.windows || !repository.ownedByUser) return undefined;
  return repository.root === facts.homeDir ? undefined : repository.root;
}

/**
 * The local files to read, the one that applies first first. Before v2.1.211 the file was kept in
 * the starting directory, and Claude Code "still reads a file an earlier version left there
 * alongside the root file; where both set the same key, the root's value applies, and permission
 * rules from both files apply".
 */
export function localSettingsFiles(
  facts: LocalPlacementFacts & Pick<FileFacts, 'projectDir' | 'joinPath'>,
): readonly string[] {
  const root = localSettingsRoot(facts);
  const own = facts.joinPath(facts.projectDir, '.claude/settings.local.json');
  if (root === undefined || root === facts.projectDir) return [own];
  return [facts.joinPath(root, '.claude/settings.local.json'), own];
}

/** The line Claude Code adds to the global git excludes (settings.md, "Keep personal settings out of a repository"). */
export const LOCAL_FILE_IGNORE_ENTRY = '**/.claude/settings.local.json';

export interface GitExcludeFacts {
  /** Git's `core.excludesFile` from the global config, as written; `undefined` when unset. */
  readonly coreExcludesFile: string | undefined;
  readonly xdgConfigHome: string | undefined;
  readonly homeDir: string;
  readonly joinPath: (base: string, relativePath: string) => string;
}

const isAbsolute = (path: string): boolean => path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path);

/**
 * The global git excludes file: `core.excludesFile` "when your global git config sets it to an
 * absolute or `~`-prefixed path; otherwise it's `$XDG_CONFIG_HOME/git/ignore`, or
 * `~/.config/git/ignore` when `XDG_CONFIG_HOME` is unset".
 */
export function globalGitExcludesFile(facts: GitExcludeFacts): string {
  const configured = facts.coreExcludesFile;
  if (configured !== undefined && isAbsolute(configured)) return configured;
  if (configured?.startsWith('~/')) return facts.joinPath(facts.homeDir, configured.slice(2));
  const xdg = facts.xdgConfigHome;
  return xdg === undefined || xdg === ''
    ? facts.joinPath(facts.homeDir, '.config/git/ignore')
    : facts.joinPath(xdg, 'git/ignore');
}

export interface FirstWriteFacts {
  readonly inGitRepository: boolean;
  /** The repository already ignores the file (a `.gitignore` or the global excludes). */
  readonly alreadyIgnored: boolean;
  /** Claude Code writes the file now, rather than you having made it by hand. */
  readonly claudeCodeWrites: boolean;
}

/**
 * Whether Claude Code adds `LOCAL_FILE_IGNORE_ENTRY` now: "The first time Claude Code writes the
 * file in a git repository that doesn't already ignore it". A file you made by hand and Claude Code
 * has not written is yours to ignore.
 */
export const shouldAddGitExclude = (facts: FirstWriteFacts): boolean =>
  facts.claudeCodeWrites && facts.inGitRepository && !facts.alreadyIgnored;
