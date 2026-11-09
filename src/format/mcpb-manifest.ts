/**
 * What an MCPB bundle's own `manifest.json` says (plugins/components.md, "Include a packaged MCPB
 * server": "The server takes its name from the `name` in the bundle's manifest" and "A bundle's own
 * manifest can declare settings the server needs from the user in a `user_config` block"). The format
 * itself lives at github.com/modelcontextprotocol/mcpb, not in the pulled docs, so every rule here is
 * a judgment (spec/judgments.md). Pure data: extracting or downloading the archive is the host's.
 */

export const MCPB_OPTION_TYPES = ['string', 'number', 'boolean', 'directory', 'file'] as const;
export type McpbOptionType = (typeof MCPB_OPTION_TYPES)[number];

/** One setting of a bundle's `user_config` block. */
export interface McpbOption {
  readonly type: McpbOptionType;
  readonly title?: string;
  readonly description: string;
  /** The bundle marks it required (it may still have a default of its own). */
  readonly required: boolean;
  /** `sensitive: true`: the value is a secret. */
  readonly sensitive: boolean;
  readonly default?: string | number | boolean;
}

export interface McpbManifest {
  /** The server's name: the manifest's `name`. */
  readonly name: string;
  /** The `server.mcp_config` (or the one an `entry_point` stands for) for this platform; `${...}` unresolved. */
  readonly server: Readonly<Record<string, unknown>>;
  /** The `user_config` block by key. */
  readonly options: Readonly<Record<string, McpbOption>>;
}

export type McpbRead = { readonly manifest: McpbManifest } | { readonly problem: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

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

function optionOf(raw: Record<string, unknown>): McpbOption {
  const fallback = raw.default;
  return {
    type: optionType(raw.type),
    ...(typeof raw.title === 'string' ? { title: raw.title } : {}),
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
 * The name, server and settings of a bundle manifest for `platform` (`darwin`, `linux`, `win32`).
 * Judgments: a `type` other than `node` or `python` with an `entry_point` runs that file as a binary;
 * a `user_config` entry that is not an object is skipped and a `type` the kit does not know is `string`.
 */
export function readMcpbManifest(manifest: unknown, platform: string): McpbRead {
  if (!isRecord(manifest) || typeof manifest.name !== 'string') {
    return { problem: 'the bundle manifest has no name' };
  }
  const server = isRecord(manifest.server) ? serverOf(manifest.server, platform) : undefined;
  if (server === undefined) return { problem: 'the bundle manifest declares no server' };
  const declared = isRecord(manifest.user_config) ? manifest.user_config : {};
  const options = Object.fromEntries(
    Object.entries(declared).flatMap(([key, raw]) => (isRecord(raw) ? [[key, optionOf(raw)]] : [])),
  );
  return { manifest: { name: manifest.name, server, options } };
}

/** The key a bundled server's setting has among the plugin's settings: `<server>.<key>`. */
export const bundleSettingKey = (server: string, key: string): string => `${server}.${key}`;

/**
 * The settings of a bundle the server cannot start without (plugins/components.md: "A bundled server
 * with a required setting that has no saved value doesn't start"), as `<server>.<key>`. Judgment: a
 * required setting with a default of its own is not one (`McpBundleSetting.required`).
 */
export const requiredBundleSettings = (manifest: McpbManifest): string[] =>
  Object.entries(manifest.options).flatMap(([key, option]) =>
    option.required && option.default === undefined ? [bundleSettingKey(manifest.name, key)] : [],
  );

/** The settings among `required` that `saved` has no value for (an empty text is no value). */
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
const SETTING_PREFIX = 'user_config.';

export interface McpbVariables {
  /** Where the bundle was extracted: `${__dirname}`. */
  readonly directory: string;
  readonly home: string;
  /** `/`, or `\` on Windows: `${/}` and `${pathSeparator}`. */
  readonly separator: string;
}

/**
 * The manifest's `${...}` variables in every string of the server: `${__dirname}`, `${HOME}`, `${/}` and
 * `${pathSeparator}`. `${user_config.<key>}` becomes `${user_config.<server>.<key>}`, the setting's key
 * among the plugin's, for `fillBundleSettings`; any other variable is left as written.
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
    source.replace(VARIABLE, (match, name: string) => {
      if (name.startsWith(SETTING_PREFIX)) {
        return `\${${SETTING_PREFIX}${bundleSettingKey(manifest.name, name.slice(SETTING_PREFIX.length))}}`;
      }
      return Object.hasOwn(values, name) ? (values[name] ?? match) : match;
    });
  return Object.fromEntries(
    Object.entries(manifest.server).map(([key, each]) => [key, mapStrings(each, text)]),
  );
}

const SETTING_REFERENCE = /\$\{user_config\.([^.{}]+\.[^{}]+)\}/g;

/** `${user_config.<server>.<key>}` in every string of `value`, filled from `saved` (by `<server>.<key>`); one with no value stays. */
export function fillBundleSettings(
  value: unknown,
  saved: Readonly<Record<string, unknown>>,
): unknown {
  return mapStrings(value, (text) =>
    text.replace(SETTING_REFERENCE, (match, key: string) => {
      const found = saved[key];
      const plain =
        typeof found === 'string' || typeof found === 'number' || typeof found === 'boolean';
      return plain ? String(found) : match;
    }),
  );
}
