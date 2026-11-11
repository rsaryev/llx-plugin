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

/** The server config the host read from a bundle, already mapped from the MCPB manifest. */
export type McpBundleServer = McpStdioServerConfig | McpSSEServerConfig | McpHttpServerConfig;

export interface McpBundle {
  /** The `name` in the bundle's manifest: the server takes this name. */
  readonly name: string;
  /**
   * The kit reads it as any `mcpServers` entry (`readMcpServer`), so a manifest-shaped record does. Its
   * `${user_config.KEY}` references are left as the bundle wrote them: the kit fills them when it
   * resolves the server, from the values saved under `<server>.<key>` and the settings' defaults.
   */
  readonly server: McpBundleServer | Readonly<Record<string, unknown>>;
  /**
   * The bundle's `user_config` block as its manifest writes it, by setting name (or
   * `readMcpbManifest(...).manifest.options`, which reads the same). The kit reads each setting into
   * the plugin option shape (`UserConfigOption`: `type`, `title`, `description`, `required`,
   * `sensitive`, `default`) with the one MCPB reader, and keeps it on `Plugin.mcpBundles`.
   */
  readonly userConfig?: Readonly<Record<string, unknown>>;
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
