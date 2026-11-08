import type { PluginIssue } from '../format/issues.ts';
import type { Plugin } from '../loading/index.ts';
import type { HookPorts } from '../hooks/index.ts';
import type { FolderScan } from '../ports/folder-scan.ts';
import type { EffortLevel, PermissionMode } from '../protocol/official.ts';
import type { ParentSettingsContext } from '../settings/hooks/index.ts';
import type { PolicyView } from '../settings/index.ts';
import type { OptionValues } from '../settings/plugins/index.ts';
import type { ExpandSession, ShellPermission } from '../skills/index.ts';

/** A plugin the host was given: loaded once (`loadPlugin`), known by its `name@marketplace` id. */
export interface HostPlugin {
  /** The id the plugin is installed under, `name@marketplace`: the key of `enabledPlugins`. */
  readonly id: string;
  readonly plugin: Plugin;
  /**
   * Whether the host runs it. Absent, the `enabledPlugins` of the settings decide, and a plugin
   * nothing names is on. Managed settings that turn it off win over any value given here.
   */
  readonly enabled?: boolean;
  /** Where the plugin came from; see `SkillPluginSource`. Default `installed`. */
  readonly source?: NonNullable<ExpandSession['pluginSource']>;
}

/**
 * What the host passes: the ports, with the ones its hook handler types need, and `folders`, the
 * scope folders the personal, project, managed and added-directory skills are read from; without it
 * a session lists the plugins' skills only.
 */
export type HostPorts = HookPorts & { readonly folders?: FolderScan };

export interface PluginHostOptions {
  readonly plugins: readonly HostPlugin[];
  readonly ports: HostPorts;
  /** The settings after `createPolicyView`; absent, no settings file exists. */
  readonly settings?: PolicyView;
  /** How parent settings are treated; default: no administrator and no parent merge. */
  readonly parentSettings?: ParentSettingsContext;
  /** The saved `userConfig` values by plugin id; they win over `pluginConfigs` of the settings. */
  readonly userConfig?: Readonly<Record<string, OptionValues>>;
  /** A Windows host: paths are written with forward slashes where the docs say so. */
  readonly windows?: boolean;
  /** The shells a skill's `shell` field can pick; default `bash` only, plus PowerShell when `windows`. */
  readonly shells?: { readonly bash: boolean; readonly powershell: boolean };
}

export interface SessionOptions {
  readonly sessionId: string;
  /** The working directory: hook input `cwd`, and where `if` path rules and shell placeholders run. */
  readonly cwd: string;
  readonly permissionMode: PermissionMode;
  readonly transcriptPath: string;
  /** The active effort of the turn: hook input `effort` and `${CLAUDE_EFFORT}`. */
  readonly effort?: { readonly level: EffortLevel };
  /** False with `-p` or through the Agent SDK. Default true. */
  readonly interactive?: boolean;
  /** Settings-file hooks may run (workspace trust). Default true. */
  readonly trusted?: boolean;
  /** Extra folders path rules in a hook's `if` treat as inside the project. */
  readonly additionalDirectories?: readonly string[];
  /**
   * The directories passed with `--add-dir` or `/add-dir`, in the order they were added. Their
   * `.claude/skills` and `.claude/commands` load (`permissions.additionalDirectories` of a settings
   * file grants file access only: skills.md, "Load skills from a directory outside the project").
   */
  readonly addedDirectories?: readonly string[];
  /**
   * The commands other sources already use: the host's built-in commands, its bundled skills and its
   * MCP prompts, as typed without the slash (`usage`, `code-review`). The plugins' skills count
   * already. Only a synced skill's short name yields to them; a skill of the folders replaces a
   * built-in or bundled command of its name (skills.md, "Resolve skills that share a name" and "When a
   * synced skill name matches another command").
   */
  readonly takenCommands?: readonly string[];
  /** The answer for a skill's shell placeholder; absent, an `ask`, which aborts the expansion. */
  readonly permissions?: ShellPermission;
}

/** A resolved list and what was found wrong while resolving it. */
export interface Resolved<T> {
  readonly resolved: readonly T[];
  readonly issues: readonly PluginIssue[];
}
