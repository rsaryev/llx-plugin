import type { PluginFiles } from '../ports/index.ts';
import { error, type PluginIssue } from './issues.ts';
import { locate, locateContext, type LocateOptions } from './locate.ts';
import { rootRelative, type PathPlatform } from './path-text.ts';
import { parseJson } from './read-json.ts';
import { pathNotFound } from './messages.ts';
import { loadBundle, type McpLoadContext } from './mcp-bundles.ts';
import {
  readMcpConfig,
  rejectsManifest,
  type McpBundleConfig,
  type McpConfigRead,
  type PluginMcpServer,
} from './mcp-config.ts';
import { isRecord } from '../protocol/is-record.ts';

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
    ? await context.files.readText(rootRelative(path, context.platform), context.signal)
    : undefined;
  if (text === undefined) {
    return missing === 'ignore' ? none() : failed(FIELD, pathNotFound(FIELD, path));
  }
  const parsed = parseJson(text);
  if ('problem' in parsed)
    return failed(path, `${FIELD} ${path} is not valid JSON: ${parsed.problem}`);
  return isRecord(parsed.value)
    ? readMcpConfig(parsed.value, path)
    : failed(path, `${FIELD} ${path} must hold a JSON object of servers`);
}

/** A bundle in the plugin folder: contained as any other component path, then opened. */
async function loadBundlePath(value: string, context: McpLoadContext): Promise<McpConfigRead> {
  const located = await locate(context, FIELD, value);
  if (located.issue) return none([located.issue]);
  return loadBundle(value, { kind: 'path', path: rootRelative(value, context.platform) }, context);
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
  /** The bundled servers among `servers`, by name: a later source's server of the same name drops it. */
  readonly bundles: Record<string, McpBundleConfig>;
  readonly issues: PluginIssue[];
  /** An inline manifest entry could not be read: the plugin does not load (oracle 2.1.319). */
  readonly rejectsPlugin?: boolean;
}

const unknownSource = (value: unknown): McpConfigRead =>
  failed(
    FIELD,
    `${FIELD} entry must be a .json path, a bundle path or URL, or an inline map: ${JSON.stringify(value) ?? String(value)}`,
  );

/** The plugin file a string source names, root-relative; `undefined` for a URL or an inline map. */
const fileOf = (value: unknown, platform: PathPlatform): string | undefined =>
  typeof value === 'string' && !/^https?:\/\//i.test(value)
    ? rootRelative(value, platform)
    : undefined;

/**
 * A file that is already a source loads once (judgment, as for the other config files): a later
 * entry naming the same file is left out.
 */
function withoutRepeatedFiles(declared: readonly unknown[], platform: PathPlatform): unknown[] {
  const seen = new Set<string>();
  return declared.filter((value) => {
    const file = fileOf(value, platform);
    if (file === undefined) return true;
    const repeated = seen.has(file);
    seen.add(file);
    return !repeated;
  });
}

/** Each server's bundle settings, read in source order, so a later server of the same name drops them. */
function bundlesOf(loaded: readonly McpConfigRead[]): Record<string, McpBundleConfig> {
  const byName = new Map<string, McpBundleConfig | undefined>();
  for (const read of loaded) {
    for (const name of Object.keys(read.servers)) byName.set(name, read.bundles?.[name]);
  }
  return Object.fromEntries(
    [...byName].flatMap(([name, bundle]) => (bundle ? [[name, bundle]] : [])),
  );
}

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
  const once = withoutRepeatedFiles(declared, context.platform);
  const rootDeclared = once.some((value) => fileOf(value, context.platform) === ROOT_FILE);
  const loaded = await Promise.all([
    loadJsonFile(ROOT_FILE, context, rootDeclared ? 'report' : 'ignore'),
    ...once
      .filter((value) => fileOf(value, context.platform) !== ROOT_FILE)
      .map((value: unknown) => {
        const source = classifyMcpSource(value);
        return source ? source.load(context) : Promise.resolve(unknownSource(value));
      }),
  ]);
  return {
    servers: Object.fromEntries(loaded.flatMap(({ servers }) => Object.entries(servers))),
    bundles: bundlesOf(loaded),
    issues: loaded.flatMap(({ issues }) => issues),
    ...(loaded.some((one) => one.rejectsPlugin === true) && { rejectsPlugin: true }),
  };
}
