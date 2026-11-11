import { warning, type PluginIssue } from '../../format/issues.ts';
import type { Settings } from '../../protocol/official.ts';
import type { ManagedSource } from './admin-source.ts';

/**
 * The delivery mechanisms as data (managed-settings.md, "Deploy a managed settings file", "Choose a
 * delivery mechanism", "Where each mechanism stores the policy"): where each stores the policy, how
 * often Claude Code reads it, and which source of the composition it is.
 */
export const PLATFORMS = ['macos', 'linux', 'wsl', 'windows'] as const;
export type Platform = (typeof PLATFORMS)[number];

export const MECHANISMS = ['serverManaged', 'mdm', 'file', 'hkcu'] as const;
export type Mechanism = (typeof MECHANISMS)[number];

export interface MechanismTraits {
  /** The sources of the composition this mechanism fills, on a machine that has it. */
  readonly sources: readonly ManagedSource[];
  /** "Read at startup" holds for every mechanism. */
  readonly readAtStartup: boolean;
  /** Minutes between checks for a change; absent when the mechanism is not polled. */
  readonly pollEveryMinutes?: number;
  /** "Reloaded when a file changes". */
  readonly reloadsOnChange: boolean;
  /** "The MDM and file rows are together called endpoint-managed settings, because the policy is stored on the developer's device." */
  readonly endpointManaged: boolean;
}

export const MECHANISM_TRAITS: { readonly [M in Mechanism]: MechanismTraits } = {
  serverManaged: {
    sources: ['remote'],
    readAtStartup: true,
    pollEveryMinutes: 60,
    reloadsOnChange: false,
    endpointManaged: false,
  },
  mdm: {
    sources: ['plist', 'hklm'],
    readAtStartup: true,
    pollEveryMinutes: 30,
    reloadsOnChange: false,
    endpointManaged: true,
  },
  file: {
    sources: ['file'],
    readAtStartup: true,
    reloadsOnChange: true,
    endpointManaged: true,
  },
  hkcu: {
    sources: ['hkcu'],
    readAtStartup: true,
    pollEveryMinutes: 30,
    reloadsOnChange: false,
    endpointManaged: false,
  },
};

export interface RereadFacts {
  readonly minutesSinceRead: number;
  /** The file changed on disk since it was read. */
  readonly changed: boolean;
}

/** Whether Claude Code reads the mechanism again now: on its poll interval, or when its file changes. */
export function rereadDue(mechanism: Mechanism, facts: RereadFacts): boolean {
  const traits = MECHANISM_TRAITS[mechanism];
  const polled =
    traits.pollEveryMinutes !== undefined && facts.minutesSinceRead >= traits.pollEveryMinutes;
  return polled || (traits.reloadsOnChange && facts.changed);
}

/** The MDM mechanism a platform has: a configuration profile on macOS, the `HKLM` registry on Windows; Linux has neither. */
export const MDM_SOURCE: { readonly [P in Platform]: ManagedSource | undefined } = {
  macos: 'plist',
  linux: undefined,
  wsl: 'hklm',
  windows: 'hklm',
};

/** "The `com.anthropic.claudecode` managed preferences domain." */
export const PLIST_DOMAIN = 'com.anthropic.claudecode';

/** The registry: "the JSON as a `REG_SZ` or `REG_EXPAND_SZ` value named `Settings` under `SOFTWARE\Policies\ClaudeCode`". */
export const REGISTRY_VALUE = {
  name: 'Settings',
  types: ['REG_SZ', 'REG_EXPAND_SZ'],
  key: 'SOFTWARE\\Policies\\ClaudeCode',
} as const;

export const HIVES = ['HKLM', 'HKCU'] as const;
export type Hive = (typeof HIVES)[number];

/** The registry path of a hive's policy value, as `/status` and errors write it. */
export const registryPath = (hive: Hive): string =>
  `${hive}\\${REGISTRY_VALUE.key}\\${REGISTRY_VALUE.name}`;

/** The system directory of each platform, and the separator its paths use. */
const SYSTEM_DIRECTORY: {
  readonly [P in Platform]: { readonly dir: string; readonly separator: string };
} = {
  macos: { dir: '/Library/Application Support/ClaudeCode', separator: '/' },
  linux: { dir: '/etc/claude-code', separator: '/' },
  wsl: { dir: '/etc/claude-code', separator: '/' },
  windows: { dir: 'C:\\Program Files\\ClaudeCode', separator: '\\' },
};

export interface ManagedFilePaths {
  readonly dir: string;
  /** `managed-settings.json`. */
  readonly settings: string;
  /** `managed-settings.d/`, the drop-in directory. */
  readonly dropIns: string;
  /** `managed-mcp.json`. */
  readonly mcp: string;
}

/** Where the file-based mechanism keeps its files. */
export function managedFilePaths(platform: Platform): ManagedFilePaths {
  const { dir, separator } = SYSTEM_DIRECTORY[platform];
  const inside = (name: string): string => `${dir}${separator}${name}`;
  return {
    dir,
    settings: inside('managed-settings.json'),
    dropIns: inside('managed-settings.d'),
    mcp: inside('managed-mcp.json'),
  };
}

/** Whether Claude Code reads `path` as the managed settings file of `platform`. */
export const readsManagedSettingsAt = (platform: Platform, path: string): boolean =>
  path === managedFilePaths(platform).settings;

export interface SymlinkFacts {
  /** The deployed file's path. */
  readonly path: string;
  /** Whether the link's target is inside the system directory; `undefined` when Claude Code cannot confirm it. */
  readonly targetInside: boolean | undefined;
}

export interface SymlinkVerdict {
  /** "The policy still applies" whatever the link leads to. */
  readonly applies: boolean;
  /** The warning `/status` and `claude doctor` show, naming the file. */
  readonly warning?: PluginIssue;
}

/**
 * A managed file deployed as a symbolic link: "Claude Code reads the file the link leads to. The
 * policy still applies when the link leads outside the system directory or Claude Code can't confirm
 * that it stays inside. A warning naming the file then appears in `/status` and `claude doctor`."
 */
export function symlinkVerdict(facts: SymlinkFacts): SymlinkVerdict {
  if (facts.targetInside === true) return { applies: true };
  return {
    applies: true,
    warning: warning(
      facts.path,
      `${facts.path} is a symbolic link that does not lead to a target inside the system directory; point the link at a target inside it to clear this warning`,
    ),
  };
}

/** What one fetch of server-managed settings came to: the policy it delivered, or a failure. */
export type ServerFetch =
  | { readonly ok: true; readonly settings: Settings | undefined }
  | { readonly ok: false };

/**
 * The local cache of server-managed settings: "Claude Code keeps a local cache that it applies at
 * startup and replaces on each successful fetch", so an edit to the cache "lasts only until the next
 * successful fetch" (managed-settings.md, "Where each mechanism stores the policy", "What a developer
 * can change"). A failed fetch leaves the cache as it is.
 */
export const cacheAfterFetch = (
  cached: Settings | undefined,
  fetch: ServerFetch,
): Settings | undefined => (fetch.ok ? fetch.settings : cached);

/** How long a developer's edit of a managed source stays. */
export const EDIT_OUTCOMES = ['stays', 'until-next-fetch', 'refused'] as const;
export type EditOutcome = (typeof EDIT_OUTCOMES)[number];

/**
 * What a developer's own edit of the managed source does (managed-settings.md, "What a developer can
 * change"): "a developer who is an administrator on the machine can edit the managed source itself"
 * (the file, the MDM profile; MDM tooling can redeploy it); the HKCU registry is user-writable; an edit
 * to the server-managed cache lasts until the next successful fetch.
 */
const EDITS: { readonly [M in Mechanism]: (localAdmin: boolean) => EditOutcome } = {
  serverManaged: () => 'until-next-fetch',
  mdm: (localAdmin) => (localAdmin ? 'stays' : 'refused'),
  file: (localAdmin) => (localAdmin ? 'stays' : 'refused'),
  hkcu: () => 'stays',
};

export const editOfManagedSource = (mechanism: Mechanism, localAdmin: boolean): EditOutcome =>
  EDITS[mechanism](localAdmin);
