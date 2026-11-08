import type { Locations } from '../../ports/index.ts';

/**
 * Where an MCP server was configured, as far as its `headersHelper` is concerned (mcp.md, "Where
 * the helper runs", "Which variables a helper can read" and "Trust a folder before its
 * headersHelper runs"). The first six are the scopes of `settings/mcp` (`McpScope`, a plugin and a
 * connector included), so a ranked candidate's `scope` is one of these; the rest are the places the
 * three tables name that are not scopes: the SDK, `--mcp-config` and the five sources of an inline
 * server in an agent file.
 */
export const HEADERS_HELPER_ORIGINS = [
  'plugin',
  'project',
  'local',
  'user',
  'managed',
  'connector',
  'sdk',
  'mcp-config',
  'agent-project',
  'agent-add-dir',
  'agent-user',
  'agent-managed',
  'agent-flag',
] as const;
export type HeadersHelperOrigin = (typeof HEADERS_HELPER_ORIGINS)[number];

/** The kinds of working directory the "Where the helper runs" table names. */
export type DirectoryKind =
  | 'plugin-root'
  | 'project-directory'
  | 'primary-directory'
  | 'config-directory';

/** Who must be trusted before anything runs: nobody, the helper alone, or the server's loading. */
export type TrustGate = 'none' | 'helper' | 'load';

export interface OriginRule {
  readonly directory: DirectoryKind;
  /** "Removed" in the "Which variables a helper can read" lists. */
  readonly removesCredentials: boolean;
  readonly gate: TrustGate;
}

/**
 * The three tables of mcp.md in one row per place. Judgments (spec/judgments.md): an inline server
 * of an agent from managed settings or `--agents` is "from outside your project", so it runs in the
 * configuration directory; the docs list both only under "Not removed".
 */
export const ORIGIN_RULES: { readonly [O in HeadersHelperOrigin]: OriginRule } = {
  plugin: { directory: 'plugin-root', removesCredentials: true, gate: 'none' },
  project: { directory: 'project-directory', removesCredentials: true, gate: 'helper' },
  local: { directory: 'project-directory', removesCredentials: false, gate: 'helper' },
  user: { directory: 'config-directory', removesCredentials: false, gate: 'none' },
  managed: { directory: 'config-directory', removesCredentials: false, gate: 'none' },
  connector: { directory: 'config-directory', removesCredentials: false, gate: 'none' },
  sdk: { directory: 'primary-directory', removesCredentials: false, gate: 'none' },
  'mcp-config': { directory: 'primary-directory', removesCredentials: false, gate: 'none' },
  'agent-project': { directory: 'primary-directory', removesCredentials: true, gate: 'load' },
  'agent-add-dir': { directory: 'config-directory', removesCredentials: true, gate: 'load' },
  'agent-user': { directory: 'config-directory', removesCredentials: false, gate: 'none' },
  'agent-managed': { directory: 'config-directory', removesCredentials: false, gate: 'none' },
  'agent-flag': { directory: 'config-directory', removesCredentials: false, gate: 'none' },
};

/** What the plan reads from the host: the environment it inherits and the directories it picks from. */
export interface HelperContext {
  /** The environment the helper starts from, before any removal. */
  readonly environment: Readonly<Record<string, string>>;
  readonly locations: Pick<Locations, 'homeDir' | 'joinPath'>;
  /** The project directory a project or local server is declared in. */
  readonly projectDirectory: string;
  /** The session's primary working directory (it moves with `/cd`). */
  readonly primaryDirectory: string;
  /** The plugin's root; only a plugin-provided server has one. */
  readonly pluginRoot?: string | undefined;
}

/** "Your configuration directory, `~/.claude` unless you set `CLAUDE_CONFIG_DIR`." */
export function configDirectory(context: HelperContext): string {
  const configured = context.environment.CLAUDE_CONFIG_DIR;
  return configured !== undefined && configured !== ''
    ? configured
    : context.locations.joinPath(context.locations.homeDir(), '.claude');
}

export const DIRECTORIES: {
  readonly [D in DirectoryKind]: (context: HelperContext) => string | undefined;
} = {
  'plugin-root': (context) => context.pluginRoot,
  'project-directory': (context) => context.projectDirectory,
  'primary-directory': (context) => context.primaryDirectory,
  'config-directory': configDirectory,
};
