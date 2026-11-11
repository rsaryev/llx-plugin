import { error, type PluginIssue } from '../../format/issues.ts';
import { pluginNameOf } from '../../format/marketplace/ids.ts';
import { missingVariableMessage } from '../../format/mcp-env.ts';
import {
  isRemoteMcpServer,
  type PluginMcpServer,
  type RemoteMcpServer,
} from '../../format/mcp-config.ts';
import type { McpStdioServerConfig } from '../../protocol/official.ts';
import { exportedEnvironment } from './exported-environment.ts';
import { fieldOf, fieldRunner, mergeUnresolved, when, type Part } from './field-runner.ts';
import type { HelperServer } from './headers-helper.ts';
import type { SubstitutionScope } from './scope.ts';
import { shellExports } from './shell-exports.ts';
import { HEADERS_HELPER_GUARD, rejectUserConfigInShell } from './shell-guard.ts';
import { substituter } from './substituter.ts';
import { environmentNames } from './substitute.ts';

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
  /**
   * The plugin it belongs to, by the id the host uses for it (`SubstitutionScope.pluginId`): what a
   * host keys a registration by. The same field on every resolved process (judgment, spec/judgments.md).
   */
  readonly pluginId: string;
  /** The config with `${...}` substituted. */
  readonly server: PluginMcpServer;
  /** Variables the process receives besides its `env`: the three path variables for stdio, none for a remote server. */
  readonly environment: Readonly<Record<string, string>>;
  /**
   * The server as `planHeadersHelper` takes it (with origin `plugin`): the registered key, the URL as
   * expanded, the environment variables the expansion substituted and the substituted command. The
   * plan gives the helper's environment and directory. Absent when the server has no helper.
   */
  readonly headersHelper?: HelperServer;
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
const pluginName = pluginNameOf;

const invalid = (name: string, path: string, why: string): PluginIssue =>
  error(path, `Invalid MCP server config for "${name}": ${why}`);

type Parts = readonly (Part<unknown> | undefined)[];

/** The names of the `${VAR}` references no variable answered, once each, in the order they appear. */
const missingVariables = (parts: Parts): readonly string[] =>
  mergeUnresolved(parts.flatMap((part) => (part ? [part.unresolved] : []))).variables;

/**
 * An unset `${VAR}` with no default keeps a plugin's server from starting (plugins/troubleshooting.md,
 * "`Missing environment variables: <names>`": "set those variables in the shell you start Claude Code
 * from"). The per-variable warnings of the fields it names are dropped for the one error. A server of
 * the settings scopes loads with a warning instead (`expandMcpServer`, mcp.md, "Unset variables
 * without a default"). Judgment (spec/judgments.md): names are joined with a comma and a space.
 */
function unlessMissing(
  name: string,
  parts: Parts,
  issues: readonly PluginIssue[],
): PluginIssue[] | undefined {
  const missing = missingVariables(parts);
  if (missing.length === 0) return undefined;
  const dropped = new Set(missing.map(missingVariableMessage));
  const rest = issues.filter((found) => !dropped.has(found.message));
  return [
    ...rest,
    invalid(name, `mcpServers.${name}`, `Missing environment variables: ${missing.join(', ')}`),
  ];
}

async function resolveStdio(
  name: string,
  server: McpStdioServerConfig,
  scope: SubstitutionScope,
): Promise<McpResolution> {
  const substitution = substituter(scope);
  const run = fieldRunner(substitution, `mcpServers.${name}`);
  const [command, args, env, environment] = await Promise.all([
    run.one('mcp-stdio', server.command, 'command'),
    when(server.args, (each) => run.list('mcp-stdio', each, 'args')),
    when(server.env, (each) => run.table('mcp-stdio', each, 'env')),
    exportedEnvironment('mcp-stdio', scope, substitution),
  ]);
  const issues = [command, args, env].flatMap((part) => part?.issues ?? []);
  const failed = unlessMissing(name, [command, args, env], issues);
  if (failed) return { resolved: undefined, issues: failed };
  return {
    resolved: {
      name,
      key: mcpServerKey(pluginName(scope.pluginId), name),
      pluginId: scope.pluginId,
      server: {
        ...server,
        command: command.value,
        ...fieldOf(args, 'args'),
        ...fieldOf(env, 'env'),
      },
      environment,
    },
    issues,
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

/**
 * What `planHeadersHelper` needs of a plugin server (mcp.md, "dynamic headers"): the helper sees the
 * registered `plugin:<plugin>:<server>` key (judgment: the one `/mcp` shows), the URL as expanded and,
 * for redaction, the environment variables that expansion substituted.
 */
const helperServer = (
  key: string,
  url: Part<string>,
  helper: { readonly command: string; readonly paths: Readonly<Record<string, string>> },
): HelperServer => ({
  name: key,
  url: url.value,
  expandedVariables: environmentNames(url.referenced).filter(
    (name) => !url.unresolved.variables.includes(name),
  ),
  headersHelper: helper.command,
  paths: helper.paths,
});

async function resolveRemote(
  name: string,
  server: RemoteMcpServer,
  scope: SubstitutionScope,
): Promise<McpResolution> {
  const refused = helperRefusal(name, server);
  if (refused) return { resolved: undefined, issues: [refused] };
  const substitution = substituter(scope);
  const run = fieldRunner(substitution, `mcpServers.${name}`);
  const [url, headers, helper] = await Promise.all([
    run.one('mcp-remote', server.url, 'url'),
    when(server.headers, (each) => run.table('mcp-remote', each, 'headers')),
    when(server.headersHelper, (each) => run.one('mcp-headers-helper', each, 'headersHelper')),
  ]);
  const issues = [url, headers, helper].flatMap((part) => part?.issues ?? []);
  const failed = unlessMissing(name, [url, headers, helper], issues);
  if (failed) return { resolved: undefined, issues: failed };
  // The `url` uses a `${user_config.*}` option that has no value (or no declaration).
  const unset = url.unresolved.options.length > 0;
  if (unset || !URL.canParse(url.value)) {
    const why = unset ? 'URL is unset or invalid' : 'has an invalid MCP url';
    return {
      resolved: undefined,
      issues: [...issues, invalid(name, `mcpServers.${name}.url`, why)],
    };
  }
  const key = mcpServerKey(pluginName(scope.pluginId), name);
  const paths = helper && (await shellExports(helper.referenced, scope, substitution.variable));
  return {
    resolved: {
      name,
      key,
      pluginId: scope.pluginId,
      server: {
        ...server,
        url: url.value,
        ...fieldOf(headers, 'headers'),
        ...fieldOf(helper, 'headersHelper'),
      },
      environment: {},
      ...when(helper, (command) => ({
        headersHelper: helperServer(key, url, { command: command.value, paths: paths ?? {} }),
      })),
    },
    issues,
  };
}

/**
 * Resolves one server of a plugin. stdio: `command`, `args` and `env` are substituted and the process
 * gets the three path variables. http, sse and ws: `url`, `headers` and `headersHelper` are
 * substituted, nothing is exported, and a `headersHelper` that references `${user_config.*}` keeps the
 * server from starting. So does a `url` that does not parse after substitution (plugins/
 * troubleshooting.md): `URL is unset or invalid` when it uses a `${user_config.*}` option with no value,
 * `has an invalid MCP url` when the plugin's own `url` is at fault (judgment: the docs name both causes,
 * not how they are told apart). An unset `${VAR}` with no default keeps it from starting too, as
 * `Missing environment variables: <names>`, in whichever field it is named.
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
