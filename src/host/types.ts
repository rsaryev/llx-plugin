import type { PluginIssue } from '../format/issues.ts';
import type { Plugin } from '../loading/index.ts';
import type { FolderScan } from '../ports/folder-scan.ts';
import type { EnvFileStore, HookEngineOptions, HookPorts } from '../hooks/index.ts';
import type { ParentSettingsContext } from '../settings/hooks/index.ts';
import type { PolicyView } from '../settings/index.ts';
import type { OptionValues } from '../settings/plugins/index.ts';
import type { ExpandSession } from '../skills/index.ts';

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

/** A plugin the host knows and whether it runs. */
export interface HostedPlugin {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
}

/** What the host passes: the ports, with the ones its hook handler types need. */
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
  readonly shells?: {
    readonly bash: boolean;
    readonly powershell: boolean;
  };
  /** The host process's id: `CLAUDE_PID` in every command hook (env-vars.md). Absent, the variable is not set. */
  readonly processId?: number;
  /** Host execution choices, forwarded unchanged to the hook engine; not plugin policy overrides. */
  readonly hookExecution?: Pick<
    HookEngineOptions,
    'defaultShell' | 'shellPaths' | 'startDirectory' | 'tempDirectory'
  >;
  /**
   * Where `CLAUDE_ENV_FILE` lives (hooks.md, "Persist environment variables"): the files a session's
   * hooks write and the shells of the host read. Absent, hooks get no `CLAUDE_ENV_FILE`.
   */
  readonly envFiles?: EnvFileStore;
  /**
   * An app or a self-hosted runner built this host's launch environment: a settings `env` value never
   * replaces a variable it sets (settings-reference.md, "How `env` values interact with your shell").
   */
  readonly launchOwnsEnvironment?: boolean;
}

/**
 * What `host.update` replaces: each part given (and not `undefined`) replaces the host's own whole;
 * a part left out stays. The ports, `windows` and `shells` are the host's for good. To clear the
 * settings give `createPolicyView([])`; `userConfig` replaces the saved values of every plugin.
 */
export type HostUpdate = {
  readonly [K in 'plugins' | 'settings' | 'parentSettings' | 'userConfig']?:
    | PluginHostOptions[K]
    | undefined;
};

/** A resolved list and what was found wrong while resolving it. */
export interface Resolved<T> {
  readonly resolved: readonly T[];
  readonly issues: readonly PluginIssue[];
}
