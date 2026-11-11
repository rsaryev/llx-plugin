import { error, type PluginIssue } from '../format/issues.ts';
import type {
  MarketplaceSourceKind,
  PluginSource,
  PluginSourceKind,
  PluginSourceOf,
} from '../format/marketplace/types.ts';
import { containsSession, readPrintedPath } from './command-output.ts';
import { LINKS_NEED_POSIX, linkOnWindowsIssue } from './command-mode.ts';

/**
 * How a plugin is installed: loaded where it lies, copied into the cache, or linked from the cache
 * entry (plugins/loading.md, "In-place and copied plugins"; plugins/marketplace-reference.md, "Copy
 * mode and link mode", "Output that fails the install or update"; plugins/host-marketplace.md,
 * "Edit plugins in place on a shared directory"). Pure: the origin and the source in, a decision or
 * the refusal out; the host copies, links or extracts.
 */

export type InstallMode = 'in-place' | 'copy' | 'link-in-cache';

/** Where a plugin came from, as far as how it is installed goes. */
export type InstallOrigin =
  /** `--plugin-dir` with a directory, or a folder of `CLAUDE_CODE_PLUGIN_DIRS`. */
  | { readonly kind: 'session-directory' }
  /** `--plugin-dir` with a `.zip`, or `--plugin-url`. */
  | { readonly kind: 'session-archive' }
  | { readonly kind: 'skills-directory' }
  | {
      readonly kind: 'marketplace';
      /** How the marketplace was added; absent when the plugin has none (a copy of the entry is all there is). */
      readonly marketplace?: MarketplaceSourceKind;
      readonly source: PluginSource;
    };

export interface InstallDecision {
  readonly mode: InstallMode;
  /** Link mode: the cache entry holds links to the printed directory, which must stay where it is. */
  readonly linked: boolean;
  /** The plugin has a folder in the cache (a copy, or the links of link mode); a plugin loaded in place has none. */
  readonly cached: boolean;
  /** "A `--plugin-url` archive or a `--plugin-dir` `.zip` is extracted into a session temp directory first." */
  readonly extractFirst: boolean;
  /** Whether Claude Code installs the plugin's Node.js packages (only into a copied version directory). */
  readonly dependencyInstall: boolean;
  /**
   * Whether an edit to the source reaches a session only through an update: a copy is a snapshot,
   * a plugin loaded in place "take[s] effect at the next session start or `/reload-plugins`", and a
   * link-mode plugin is loaded in place (judgment: the docs say "loads the files in place").
   */
  readonly editsNeedUpdate: boolean;
}

/** What the command printed and where the session started, for the checks that need them. */
export interface PrintedDirectory {
  readonly directory: string;
  readonly sessionCwd?: string;
}

export interface ModeInput {
  readonly origin: InstallOrigin;
  readonly platform: 'posix' | 'windows';
  /** For a `command` source: its printed directory. */
  readonly printed?: PrintedDirectory;
}

/** What a mode means; the facts of a decision follow from it, one registry entry per mode. */
const FACTS: {
  readonly [M in InstallMode]: Pick<
    InstallDecision,
    'linked' | 'cached' | 'dependencyInstall' | 'editsNeedUpdate'
  >;
} = {
  'in-place': { linked: false, cached: false, dependencyInstall: false, editsNeedUpdate: false },
  // "Claude Code skips the Node.js package dependency install for a link-mode plugin"
  'link-in-cache': { linked: true, cached: true, dependencyInstall: false, editsNeedUpdate: false },
  // "Claude Code installs the dependencies into the copied version directory"
  copy: { linked: false, cached: true, dependencyInstall: true, editsNeedUpdate: true },
};

const decision = (mode: InstallMode, extractFirst = false): InstallDecision => ({
  mode,
  extractFirst,
  ...FACTS[mode],
});

/** "Relative-path plugins in a marketplace you added from a local path" load in place. */
const LOCAL_MARKETPLACE: { readonly [K in MarketplaceSourceKind]: boolean } = {
  github: false,
  git: false,
  url: false,
  file: true,
  directory: true,
  npm: false,
  settings: false,
  'skills-dir': false,
  hostPattern: false,
  pathPattern: false,
};

/** What each plugin source does; "Every other marketplace plugin" is copied. */
const BY_SOURCE: {
  readonly [K in PluginSourceKind]: (source: PluginSourceOf<K>, local: boolean) => InstallMode;
} = {
  relative: (_, local) => (local ? 'in-place' : 'copy'),
  github: () => 'copy',
  url: () => 'copy',
  'git-subdir': () => 'copy',
  npm: () => 'copy',
  archive: () => 'copy',
  // `mode`: "copy, the default, or link"; link "loads the files in place, through links in the cache entry".
  command: (source) => (LINKS_NEED_POSIX[source.mode] ? 'link-in-cache' : 'copy'),
};

function modeOfSource<K extends PluginSourceKind>(
  source: PluginSourceOf<K>,
  local: boolean,
): InstallMode {
  const decide: (source: PluginSourceOf<K>, local: boolean) => InstallMode = BY_SOURCE[source.kind];
  return decide(source, local);
}

type Origin<K extends InstallOrigin['kind']> = Extract<InstallOrigin, { kind: K }>;

const BY_ORIGIN: {
  readonly [K in InstallOrigin['kind']]: (origin: Origin<K>) => InstallDecision;
} = {
  // "the directory loads in place and is never copied"
  'session-directory': () => decision('in-place'),
  'session-archive': () => decision('in-place', true),
  'skills-directory': () => decision('in-place'),
  marketplace: (origin) =>
    decision(
      modeOfSource(
        origin.source,
        origin.marketplace !== undefined && LOCAL_MARKETPLACE[origin.marketplace],
      ),
    ),
};

function decisionOf<K extends InstallOrigin['kind']>(origin: Origin<K>): InstallDecision {
  const decide: (origin: Origin<K>) => InstallDecision = BY_ORIGIN[origin.kind];
  return decide(origin);
}

/** The refusal when the printed directory is the session's own directory or one of its parents. */
export const sessionDirectoryIssue = (printed: string): PluginIssue =>
  error(
    'source',
    `The printed directory "${printed}" is the directory Claude Code was started in, or one of its parents`,
  );

/** What a printed directory fails on before its contents are read: a network path, the session's own directory. */
function printedIssue(printed: PrintedDirectory, platform: ModeInput['platform']) {
  const reading = readPrintedPath(printed.directory, platform);
  if ('problem' in reading) return error('source.command', reading.problem);
  return containsSession(printed.directory, printed.sessionCwd, platform)
    ? sessionDirectoryIssue(printed.directory)
    : undefined;
}

/**
 * How the plugin is installed, or why it may not be: "Claude Code refuses to install a link-mode
 * plugin on Windows", and a printed directory that is a UNC path on Windows or "the one Claude Code
 * was started in, or one of its parents" fails the install.
 */
export function decideInstallMode(input: ModeInput): InstallDecision | PluginIssue {
  const decided = decisionOf(input.origin);
  if (input.platform === 'windows' && decided.linked) {
    return linkOnWindowsIssue();
  }
  const refused =
    input.printed === undefined ? undefined : printedIssue(input.printed, input.platform);
  return refused ?? decided;
}

/**
 * "Sessions started inside the directory": "a session started in the printed directory or anywhere
 * below it doesn't load" a link-mode plugin. Only link mode loads from the printed directory.
 */
export function linkedPluginLoads(
  decided: InstallDecision,
  printed: PrintedDirectory,
  platform: ModeInput['platform'],
): boolean {
  return !decided.linked || !containsSession(printed.directory, printed.sessionCwd, platform);
}
