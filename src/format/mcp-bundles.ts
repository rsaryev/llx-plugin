import type { McpBundleReader, McpBundleSource } from '../ports/mcp-bundle.ts';
import { error, warning, type PluginIssue } from './issues.ts';
import type { LocateContext } from './locate.ts';
import { pathNotFound } from './messages.ts';
import { readMcpServer, type McpConfigRead } from './mcp-config.ts';
import { readMcpbOptions } from './mcpb-manifest.ts';

/**
 * MCP bundles (plugins/manifest-reference.md, "mcpServers"; plugins/components.md, "Include a
 * packaged MCPB server"). The host opens a bundle (extracts or downloads it into `.mcpb-cache/`
 * under the plugin root, reads its manifest into a server config); the kit decides what a manifest
 * value is, that it ends in `.mcpb` or `.dxt`, which server name results and what the bundle's
 * settings are. Whether the server may start and what its `${user_config.KEY}` references stand for
 * are decided when it is resolved, from the session's saved values (`loading/resolve/bundle-scope.ts`).
 */

/** Where the host puts an extracted or downloaded bundle, relative to the plugin root. */
const MCPB_CACHE_DIR = '.mcpb-cache';

/**
 * What a source needs to load: the plugin's files and what decides whether a path leaves them
 * (`locate`), and, optionally, the host's capabilities.
 */
export interface McpLoadContext extends LocateContext {
  /** Absent: a bundle is a warning, never a crash. */
  readonly bundles?: McpBundleReader;
}

const BUNDLE_EXTENSIONS = ['.mcpb', '.dxt'] as const;
const FIELD = 'mcpServers';

const hasBundleExtension = (value: string): boolean =>
  BUNDLE_EXTENSIONS.some((extension) => value.endsWith(extension));

const nothing = (issue: PluginIssue): McpConfigRead => ({ servers: {}, issues: [issue] });

/** The host's answer to `open`, as servers and issues. */
function bundledServer(
  value: string,
  opened: Awaited<ReturnType<McpBundleReader['open']>>,
): McpConfigRead {
  if (opened === undefined) return nothing(error(FIELD, pathNotFound(FIELD, value)));
  if ('failure' in opened) {
    return nothing(error(FIELD, `MCP bundle ${value} could not be opened: ${opened.message}`));
  }
  const { server, issues } = readMcpServer(opened.name, opened.server, FIELD);
  return server
    ? {
        servers: { [opened.name]: server },
        bundles: { [opened.name]: { userConfig: readMcpbOptions(opened.userConfig) } },
        issues: [...issues],
      }
    : { servers: {}, issues: [...issues] };
}

/**
 * Loads one bundle. `source` is root-relative (`PluginFiles` paths), `value` the manifest text.
 * Judgments: the extension is matched exactly (`.mcpb`, `.dxt`), a URL must be `https://`, and the
 * host is never asked for a value that fails either check.
 */
export async function loadBundle(
  value: string,
  source: McpBundleSource,
  context: McpLoadContext,
): Promise<McpConfigRead> {
  if (!hasBundleExtension(value)) {
    return nothing(error(FIELD, `${FIELD} bundle must end in .mcpb or .dxt: ${value}`));
  }
  if ('url' in source && !value.startsWith('https://')) {
    return nothing(error(FIELD, `${FIELD} bundle URL must use https://: ${value}`));
  }
  if (!context.bundles) {
    const missing = warning(FIELD, `MCP bundle ${value} needs an extractor: the host gave none`);
    return nothing(missing);
  }
  const opened = await context.bundles.open(source, MCPB_CACHE_DIR, context.signal);
  return bundledServer(value, opened);
}

/** One `--config` flag of `claude plugin install`: a plugin option, or a setting of a bundled server. */
export interface ConfigFlag {
  /** The bundled server, for a key written `<server>.<key>`; absent for a plugin `userConfig` option. */
  readonly server?: string;
  readonly key: string;
  readonly value: string;
}

/**
 * `--config <key=value>` (plugins/cli-reference.md, "plugin install"): "A key written `<server>.<key>`
 * sets a setting that a bundled MCP server declares in its own `user_config` instead". Judgment
 * (spec/judgments.md): the first `=` ends the key and the first `.` of the key ends the server name,
 * so a value keeps its own `=` and a setting key may hold dots; a flag with no `=` or an empty part is
 * an error.
 */
export function readConfigFlag(text: string): ConfigFlag | PluginIssue {
  const at = text.indexOf('=');
  const written = at < 0 ? '' : text.slice(0, at);
  const value = at < 0 ? '' : text.slice(at + 1);
  const dot = written.indexOf('.');
  const server = dot < 0 ? undefined : written.slice(0, dot);
  const key = dot < 0 ? written : written.slice(dot + 1);
  if (key === '' || server === '') {
    return error('--config', `--config takes key=value or <server>.<key>=value, not "${text}"`);
  }
  return { ...(server === undefined ? {} : { server }), key, value };
}

/**
 * "For a bundle file shipped inside the plugin": a `<server>.<key>` flag works only when the bundle is
 * a path in the plugin, never for one downloaded from a URL.
 */
const CONFIG_FLAG_APPLIES: { readonly [K in McpBundleSource['kind']]: boolean } = {
  path: true,
  url: false,
};

export const configFlagApplies = (source: McpBundleSource): boolean =>
  CONFIG_FLAG_APPLIES[source.kind];
