/**
 * The component limits of a repository plugin (plugins/loading.md, "Trust check and component limits
 * for repository plugins"). They apply to a plugin already read by `loadPlugin`, which stays as it
 * is: `repositoryLoadInput` withholds what the limits forbid before the load, `limitRepositoryPlugin`
 * trims and annotates what came back. Components that run code are restricted:
 *
 * - MCP servers it declares go through the same per-server approval as a project `.mcp.json`;
 * - MCP servers declared as an MCP bundle, a `.mcpb` or `.dxt` file, or from a file outside the
 *   plugin directory are skipped ("Declare them inline or in a `.mcp.json` inside the plugin
 *   directory");
 * - background monitors do not load.
 *
 * Nothing applies to a plugin under the user's own `~/.claude/skills/`.
 */
import { warning, type PluginIssue } from '../format/issues.ts';
import { COMPONENT_KINDS, type ComponentKind } from '../format/layout.ts';
import type { PortFailure } from '../ports/failure.ts';
import type { McpBundleReader } from '../ports/mcp-bundle.ts';
import { loadPlugin, type LoadPluginInput } from './load-plugin.ts';
import type { LoadedPlugin, Plugin } from './plugin-model.ts';
import { isRepositorySupplied, type RepositoryOrigin } from './repository-trust.ts';
import { MONITORS_NOT_LOADED, BUNDLES_NOT_LOADED } from './repository-messages.ts';

/** A plugin after the limits of its kind, what they said and the servers that wait for approval. */
export interface Limited {
  readonly plugin: Plugin;
  readonly issues: readonly PluginIssue[];
  /** Servers that go through the per-server approval of a project `.mcp.json`, by name. */
  readonly approvals: readonly string[];
}

/** The limit of one component kind over a plugin; a kind the docs do not limit returns it as it is. */
export type ComponentLimit = (plugin: Plugin) => Limited;

const unrestricted: ComponentLimit = (plugin) => ({ plugin, issues: [], approvals: [] });

const noMonitors: ComponentLimit = (plugin) =>
  plugin.monitors.length === 0
    ? unrestricted(plugin)
    : {
        plugin: { ...plugin, monitors: [] },
        issues: [warning('monitors', MONITORS_NOT_LOADED)],
        approvals: [],
      };

const serverApproval: ComponentLimit = (plugin) => ({
  plugin,
  issues: [],
  approvals: Object.keys(plugin.mcpServers),
});

/**
 * One limit per component kind, typed over the layout's kinds so a new kind must say what a
 * repository may do with it. Judgment (spec/judgments.md): the docs limit only the three above, so
 * every other kind loads as it does elsewhere.
 */
export const COMPONENT_LIMITS: { readonly [K in ComponentKind]: ComponentLimit } = {
  manifest: unrestricted,
  skills: unrestricted,
  commands: unrestricted,
  agents: unrestricted,
  hooks: unrestricted,
  mcpServers: serverApproval,
  lspServers: unrestricted,
  outputStyles: unrestricted,
  workflows: unrestricted,
  themes: unrestricted,
  monitors: noMonitors,
  bin: unrestricted,
  settings: unrestricted,
};

/** A bundle reader that opens nothing: a repository plugin's bundles are skipped, with the reason. */
const refusingBundles: McpBundleReader = {
  open: (): Promise<PortFailure> =>
    Promise.resolve({ failure: 'repository-plugin', message: BUNDLES_NOT_LOADED }),
};

/**
 * The input to load a plugin of that origin with: a repository plugin never gets the host's bundle
 * reader, so a bundle is skipped and says why. A path outside the
 * plugin directory is refused by `loadPlugin` already (`<component> path escapes plugin directory`).
 */
export function repositoryLoadInput(
  input: LoadPluginInput,
  origin: RepositoryOrigin,
): LoadPluginInput {
  if (!isRepositorySupplied(origin)) return input;
  const { bundles: _bundles, ...rest } = input;
  return { ...rest, bundles: refusingBundles };
}

/** Applies every component kind's limit to a loaded plugin. A plugin that did not load stays as it is. */
export function limitRepositoryPlugin(
  loaded: LoadedPlugin,
  origin: RepositoryOrigin,
): LoadedPlugin & { readonly approvals: readonly string[] } {
  if (!isRepositorySupplied(origin) || loaded.plugin === undefined) {
    return { ...loaded, approvals: [] };
  }
  let plugin = loaded.plugin;
  const issues = [...loaded.issues];
  const approvals: string[] = [];
  for (const kind of COMPONENT_KINDS) {
    const limited = COMPONENT_LIMITS[kind](plugin);
    plugin = limited.plugin;
    issues.push(...limited.issues);
    approvals.push(...limited.approvals);
  }
  return { plugin, issues, approvals };
}

/** `loadPlugin` for a plugin of that origin, limits applied. */
export async function loadRepositoryPlugin(input: LoadPluginInput, origin: RepositoryOrigin) {
  return limitRepositoryPlugin(await loadPlugin(repositoryLoadInput(input, origin)), origin);
}
