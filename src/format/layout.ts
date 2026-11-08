import type { PluginManifest } from './manifest-schema.ts';

/**
 * The standard layout (plugins/manifest-reference.md, "Standard layout"): the default location of
 * each component under the plugin root, the manifest key that points elsewhere, and how that key
 * combines with the default ("How each key combines with its default location"). Discovery reads
 * this registry and nothing else, so a component kind added here fails the typecheck wherever it
 * needs handling.
 */
export const COMPONENT_KINDS = [
  'manifest',
  'skills',
  'commands',
  'agents',
  'hooks',
  'mcpServers',
  'lspServers',
  'outputStyles',
  'workflows',
  'themes',
  'monitors',
  'bin',
  'settings',
] as const;
export type ComponentKind = (typeof COMPONENT_KINDS)[number];

/** `replace`: the key replaces the default. `add`: both load. `merge`: the default loads first, the key merges into it. */
export const COMBINE_MODES = ['replace', 'add', 'merge'] as const;
export type CombineMode = (typeof COMBINE_MODES)[number];

/** A manifest key that names a component, written as the docs write it (`experimental.themes`). */
export interface ManifestKey {
  readonly key: string;
  readonly read: (manifest: PluginManifest) => unknown;
}

export interface LayoutEntry {
  /** Relative to the plugin root, `/`-separated, no `./` and no trailing slash. */
  readonly location: string;
  /** Whether the default location is a directory (false: a file). */
  readonly directory: boolean;
  /**
   * The folder the "Default <folder>/ folder is ignored" warning names, for a key that replaces the
   * default; `undefined` for a kind that cannot be ignored.
   */
  readonly folder: string | undefined;
  /** The manifest keys that point elsewhere, the first one set wins. */
  readonly manifestKeys: readonly ManifestKey[];
  /** `undefined`: the kind has no path key that combines with a default (manifest, bin, settings). */
  readonly combine: CombineMode | undefined;
  /** The extension a scan of a directory of this kind keeps, `undefined` for any. */
  readonly extension: string | undefined;
}

const key = (name: string, read: ManifestKey['read']): ManifestKey => ({ key: name, read });

export const STANDARD_LAYOUT: { readonly [K in ComponentKind]: LayoutEntry } = {
  manifest: {
    location: '.claude-plugin/plugin.json',
    directory: false,
    folder: undefined,
    manifestKeys: [],
    combine: undefined,
    extension: '.json',
  },
  skills: {
    location: 'skills',
    directory: true,
    folder: undefined,
    manifestKeys: [key('skills', (manifest) => manifest.skills)],
    combine: 'add',
    extension: undefined,
  },
  commands: {
    location: 'commands',
    directory: true,
    folder: 'commands',
    manifestKeys: [key('commands', (manifest) => manifest.commands)],
    combine: 'replace',
    extension: '.md',
  },
  agents: {
    location: 'agents',
    directory: true,
    folder: 'agents',
    manifestKeys: [key('agents', (manifest) => manifest.agents)],
    combine: 'replace',
    extension: '.md',
  },
  hooks: {
    location: 'hooks/hooks.json',
    directory: false,
    folder: undefined,
    manifestKeys: [key('hooks', (manifest) => manifest.hooks)],
    combine: 'merge',
    extension: '.json',
  },
  mcpServers: {
    location: '.mcp.json',
    directory: false,
    folder: undefined,
    manifestKeys: [key('mcpServers', (manifest) => manifest.mcpServers)],
    combine: 'merge',
    extension: '.json',
  },
  lspServers: {
    location: '.lsp.json',
    directory: false,
    folder: undefined,
    manifestKeys: [key('lspServers', (manifest) => manifest.lspServers)],
    combine: 'merge',
    extension: '.json',
  },
  outputStyles: {
    location: 'output-styles',
    directory: true,
    folder: 'output-styles',
    manifestKeys: [key('outputStyles', (manifest) => manifest.outputStyles)],
    combine: 'replace',
    extension: '.md',
  },
  workflows: {
    location: 'workflows',
    directory: true,
    folder: 'workflows',
    manifestKeys: [key('workflows', (manifest) => manifest.workflows)],
    combine: 'replace',
    extension: '.js',
  },
  themes: {
    location: 'themes',
    directory: true,
    folder: 'themes',
    manifestKeys: [
      key('experimental.themes', (manifest) => manifest.experimental?.themes),
      key('themes', (manifest) => manifest.themes),
    ],
    combine: 'replace',
    extension: '.json',
  },
  monitors: {
    location: 'monitors/monitors.json',
    directory: false,
    folder: 'monitors',
    manifestKeys: [
      key('experimental.monitors', (manifest) => manifest.experimental?.monitors),
      key('monitors', (manifest) => manifest.monitors),
    ],
    combine: 'replace',
    extension: '.json',
  },
  bin: {
    location: 'bin',
    directory: true,
    folder: undefined,
    manifestKeys: [],
    combine: undefined,
    extension: undefined,
  },
  settings: {
    location: 'settings.json',
    directory: false,
    folder: undefined,
    manifestKeys: [key('settings', (manifest) => manifest.settings)],
    combine: undefined,
    extension: '.json',
  },
};

/** The first manifest key of a kind that is set, with its value; `undefined` when none is. */
export function declaredKey(
  manifest: PluginManifest | undefined,
  kind: ComponentKind,
): { readonly key: string; readonly value: unknown } | undefined {
  if (!manifest) return undefined;
  for (const candidate of STANDARD_LAYOUT[kind].manifestKeys) {
    const value = candidate.read(manifest);
    if (value !== undefined) return { key: candidate.key, value };
  }
  return undefined;
}
