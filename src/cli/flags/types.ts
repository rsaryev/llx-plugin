import type { PluginIssue } from '../../format/issues.ts';
import type { ChannelEntry } from '../../settings/channels/verdict.ts';
import type { PolicyLayer, PolicyScope } from '../../settings/layers.ts';
import type { PermissionMode } from '../../protocol/official.ts';

/**
 * The shapes of the session flags (cli-reference.md, "CLI flags"): what the host parsed from the
 * command line (`FlagArguments`), what it knows about the machine (`FlagFacts`) and what the flags
 * add up to (`SessionPlan`). Every flag is one strategy in `flags/registry.ts` over `FlagName`; the
 * plan is data the host hands to the modules that own each behaviour (settings, loading, agents,
 * rules, mcp), so no decision is made twice.
 */

export const FLAG_NAMES = [
  '--plugin-dir',
  '--plugin-url',
  '--bare',
  '--safe-mode',
  '--restricted',
  '--setting-sources',
  '--settings',
  '--disable-slash-commands',
  '--add-dir',
  '--agent',
  '--agents',
  '--append-subagent-system-prompt',
  '--append-subagent-system-prompt-file',
  '--forward-subagent-text',
  '--channels',
  '--dangerously-load-development-channels',
  '--mcp-config',
  '--strict-mcp-config',
  '--permission-mode',
  '--tools',
] as const;
export type FlagName = (typeof FLAG_NAMES)[number];

/** What each flag was given: a repeatable flag its values in order, a switch `true`, the rest the text. */
export interface FlagArguments {
  readonly '--plugin-dir': readonly string[];
  readonly '--plugin-url': readonly string[];
  readonly '--bare': true;
  readonly '--safe-mode': true;
  readonly '--restricted': true;
  readonly '--setting-sources': string;
  readonly '--settings': string;
  readonly '--disable-slash-commands': true;
  readonly '--add-dir': readonly string[];
  readonly '--agent': string;
  readonly '--agents': string;
  readonly '--append-subagent-system-prompt': string;
  readonly '--append-subagent-system-prompt-file': string;
  readonly '--forward-subagent-text': true;
  readonly '--channels': readonly string[];
  readonly '--dangerously-load-development-channels': readonly string[];
  readonly '--mcp-config': readonly string[];
  readonly '--strict-mcp-config': true;
  readonly '--permission-mode': string;
  readonly '--tools': string;
}

export type GivenFlags = Partial<FlagArguments>;

/** A file the host read for a flag: whether it is a regular file, its size and its text. */
export interface FileFact {
  readonly regular: boolean;
  readonly bytes: number;
  readonly text: string;
}

export interface FlagFacts {
  /** `--print` (`-p`): a non-interactive run. */
  readonly print: boolean;
  /** `--resume` (`-r`): the run resumes a session. */
  readonly resume: boolean;
  /** `--continue` (`-c`): the run continues the latest session. */
  readonly continuing: boolean;
  /** The `agent` setting of the settings files, which `--agent` overrides. */
  readonly agentSetting?: string;
  /** `--output-format`, when given. */
  readonly outputFormat?: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly platform: 'posix' | 'windows';
  /** Managed settings set `disableSideloadFlags`. */
  readonly sideloadDisabled: boolean;
  /** The files a flag names, by the path it gave; a path with no entry does not exist. */
  readonly files: Readonly<Record<string, FileFact>>;
  /** What each `--add-dir` path is; a path with no entry does not exist. */
  readonly directories: Readonly<Record<string, 'directory' | 'file'>>;
}

export interface FlagContext {
  readonly given: GivenFlags;
  readonly facts: FlagFacts;
}

/** The customizations a mode can leave out (`flags/customizations.ts`). */
export const CUSTOMIZATIONS = [
  'hooks',
  'skills',
  'commands',
  'agents',
  'installed-plugins',
  'mcp-servers',
  'auto-memory',
  'claude-md',
  'output-styles',
  'workflows',
  'themes',
  'keybindings',
  'status-line',
  'file-suggestion',
  'lsp-servers',
] as const;
export type Customization = (typeof CUSTOMIZATIONS)[number];

/** A plugin for this session only: `--plugin-dir` and `--plugin-url` load plugins of the `inline` origin. */
export interface SessionPluginRequest {
  /** `directory`: a folder that is a plugin or holds plugins; `archive`: a `.zip` on disk; `url`: a `.zip` to fetch. */
  readonly source: 'directory' | 'archive' | 'url';
  readonly location: string;
  /** The reserved marketplace name the plugin's id ends with: `<name>@inline`. */
  readonly origin: 'inline';
}

export interface SessionChannel {
  /** The entry as typed. */
  readonly raw: string;
  /** What the channel verdict reads (`channelVerdict`). */
  readonly entry: ChannelEntry;
  /** A `server:<name>` entry names an MCP server, not a plugin. */
  readonly server?: string;
}

/** Where a `--mcp-config` value comes from: a JSON string typed on the command line or a file. */
export type McpConfigSource =
  | { readonly kind: 'inline'; readonly text: string }
  | { readonly kind: 'file'; readonly path: string };

export interface SessionPlan {
  /** Why startup exits with `1`: each a line on stderr. Empty when the session starts. */
  readonly refusals: readonly string[];
  readonly warnings: readonly PluginIssue[];
  readonly sessionPlugins: readonly SessionPluginRequest[];
  readonly skipped: readonly Customization[];
  /** Whether the session reads stored login credentials (OAuth tokens, the system keychain). */
  readonly readsStoredCredentials: boolean;
  /** Environment variables the flag sets for the session (`--bare` sets `CLAUDE_CODE_SIMPLE`). */
  readonly env: Readonly<Record<string, string>>;
  /** The settings scopes that load; absent means every one. */
  readonly settingScopes?: readonly PolicyScope[];
  /** The `--settings` layer, above the files. */
  readonly flagSettings?: PolicyLayer;
  readonly additionalDirectories: readonly string[];
  readonly agent?: string;
  /** The `--agents` definitions, parsed: one object keyed by agent name. */
  readonly cliAgents?: Readonly<Record<string, unknown>>;
  readonly subagentPromptAppend?: string;
  readonly forwardSubagentText: boolean;
  readonly channels: readonly SessionChannel[];
  readonly mcpConfigs: readonly McpConfigSource[];
  readonly strictMcpConfig: boolean;
  /** `-p` with `--mcp-config` waits for pending servers up to this many milliseconds before the first turn. */
  readonly mcpWaitMs?: number;
  readonly permissionMode?: PermissionMode;
  /** The `--tools` list: `[]` disables every built-in tool, `['default']` is the default set. */
  readonly tools?: readonly string[];
  /** `--tools` names a task-tracking tool: the session is opted in. */
  readonly optsIntoTaskTools: boolean;
  readonly restricted: boolean;
  /** `--restricted` confines the built-in file tools to the working directories. */
  readonly fileToolsConfined: boolean;
  /** `--restricted` refuses to create cloud sessions. */
  readonly cloudSessions: 'allowed' | 'refused';
  /** What `--add-dir` directories load beyond file access (`flags/add-dir.ts`). */
  readonly addDirLoads: readonly string[];
}

/** What one flag adds to the plan: lists are appended, a scalar replaces. */
export type Contribution = Partial<SessionPlan>;

export type FlagStrategy<F extends FlagName> = (
  value: FlagArguments[F],
  context: FlagContext,
) => Contribution;

export const refuse = (...reasons: string[]): Contribution => ({ refusals: reasons });
