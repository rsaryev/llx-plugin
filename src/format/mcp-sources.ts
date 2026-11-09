import type { PluginFiles } from '../ports/index.ts';
import { error, type PluginIssue } from './issues.ts';
import { locate, locateContext, rootRelative, type LocateOptions } from './locate.ts';
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

const none = (issues: PluginIssue[] = []): McpConfigRead => ({ servers: {}, issues });

const failed = (path: string, message: string): McpConfigRead => none([error(path, message)]);

/**
 * A `.json` file holding an `mcpServers` map, wrapper or bare (components.md, "MCP servers").
 * Containment is `locate`'s, as for every other component path; the root `.mcp.json` is one of
 * the plugin's own files, so a link of it that leads outside is reported by its full path.
 */
async function loadJsonFile(
  path: string,
  context: McpLoadContext,
  missing: 'report' | 'ignore',
): Promise<McpConfigRead> {
  const located = await locate(context, FIELD, path, missing === 'ignore');
  if (located.issue) return none([located.issue]);
  const text = located.stat?.isFile
    ? await context.files.readText(rootRelative(path), context.signal)
    : undefined;
  if (text === undefined) {
    return missing === 'ignore' ? none() : failed(FIELD, `${FIELD} path not found: ${path}`);
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

/** A bundle in the plugin folder: contained as any other component path, then opened. */
async function loadBundlePath(value: string, context: McpLoadContext): Promise<McpConfigRead> {
  const located = await locate(context, FIELD, value);
  if (located.issue) return none([located.issue]);
  return loadBundle(value, { kind: 'path', path: rootRelative(value) }, context);
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
  'bundle-path': (value) =>
    typeof value === 'string'
      ? { kind: 'bundle-path', load: (context) => loadBundlePath(value, context) }
      : undefined,
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

/**
 * What decides containment (`platform`, `roots`), and the host's capabilities: a bundle opener
 * (without it a bundle is a warning) and saved bundle settings.
 */
export type CollectOptions = LocateOptions & Omit<McpLoadContext, keyof LocateOptions | 'files'>;

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
  const context: McpLoadContext = { ...options, ...locateContext(files, options) };
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
