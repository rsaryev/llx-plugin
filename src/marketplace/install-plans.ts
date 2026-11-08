import {
  isWritableScope,
  scopeReach,
  type ChosenScope,
  type InstallScope,
} from './install-scopes.ts';

/**
 * What the `/plugin` panel and the marketplace commands do, as plans a host executes (plugins/
 * install.md, "Manage installed plugins", "Uninstall a plugin the project enables", "Update plugins
 * now", "Manage marketplaces"; plugins/cli-reference.md, "plugin marketplace update"): pure
 * decisions over facts the host read; the kit moves no file and writes no settings.
 */

// ---- the installed plugin's details menu ----

export interface PluginActionFacts {
  readonly enabled: boolean;
  /** Every scope the plugin is installed or enabled in. */
  readonly scopes: readonly InstallScope[];
  /** The manifest declares `userConfig` options. */
  readonly userConfig: boolean;
  /** The plugin includes a bundled MCP server (a `.mcpb`) with its own `user_config`. */
  readonly bundledMcpServer: boolean;
}

/**
 * The items of a plugin's details menu: `Disable plugin` or `Enable plugin`, `Update now` and
 * `Uninstall`, then `Configure options` (a `userConfig`) and `Configure` (a bundled MCP server),
 * which "a plugin can show both". A plugin only at Managed scope "you can't enable, disable, or
 * uninstall here". Judgment (spec/judgments.md): it keeps `Update now`, since `claude plugin
 * update` accepts the managed scope, and a plugin that is also at a writable scope keeps its actions.
 */
export function pluginActions(facts: PluginActionFacts): readonly string[] {
  const changeable = facts.scopes.length === 0 || facts.scopes.some(isWritableScope);
  return [
    ...(changeable ? [facts.enabled ? 'Disable plugin' : 'Enable plugin'] : []),
    'Update now',
    ...(changeable ? ['Uninstall'] : []),
    ...(facts.userConfig ? ['Configure options'] : []),
    ...(facts.bundledMcpServer ? ['Configure'] : []),
  ];
}

export type PanelClose =
  | { readonly reload: 'run' }
  | { readonly reload: 'none' }
  | { readonly reload: 'warn-and-leave-pending'; readonly forceCommand: string };

/**
 * "When you close the `/plugin` panel with pending changes you made in it, Claude Code runs
 * `/reload-plugins` for you. If the reload would invalidate the prompt cache, it warns and leaves
 * the changes pending instead. Run `/reload-plugins --force` to apply them anyway."
 */
export function closePanel(state: {
  readonly pending: boolean;
  readonly invalidatesPromptCache: boolean;
}): PanelClose {
  if (!state.pending) return { reload: 'none' };
  return state.invalidatesPromptCache
    ? { reload: 'warn-and-leave-pending', forceCommand: '/reload-plugins --force' }
    : { reload: 'run' };
}

// ---- uninstalling a plugin the project enables ----

export interface UninstallOption {
  readonly key: 'y' | 'u';
  readonly label: string;
  /** Writes the plugin's value into this settings file. */
  readonly writes?: { readonly file: string; readonly value: false };
  /** Removes the plugin from this settings file. */
  readonly removesFrom?: string;
  /** Whether the plugin stays installed for the project afterwards. */
  readonly installed: boolean;
}

const fileOf = (scope: ChosenScope): string => scopeReach(scope).file;

/**
 * For a plugin this repository's `.claude/settings.json` enables, Uninstall asks: `y`, **Disable
 * for me** writes `false` for it in your `.claude/settings.local.json` and leaves it installed for
 * the project; `u`, **Uninstall for everyone** removes it from the shared `.claude/settings.json`.
 * Any other plugin is uninstalled without the question (`undefined`).
 */
export function uninstallChoice(facts: {
  readonly enabledByProject: boolean;
}): readonly UninstallOption[] | undefined {
  if (!facts.enabledByProject) return undefined;
  return [
    {
      key: 'y',
      label: 'Disable for me',
      writes: { file: fileOf('local'), value: false },
      installed: true,
    },
    { key: 'u', label: 'Uninstall for everyone', removesFrom: fileOf('project'), installed: false },
  ];
}

// ---- marketplaces ----

export type MarketplaceAction = 'list' | 'update' | 'remove';
export type CommandSurface = 'shell' | 'session';

const PREFIX: { readonly [S in CommandSurface]: string } = {
  shell: 'claude plugin marketplace',
  session: '/plugin marketplace',
};

/** The command for an action, in a shell or in a session; `update` and `remove` take the marketplace name. */
export const marketplaceCommand = (
  action: MarketplaceAction,
  surface: CommandSurface,
  name?: string,
): string => [PREFIX[surface], action, name].filter((part) => part !== undefined).join(' ');

export interface MarketplaceUpdatePlan {
  /** The marketplaces whose listing is refreshed. */
  readonly refresh: readonly string[];
  /** `claude plugin marketplace update` refreshes listings only; installed plugins stay at their versions. */
  readonly updatesInstalledPlugins: false;
  readonly success?: string;
  readonly failure?: string;
}

/**
 * `claude plugin marketplace update <name>` refreshes that listing and prints `Successfully updated
 * marketplace: <name>`; with no name it refreshes every marketplace's listing, leaves installed
 * plugins at their current versions and prints a count such as `Successfully updated 2
 * marketplaces`. A name that is not registered refreshes nothing: `Marketplace '<name>' not
 * found` (troubleshooting.md).
 */
export function planMarketplaceUpdate(
  requested: string | undefined,
  registered: readonly string[],
): MarketplaceUpdatePlan {
  const none = { updatesInstalledPlugins: false } as const;
  if (requested === undefined) {
    return {
      refresh: registered,
      ...none,
      success: `Successfully updated ${registered.length} marketplace${registered.length === 1 ? '' : 's'}`,
    };
  }
  return registered.includes(requested)
    ? { refresh: [requested], ...none, success: `Successfully updated marketplace: ${requested}` }
    : { refresh: [], ...none, failure: `Marketplace '${requested}' not found` };
}

export interface MarketplaceTabPlugin {
  readonly id: string;
  /** A `command`-source plugin. */
  readonly commandSource: boolean;
  /** A marketplace entry that sets a `headersHelper` command. */
  readonly headersHelper: boolean;
}

/**
 * **Update marketplace** on the Marketplaces tab refreshes the listing, updates the plugins you
 * installed from it and reports the ones it left for you: "A plugin with a `command` source or with
 * a marketplace entry that sets a `headersHelper` command isn't updated this way."
 */
export function marketplaceTabUpdate(installed: readonly MarketplaceTabPlugin[]): {
  readonly update: readonly string[];
  readonly leftForYou: readonly string[];
} {
  const left = (one: MarketplaceTabPlugin): boolean => one.commandSource || one.headersHelper;
  return {
    update: installed.filter((one) => !left(one)).map((one) => one.id),
    leftForYou: installed.filter(left).map((one) => one.id),
  };
}

export interface MarketplaceRemovalFacts {
  readonly marketplace: string;
  /** Every plugin installed, with its scopes. */
  readonly installed: readonly { readonly id: string; readonly scopes: readonly InstallScope[] }[];
  /** Every `enabledPlugins` entry in a settings file. */
  readonly enabledEntries: readonly { readonly id: string; readonly scope: ChosenScope }[];
}

export interface MarketplaceRemovalPlan {
  readonly uninstall: readonly { readonly id: string; readonly scopes: readonly InstallScope[] }[];
  readonly dropEnabledEntries: readonly { readonly id: string; readonly scope: ChosenScope }[];
  /** The plugins the Marketplaces tab names before it asks to confirm. */
  readonly confirmNames: readonly string[];
}

/**
 * "When you remove a marketplace, Claude Code uninstalls every plugin you installed from it and
 * removes their `enabledPlugins` entries from your settings files." A plugin is from the marketplace
 * when its id ends `@<marketplace>`.
 */
export function planMarketplaceRemoval(facts: MarketplaceRemovalFacts): MarketplaceRemovalPlan {
  const from = (id: string): boolean => id.endsWith(`@${facts.marketplace}`);
  const uninstall = facts.installed.filter((one) => from(one.id));
  return {
    uninstall,
    dropEnabledEntries: facts.enabledEntries.filter((one) => from(one.id)),
    confirmNames: uninstall.map((one) => one.id),
  };
}
