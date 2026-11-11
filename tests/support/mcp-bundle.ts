import type { UserConfigOption } from '../../src/format/index.ts';
import type { McpBundle, McpBundleReader, McpBundleSource } from '../../src/loading/index.ts';
import { resolveMcpServers } from '../../src/entry/loading.ts';
import { loadPlugin } from '../../src/index.ts';
import type { PortFailure } from '../../src/ports/index.ts';
import type { UserConfigValue } from '../../src/loading/resolve/index.ts';
import { scopeOf } from './mcp-scope.ts';
import { memoryFiles } from './ports.ts';

export interface BundleOpen {
  readonly source: McpBundleSource;
  readonly cacheDir: string;
}

/**
 * An `McpBundleReader` over fixed bundles keyed by the source's path or URL (extraction and
 * download are the host's, so the fake only answers). An unlisted source is absent (`undefined`).
 * `opens` records every call in order.
 */
export function fakeBundles(
  bundles: Readonly<Record<string, McpBundle | PortFailure>>,
): McpBundleReader & {
  readonly opens: BundleOpen[];
} {
  const opens: BundleOpen[] = [];
  return {
    opens,
    open: (source, cacheDir) => {
      opens.push({ source, cacheDir });
      const key = source.kind === 'path' ? source.path : source.url;
      return Promise.resolve(Object.hasOwn(bundles, key) ? bundles[key] : undefined);
    },
  };
}

/** A stdio server running a script of the plugin. */
export const node = (script: string) => ({
  command: 'node',
  args: [`\${CLAUDE_PLUGIN_ROOT}/${script}`],
});

/** A setting of a bundle's `user_config`, in the plugin option shape: a text titled by its key. */
const settingOf = (key: string, fields: Partial<UserConfigOption>): UserConfigOption => ({
  type: 'string',
  title: key,
  description: '',
  ...fields,
});

/** What the host returns for a bundle: the server takes `name`, `userConfig` is the bundle's own block. */
export const bundle = (name: string, userConfig?: Record<string, Partial<UserConfigOption>>) => ({
  name,
  server: { command: `${name}-server` },
  ...(userConfig && {
    userConfig: Object.fromEntries(
      Object.entries(userConfig).map(([key, fields]) => [key, settingOf(key, fields)]),
    ),
  }),
});

/**
 * A plugin whose manifest `mcpServers` is `mcpServers`, loaded with `reader` and no saved value, then
 * its servers resolved with `saved` (a bundled server's settings as `<server>.<key>`): the names that
 * start and every issue of the load and the resolve.
 */
export async function resolvedBundles(
  mcpServers: unknown,
  reader: McpBundleReader,
  saved: Readonly<Record<string, UserConfigValue>> = {},
) {
  const { plugin, issues } = await loadPlugin({
    files: memoryFiles({ '.claude-plugin/plugin.json': JSON.stringify({ name: 'p', mcpServers }) }),
    bundles: reader,
  });
  if (plugin === undefined) throw new Error(`the plugin did not load: ${JSON.stringify(issues)}`);
  const done = await resolveMcpServers(
    plugin,
    scopeOf({ userConfig: { declared: {}, values: saved } }),
  );
  return { names: Object.keys(done.resolved), issues: [...issues, ...done.issues] };
}
