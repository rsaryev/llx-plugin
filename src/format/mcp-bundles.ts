import type { PluginFiles } from '../ports/index.ts';
import type { McpBundleReader, McpBundleSource } from '../ports/mcp-bundle.ts';
import { error, warning, type PluginIssue } from './issues.ts';
import { readMcpServer, type McpConfigRead } from './mcp-config.ts';

/**
 * MCP bundles (plugins/manifest-reference.md, "mcpServers"; plugins/components.md, "Include a
 * packaged MCPB server"). The host opens a bundle (extracts or downloads it into `.mcpb-cache/`
 * under the plugin root, reads its manifest into a server config); the kit decides what a manifest
 * value is, that it ends in `.mcpb` or `.dxt`, which server name results and whether the server may
 * start.
 */

/** Where the host puts an extracted or downloaded bundle, relative to the plugin root. */
export const MCPB_CACHE_DIR = '.mcpb-cache';

/** What a source needs to load: the plugin's files and, optionally, the host's capabilities. */
export interface McpLoadContext {
  readonly files: PluginFiles;
  /** Absent: a bundle is a warning, never a crash. */
  readonly bundles?: McpBundleReader;
  /**
   * The values saved for each bundled server's `user_config`, by server name then setting name.
   * Judgment: the host passes only values that satisfy the bundle's own validation, since the MCPB
   * format is the host's to read.
   */
  readonly bundleSettings?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  readonly signal?: AbortSignal;
}

const BUNDLE_EXTENSIONS = ['.mcpb', '.dxt'] as const;
const FIELD = 'mcpServers';

const hasBundleExtension = (value: string): boolean =>
  BUNDLE_EXTENSIONS.some((extension) => value.endsWith(extension));

const NEEDS_CONFIGURATION = (name: string): string =>
  `Bundled MCP server "${name}" was not started: it needs configuration`;

const nothing = (issue: PluginIssue): McpConfigRead => ({ servers: {}, issues: [issue] });

/** The host's answer to `open`, as servers and issues. */
function bundledServer(
  value: string,
  opened: Awaited<ReturnType<McpBundleReader['open']>>,
  context: McpLoadContext,
): McpConfigRead {
  if (opened === undefined) return nothing(error(FIELD, `${FIELD} path not found: ${value}`));
  if ('failure' in opened) {
    return nothing(error(FIELD, `MCP bundle ${value} could not be opened: ${opened.message}`));
  }
  const saved = context.bundleSettings?.[opened.name] ?? {};
  const missing = Object.entries(opened.userConfig ?? {}).some(
    ([setting, { required }]) => required && saved[setting] === undefined,
  );
  if (missing) return nothing(error(FIELD, NEEDS_CONFIGURATION(opened.name)));
  const { server, issues } = readMcpServer(opened.name, opened.server, FIELD);
  return { servers: server ? { [opened.name]: server } : {}, issues: [...issues] };
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
  return bundledServer(value, opened, context);
}
