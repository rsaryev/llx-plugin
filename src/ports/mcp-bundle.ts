import type {
  McpHttpServerConfig,
  McpSSEServerConfig,
  McpStdioServerConfig,
} from '../protocol/official.ts';
import type { PortFailure } from './failure.ts';

/**
 * Where an MCP bundle comes from (plugins/manifest-reference.md, "mcpServers"): a path inside the
 * plugin (relative to the plugin root, `/`-separated, no `./`) or an `https://` URL. The kit decides
 * which of the two a manifest value is and that it ends in `.mcpb` or `.dxt`; the host opens it.
 */
export type McpBundleSource =
  | { readonly kind: 'path'; readonly path: string }
  | { readonly kind: 'url'; readonly url: string };

/**
 * One setting the bundle's own manifest declares in its `user_config` block (plugins/components.md,
 * "Include a packaged MCPB server"). `required` is true for a setting the user must supply: required
 * by the bundle and without a default of its own (judgment: the MCPB format is not in the docs, so the
 * host reads it and reports only whether the server cannot start without a saved value).
 */
export interface McpBundleSetting {
  readonly required: boolean;
}

/** The server config the host read from a bundle, already mapped from the MCPB manifest. */
export type McpBundleServer = McpStdioServerConfig | McpSSEServerConfig | McpHttpServerConfig;

export interface McpBundle {
  /** The `name` in the bundle's manifest: the server takes this name. */
  readonly name: string;
  /** The kit reads it as any `mcpServers` entry (`readMcpServer`), so a manifest-shaped record does. */
  readonly server: McpBundleServer | Readonly<Record<string, unknown>>;
  /** The bundle's `user_config` block, by setting name. */
  readonly userConfig?: Readonly<Record<string, McpBundleSetting>>;
}

/**
 * The host's MCP bundle opener. Extracting an archive into `cacheDir` or downloading it is an effect
 * the kit never performs, and reading the MCPB manifest into a server config is the host's too
 * (spec/judgments.md). `cacheDir` is `.mcpb-cache`, relative to the plugin root like every path of a
 * `PluginFiles`. `undefined` means the bundle does not exist; a failed extraction or download is a
 * `PortFailure`.
 */
export interface McpBundleReader {
  open(
    source: McpBundleSource,
    cacheDir: string,
    signal?: AbortSignal,
  ): Promise<McpBundle | PortFailure | undefined>;
}
