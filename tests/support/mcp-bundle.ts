import type { McpBundle, McpBundleReader, McpBundleSource } from '../../src/loading/index.ts';
import type { PortFailure } from '../../src/ports/index.ts';

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

/** What the host returns for a bundle: the server takes `name`, `userConfig` is the bundle's own block. */
export const bundle = (name: string, userConfig?: Record<string, { required: boolean }>) => ({
  name,
  server: { command: `${name}-server` },
  ...(userConfig && { userConfig }),
});
