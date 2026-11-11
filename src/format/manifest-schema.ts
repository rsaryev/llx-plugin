import { z } from 'zod';
import { USER_CONFIG_KEY } from './user-config-refs.ts';

/**
 * The top-level keys of `.claude-plugin/plugin.json` and their documented types
 * (plugins/manifest-reference.md, "Fields"). Strict where the docs say so ("Unrecognized fields"):
 * `userConfig` options and `channels` entries. Inline hook, MCP and LSP configs are checked by
 * their own readers, not here.
 */

const path = z.string();
const pathOrPaths = z.union([path, z.array(path)]);
const object = z.record(z.string(), z.unknown());
const fileOrInline = z.union([path, object, z.array(z.union([path, object]))]);
const monitors = z.union([path, z.array(z.unknown())]);

const OPTION_TYPES = ['string', 'number', 'boolean', 'directory', 'file'] as const;
/** The types `options` applies to: "For `string`, the values the field accepts". */
const TYPES_WITH_OPTIONS: ReadonlySet<(typeof OPTION_TYPES)[number]> = new Set(['string']);

const userConfigFields = z.strictObject({
  type: z.enum(OPTION_TYPES),
  title: z.string(),
  description: z.string(),
  required: z.boolean().optional(),
  default: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]).optional(),
  options: z.array(z.string().min(1).max(64)).optional(),
  multiple: z.boolean().optional(),
  sensitive: z.boolean().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
});
type UserConfigFields = z.infer<typeof userConfigFields>;

/**
 * The `options` rules (manifest-reference.md, "Limit a field to fixed options"): "`options` applies to
 * a `string` field that isn't `multiple` or `sensitive`. Set `default` to one of the listed values,
 * or set `required: true` so the user must pick one." A plugin that breaks them "fails to load".
 * Judgment: "or set `required: true`" is read as a rule, so options with neither fail too
 * (spec/judgments.md).
 */
function optionsProblem(option: UserConfigFields): string | undefined {
  const { options, default: fallback } = option;
  if (options === undefined) return undefined;
  if (!TYPES_WITH_OPTIONS.has(option.type)) return '"options" applies only to a "string" field';
  if (option.multiple === true) return '"options" cannot be combined with "multiple"';
  if (option.sensitive === true) return '"options" cannot be combined with "sensitive"';
  if (fallback !== undefined && !(typeof fallback === 'string' && options.includes(fallback))) {
    return '"default" must be one of the listed "options"';
  }
  if (fallback === undefined && option.required !== true) {
    return '"options" needs a "default" from the list, or "required": true';
  }
  return undefined;
}

export const userConfigOptionSchema = userConfigFields.superRefine((option, context) => {
  const problem = optionsProblem(option);
  if (problem !== undefined) context.addIssue({ code: 'custom', message: problem });
});
export type UserConfigOption = z.infer<typeof userConfigOptionSchema>;

const userConfig = z.record(z.string().regex(USER_CONFIG_KEY), userConfigOptionSchema);

/** The manifest says an entry that sets both or neither "fails validation". */
export const COMMAND_ENTRY_ONE_OF = 'Set exactly one of "source" or "content"';

const commandEntrySchema = z
  .object({
    source: path.optional(),
    content: z.string().optional(),
    description: z.string().optional(),
    argumentHint: z.string().optional(),
    model: z.string().optional(),
    allowedTools: z.array(z.string()).optional(),
  })
  .refine((entry) => (entry.source === undefined) !== (entry.content === undefined), {
    message: COMMAND_ENTRY_ONE_OF,
  });
export type CommandEntry = z.infer<typeof commandEntrySchema>;

const dependency = z.union([
  z.string().min(1),
  z.object({
    name: z.string().min(1),
    marketplace: z.string().optional(),
    version: z.string().optional(),
  }),
]);
export type PluginDependency = z.infer<typeof dependency>;

const channel = z.strictObject({
  server: z.string(),
  displayName: z.string().optional(),
  userConfig: userConfig.optional(),
});
/** A `channels` entry: a channel bound to one of the plugin's MCP servers. */
export type PluginChannel = z.infer<typeof channel>;

const url = z.string().refine((value) => URL.canParse(value), { message: 'Must parse as a URL' });

export const MANIFEST_SCHEMAS = {
  $schema: z.string(),
  name: z.string(),
  displayName: z.string(),
  version: z.string(),
  description: z.string(),
  author: z.object({ name: z.string(), email: z.string().optional(), url: z.string().optional() }),
  homepage: url,
  repository: z.string(),
  license: z.string(),
  keywords: z.array(z.string()),
  metadata: object,
  icon: z.string(),
  documentationUrl: z.string(),
  supportUrl: z.string(),
  privacyPolicyUrl: z.string(),
  termsOfServiceUrl: z.string(),
  defaultEnabled: z.boolean(),
  dependencies: z.array(dependency),
  settings: object,
  userConfig,
  types: path,
  channels: z.array(channel),
  skills: pathOrPaths,
  commands: z.union([pathOrPaths, z.record(z.string(), commandEntrySchema)]),
  agents: pathOrPaths,
  hooks: fileOrInline,
  mcpServers: fileOrInline,
  lspServers: fileOrInline,
  outputStyles: pathOrPaths,
  workflows: pathOrPaths,
  experimental: z.object({
    themes: pathOrPaths.optional(),
    monitors: monitors.optional(),
    evals: pathOrPaths.optional(),
  }),
  // Moved under `experimental`; still loaded at the top level, with a validator warning.
  themes: pathOrPaths,
  monitors,
} as const;

export type ManifestKey = keyof typeof MANIFEST_SCHEMAS;

/** The whole manifest: `name` required, every other documented key optional. */
export const manifestSchema = z.object(MANIFEST_SCHEMAS).partial().required({ name: true });

/** A manifest that loaded. */
export type PluginManifest = Readonly<z.output<typeof manifestSchema>>;

export const isManifestKey = (key: string): key is ManifestKey =>
  Object.hasOwn(MANIFEST_SCHEMAS, key);
