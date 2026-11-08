import type { PluginFiles } from '../ports/index.ts';
import { error, type PluginIssue } from './issues.ts';
import { loadBundle, type McpLoadContext } from './mcp-bundles.ts';
import {
  readMcpConfig,
  rejectsManifest,
  type McpConfigRead,
  type PluginMcpServer,
} from './mcp-config.ts';

export { MCPB_CACHE_DIR } from './mcp-bundles.ts';

/**
 * Where a plugin's MCP servers come from (plugins/manifest-reference.md, "mcpServers"): "Claude Code
 * loads `.mcp.json` at the plugin root first, then each declared shape in order. A server name
 * declared later replaces an earlier one." The four shapes of the table are the `McpSourceKind`
 * members; each has one strategy in a registry typed over the union.
 */
export const MCP_SOURCE_KINDS = ['json-file', 'bundle-path', 'bundle-url', 'inline-map'] as const;
export type McpSourceKind = (typeof MCP_SOURCE_KINDS)[number];

/** One declared source, ready to load. */
export interface McpSource {
  readonly kind: McpSourceKind;
  load(context: McpLoadContext): Promise<McpConfigRead>;
}

const FIELD = 'mcpServers';
const ROOT_FILE = '.mcp.json';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A manifest path as a `PluginFiles` path (no `./`), or `undefined` when it leaves the plugin. */
const rootRelative = (path: string): string | undefined =>
  path.split('/').includes('..') ? undefined : path.replace(/^(\.\/)+/, '');

const escapes = (path: string): McpConfigRead => ({
  servers: {},
  issues: [error(FIELD, `${FIELD} path escapes plugin directory: ${path}`)],
});

const failed = (path: string, message: string): McpConfigRead => ({
  servers: {},
  issues: [error(path, message)],
});

/** A `.json` file holding an `mcpServers` map, wrapper or bare (components.md, "MCP servers"). */
async function loadJsonFile(
  path: string,
  context: McpLoadContext,
  missing: 'report' | 'ignore',
): Promise<McpConfigRead> {
  const relative = rootRelative(path);
  if (relative === undefined) return escapes(path);
  const text = await context.files.readText(relative, context.signal);
  if (text === undefined) {
    return missing === 'ignore'
      ? { servers: {}, issues: [] }
      : failed(FIELD, `${FIELD} path not found: ${path}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (problem) {
    const why = problem instanceof Error ? problem.message : 'invalid JSON';
    return failed(path, `${FIELD} ${path} is not valid JSON: ${why}`);
  }
  return isRecord(parsed)
    ? readMcpConfig(parsed, path)
    : failed(path, `${FIELD} ${path} must hold a JSON object of servers`);
}

/** One strategy per kind: `undefined` when the value is not of that kind. */
const STRATEGIES: { readonly [K in McpSourceKind]: (value: unknown) => McpSource | undefined } = {
  'bundle-url': (value) =>
    typeof value === 'string' && /^https?:\/\//i.test(value)
      ? {
          kind: 'bundle-url',
          load: (context) => loadBundle(value, { kind: 'url', url: value }, context),
        }
      : undefined,
  'json-file': (value) =>
    typeof value === 'string' && value.endsWith('.json')
      ? { kind: 'json-file', load: (context) => loadJsonFile(value, context, 'report') }
      : undefined,
  // Any other string is a bundle path: a wrong extension then fails as "must end in .mcpb or .dxt".
  'bundle-path': (value) => {
    if (typeof value !== 'string') return undefined;
    const relative = rootRelative(value);
    return {
      kind: 'bundle-path',
      load: (context) =>
        relative === undefined
          ? Promise.resolve(escapes(value))
          : loadBundle(value, { kind: 'path', path: relative }, context),
    };
  },
  'inline-map': (value) =>
    isRecord(value)
      ? {
          kind: 'inline-map',
          load: () =>
            Promise.resolve({
              ...readMcpConfig(value, FIELD),
              ...(Object.values(value).some(rejectsManifest) && { rejectsPlugin: true }),
            }),
        }
      : undefined,
};

/** Strings are told apart in this order: a URL, a `.json` file, then a bundle path. */
const CLASSIFY_ORDER: readonly McpSourceKind[] = [
  'bundle-url',
  'json-file',
  'bundle-path',
  'inline-map',
];

/** What a manifest `mcpServers` value (or one element of an array) is, or `undefined`. */
export function classifyMcpSource(value: unknown): McpSource | undefined {
  for (const kind of CLASSIFY_ORDER) {
    const source = STRATEGIES[kind](value);
    if (source) return source;
  }
  return undefined;
}

/** The host's capabilities: a bundle opener (without it a bundle is a warning) and saved bundle settings. */
export type CollectOptions = Omit<McpLoadContext, 'files'>;

export interface CollectedMcpServers {
  readonly servers: Record<string, PluginMcpServer>;
  readonly issues: PluginIssue[];
  /** An inline manifest entry could not be read: the plugin does not load (oracle 2.1.319). */
  readonly rejectsPlugin?: boolean;
}

const unknownSource = (value: unknown): McpConfigRead =>
  failed(
    FIELD,
    `${FIELD} entry must be a .json path, a bundle path or URL, or an inline map: ${JSON.stringify(value) ?? String(value)}`,
  );

/**
 * Every server of a plugin: the root `.mcp.json` first, then each declared source in array order;
 * a later name replaces an earlier one (a manifest server replaces a `.mcp.json` one,
 * components.md). A source that fails leaves the others loading.
 */
export async function collectMcpServers(
  files: PluginFiles,
  manifestValue: unknown,
  options: CollectOptions = {},
): Promise<CollectedMcpServers> {
  const context: McpLoadContext = { files, ...options };
  const declared = Array.isArray(manifestValue)
    ? manifestValue
    : manifestValue === undefined
      ? []
      : [manifestValue];
  const loaded = await Promise.all([
    loadJsonFile(ROOT_FILE, context, 'ignore'),
    ...declared.map((value: unknown) => {
      const source = classifyMcpSource(value);
      return source ? source.load(context) : Promise.resolve(unknownSource(value));
    }),
  ]);
  return {
    servers: Object.fromEntries(loaded.flatMap(({ servers }) => Object.entries(servers))),
    issues: loaded.flatMap(({ issues }) => issues),
    ...(loaded.some((one) => one.rejectsPlugin === true) && { rejectsPlugin: true }),
  };
}
