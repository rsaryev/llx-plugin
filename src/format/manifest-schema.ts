import { z } from 'zod';

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

/** `userConfig` keys: letters, digits and underscores, not starting with a digit. */
export const USER_CONFIG_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const userConfigOptionSchema = z.strictObject({
  type: z.enum(['string', 'number', 'boolean', 'directory', 'file']),
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
export type UserConfigOption = z.infer<typeof userConfigOptionSchema>;

const userConfig = z.record(z.string().regex(USER_CONFIG_KEY), userConfigOptionSchema);

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
    message: 'Set exactly one of "source" or "content"',
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
