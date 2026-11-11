import { isRecord } from '../protocol/is-record.ts';
import type { UserConfigOption } from './manifest-schema.ts';
/**
 * What an MCPB bundle's own `manifest.json` says (plugins/components.md, "Include a packaged MCPB
 * server": "The server takes its name from the `name` in the bundle's manifest" and "A bundle's own
 * manifest can declare settings the server needs from the user in a `user_config` block"). The format
 * itself lives at github.com/modelcontextprotocol/mcpb, not in the pulled docs, so every rule here is
 * a judgment (spec/judgments.md). Pure data: extracting or downloading the archive is the host's.
 */

export const MCPB_OPTION_TYPES = ['string', 'number', 'boolean', 'directory', 'file'] as const;
export type McpbOptionType = (typeof MCPB_OPTION_TYPES)[number];

export interface McpbManifest {
  /** The server's name: the manifest's `name`. */
  readonly name: string;
  /** The `server.mcp_config` (or the one an `entry_point` stands for) for this platform; `${...}` unresolved. */
  readonly server: Readonly<Record<string, unknown>>;
  /**
   * The `user_config` block by key, in the plugin option shape: a bundle setting is the same concept
   * as a plugin's `userConfig` option (plugins/components.md: "Claude Code prompts for them alongside
   * the plugin's own options"). `required` is the bundle's own mark: a setting with a default of its
   * own still starts the server (`requiredBundleSettings`).
   */
  readonly options: Readonly<Record<string, UserConfigOption>>;
}

export type McpbRead = { readonly manifest: McpbManifest } | { readonly problem: string };

/** What `server.entry_point` stands for when the manifest has no `mcp_config`. */
const ENTRY_COMMANDS: Readonly<Record<string, (entry: string) => Record<string, unknown>>> = {
  node: (entry) => ({ command: 'node', args: [`\${__dirname}/${entry}`] }),
  python: (entry) => ({ command: 'python3', args: [`\${__dirname}/${entry}`] }),
};

const binaryCommand = (entry: string): Record<string, unknown> => ({
  command: `\${__dirname}/${entry}`,
});

/** The server config of a manifest's `server` block, with this platform's `platform_overrides` over it. */
function serverOf(
  server: Record<string, unknown>,
  platform: string,
): Record<string, unknown> | undefined {
  const entry = typeof server.entry_point === 'string' ? server.entry_point : undefined;
  const type = typeof server.type === 'string' ? server.type : '';
  const standIn = entry === undefined ? undefined : (ENTRY_COMMANDS[type] ?? binaryCommand)(entry);
  const config = isRecord(server.mcp_config) ? server.mcp_config : standIn;
  if (config === undefined) return undefined;
  const overrides = isRecord(config.platform_overrides) ? config.platform_overrides : {};
  const own = isRecord(overrides[platform]) ? overrides[platform] : {};
  const { platform_overrides: _overrides, ...rest } = { ...config, ...own };
  return rest;
}

const optionType = (raw: unknown): McpbOptionType =>
  MCPB_OPTION_TYPES.find((type) => type === raw) ?? 'string';

function optionOf(key: string, raw: Record<string, unknown>): UserConfigOption {
  const fallback = raw.default;
  return {
    type: optionType(raw.type),
    title: typeof raw.title === 'string' ? raw.title : key,
    description: typeof raw.description === 'string' ? raw.description : '',
    required: raw.required === true,
    sensitive: raw.sensitive === true,
    ...(typeof fallback === 'string' ||
    typeof fallback === 'number' ||
    typeof fallback === 'boolean'
      ? { default: fallback }
      : {}),
  };
}

/**
 * A bundle's `user_config` block in the plugin option shape. Judgments (spec/judgments.md): an entry
 * that is not an object is skipped, a `type` the kit does not know is `string`, a setting with no
 * `title` is titled by its key, and a `default` that is not text, a number or a Boolean is none.
 * Reading a block already read gives it back.
 */
export function readMcpbOptions(declared: unknown): Readonly<Record<string, UserConfigOption>> {
  return Object.fromEntries(
    Object.entries(isRecord(declared) ? declared : {}).flatMap(([key, raw]) =>
      isRecord(raw) ? [[key, optionOf(key, raw)]] : [],
    ),
  );
}

/**
 * The name, server and settings of a bundle manifest for `platform` (`darwin`, `linux`, `win32`).
 * Judgment: a `type` other than `node` or `python` with an `entry_point` runs that file as a binary.
 */
export function readMcpbManifest(manifest: unknown, platform: string): McpbRead {
  if (!isRecord(manifest) || typeof manifest.name !== 'string') {
    return { problem: 'the bundle manifest has no name' };
  }
  const server = isRecord(manifest.server) ? serverOf(manifest.server, platform) : undefined;
  if (server === undefined) return { problem: 'the bundle manifest declares no server' };
  const options = readMcpbOptions(manifest.user_config);
  return { manifest: { name: manifest.name, server, options } };
}

/** The key a bundled server's setting has among the plugin's settings: `<server>.<key>`. */
export const bundleSettingKey = (server: string, key: string): string => `${server}.${key}`;

/**
 * The settings of a bundle the server cannot start without (plugins/components.md: "A bundled server
 * with a required setting that has no saved value doesn't start"), as `<server>.<key>`. Judgment: a
 * required setting with a default of its own is not one.
 */
export const requiredBundleSettings = (
  manifest: Pick<McpbManifest, 'name' | 'options'>,
): string[] =>
  Object.entries(manifest.options).flatMap(([key, option]) =>
    option.required && option.default === undefined ? [bundleSettingKey(manifest.name, key)] : [],
  );

/**
 * The settings among `required` that `saved` has no value for: the one rule both the host's dialog and
 * the kit's load-time check use. Judgment (spec/judgments.md): an empty text is no value, as a
 * required plugin option's dialog "doesn't accept an empty value" (plugins/manifest-reference.md).
 */
export const missingBundleSettings = (
  required: readonly string[],
  saved: Readonly<Record<string, unknown>>,
): string[] => required.filter((key) => saved[key] === undefined || saved[key] === '');

function mapStrings(value: unknown, change: (text: string) => string): unknown {
  if (typeof value === 'string') return change(value);
  if (Array.isArray(value)) return value.map((each) => mapStrings(each, change));
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, each]) => [key, mapStrings(each, change)]),
  );
}

const VARIABLE = /\$\{([^}]+)\}/g;

export interface McpbVariables {
  /** Where the bundle was extracted: `${__dirname}`. */
  readonly directory: string;
  readonly home: string;
  /** `/`, or `\` on Windows: `${/}` and `${pathSeparator}`. */
  readonly separator: string;
}

/**
 * The manifest's `${...}` variables in every string of the server: `${__dirname}`, `${HOME}`, `${/}` and
 * `${pathSeparator}`. `${user_config.<key>}` stays as written: the kit fills it from the bundle's own
 * saved settings when it resolves the server, in its one substitution pass; any other variable is left
 * as written.
 */
export function bundleServerOf(
  manifest: McpbManifest,
  variables: McpbVariables,
): Readonly<Record<string, unknown>> {
  const values: Readonly<Record<string, string>> = {
    __dirname: variables.directory,
    HOME: variables.home,
    '/': variables.separator,
    pathSeparator: variables.separator,
  };
  const text = (source: string): string =>
    source.replace(VARIABLE, (match, name: string) =>
      Object.hasOwn(values, name) ? (values[name] ?? match) : match,
    );
  return Object.fromEntries(
    Object.entries(manifest.server).map(([key, each]) => [key, mapStrings(each, text)]),
  );
}
