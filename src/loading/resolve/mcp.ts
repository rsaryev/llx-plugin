import { error, type PluginIssue } from '../../format/issues.ts';
import {
  isRemoteMcpServer,
  type PluginMcpServer,
  type RemoteMcpServer,
} from '../../format/mcp-config.ts';
import type { McpStdioServerConfig } from '../../protocol/official.ts';
import { exportedEnvironment } from './exported-environment.ts';
import { fieldOf, fieldRunner, when } from './field-runner.ts';
import { helperVariables } from './headers-helper.ts';
import type { SubstitutionScope } from './scope.ts';
import { HEADERS_HELPER_GUARD, rejectUserConfigInShell } from './shell-guard.ts';
import { substituter } from './substitute.ts';

/**
 * A plugin's MCP server config resolved for this host (plugins/manifest-reference.md, "Where each
 * variable resolves"; mcp.md, "Plugin-provided MCP servers"). The kit never starts anything: it hands
 * the host the substituted config, the variables the process receives and, for a server with a
 * `headersHelper`, the environment that helper runs with.
 */
export interface ResolvedMcpServer {
  /** The key as the plugin wrote it. */
  readonly name: string;
  /** What Claude Code registers it under: `plugin:<plugin>:<server>`. */
  readonly key: string;
  /** The config with `${...}` substituted. */
  readonly server: PluginMcpServer;
  /** Variables the process receives besides its `env`: the three path variables for stdio, none for a remote server. */
  readonly environment: Readonly<Record<string, string>>;
  /** What the `headersHelper` command runs with; absent when the server has none. */
  readonly headersHelperEnvironment?: Readonly<Record<string, string>>;
}

export interface McpResolution {
  /** Undefined when the server does not start. */
  readonly resolved: ResolvedMcpServer | undefined;
  readonly issues: readonly PluginIssue[];
}

/** `plugin:<plugin>:<server>` (components.md, "Server names, tool names, and reloads"). */
export const mcpServerKey = (plugin: string, server: string): string =>
  `plugin:${plugin}:${server}`;

/** A plugin identifier `name@marketplace` registers under its name; a bare name is its own. */
const pluginName = (pluginId: string): string => pluginId.split('@')[0] ?? pluginId;

/**
 * The environment of a plugin server's `headersHelper` (mcp.md, "dynamic headers"; manifest-reference,
 * "Fields that run through a shell"): the plugin root, the server's name and its URL, and no option
 * values. The three names are `helperVariables`'; `planHeadersHelper` adds the inherited environment
 * (less credentials) and the working directory.
 * Judgment: the name is the registered `plugin:<plugin>:<server>` key, the one `/mcp` shows.
 */
export function headersHelperEnvironment(
  name: string,
  url: string,
  scope: SubstitutionScope,
): Record<string, string> {
  return helperVariables({
    name: mcpServerKey(pluginName(scope.pluginId), name),
    url,
    pluginRoot: scope.locations.pluginRoot(scope.pluginId),
  });
}

const invalid = (name: string, path: string, why: string): PluginIssue =>
  error(path, `Invalid MCP server config for "${name}": ${why}`);

async function resolveStdio(
  name: string,
  server: McpStdioServerConfig,
  scope: SubstitutionScope,
): Promise<McpResolution> {
  const run = fieldRunner(substituter(scope), `mcpServers.${name}`);
  const [command, args, env, environment] = await Promise.all([
    run.one('mcp-stdio', server.command, 'command'),
    when(server.args, (each) => run.list('mcp-stdio', each, 'args')),
    when(server.env, (each) => run.table('mcp-stdio', each, 'env')),
    exportedEnvironment('mcp-stdio', scope),
  ]);
  return {
    resolved: {
      name,
      key: mcpServerKey(pluginName(scope.pluginId), name),
      server: {
        ...server,
        command: command.value,
        ...fieldOf(args, 'args'),
        ...fieldOf(env, 'env'),
      },
      environment,
    },
    issues: [command, args, env].flatMap((part) => part?.issues ?? []),
  };
}

/** The helper's guard error, checked on the template before anything is substituted. */
const helperRefusal = (name: string, server: RemoteMcpServer): PluginIssue | undefined => {
  const path = `mcpServers.${name}.headersHelper`;
  const refused = when(server.headersHelper, (template) =>
    rejectUserConfigInShell(HEADERS_HELPER_GUARD, template, { server: name }, path),
  );
  return refused && invalid(name, path, refused.message);
};

async function resolveRemote(
  name: string,
  server: RemoteMcpServer,
  scope: SubstitutionScope,
): Promise<McpResolution> {
  const refused = helperRefusal(name, server);
  if (refused) return { resolved: undefined, issues: [refused] };
  const run = fieldRunner(substituter(scope), `mcpServers.${name}`);
  const [url, headers, helper] = await Promise.all([
    run.one('mcp-remote', server.url, 'url'),
    when(server.headers, (each) => run.table('mcp-remote', each, 'headers')),
    when(server.headersHelper, (each) => run.one('mcp-headers-helper', each, 'headersHelper')),
  ]);
  const issues = [url, headers, helper].flatMap((part) => part?.issues ?? []);
  if (!URL.canParse(url.value)) {
    const unusable = invalid(name, `mcpServers.${name}.url`, 'URL is unset or invalid');
    return { resolved: undefined, issues: [...issues, unusable] };
  }
  return {
    resolved: {
      name,
      key: mcpServerKey(pluginName(scope.pluginId), name),
      server: {
        ...server,
        url: url.value,
        ...fieldOf(headers, 'headers'),
        ...fieldOf(helper, 'headersHelper'),
      },
      environment: {},
      ...when(helper, () => ({
        headersHelperEnvironment: headersHelperEnvironment(name, url.value, scope),
      })),
    },
    issues,
  };
}

/**
 * Resolves one server of a plugin. stdio: `command`, `args` and `env` are substituted and the process
 * gets the three path variables. http, sse and ws: `url`, `headers` and `headersHelper` are
 * substituted, nothing is exported, and a `headersHelper` that references `${user_config.*}` keeps the
 * server from starting. A `url` that does not parse after substitution does too (plugins/
 * troubleshooting.md, "URL is unset or invalid"; judgment: any unparseable result, not only an unset
 * option, since an unset `${VAR}` stays as text and cannot be a URL either).
 */
export function resolveMcpServer(
  name: string,
  server: PluginMcpServer,
  scope: SubstitutionScope,
): Promise<McpResolution> {
  return isRemoteMcpServer(server)
    ? resolveRemote(name, server, scope)
    : resolveStdio(name, server, scope);
}
