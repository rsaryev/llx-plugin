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
  | { readonly reload: 'queue-until-response-ends' }
  | { readonly reload: 'warn-and-leave-pending'; readonly forceCommand: string };

/**
 * "When you close the `/plugin` panel with pending changes you made in it, Claude Code runs
 * `/reload-plugins` for you. If the reload would invalidate the prompt cache, it warns and leaves
 * the changes pending instead. Run `/reload-plugins --force` to apply them anyway." The panel "runs
 * `/reload-plugins` for you, or queues it until the response that's streaming finishes"
 * (troubleshooting.md, `Run /reload-plugins to apply.`). Judgment (spec/judgments.md): the warning
 * comes first, since the docs give the prompt-cache refusal without a streaming exception.
 */
export function closePanel(state: {
  readonly pending: boolean;
  readonly invalidatesPromptCache: boolean;
  /** A response is streaming in the session. */
  readonly streaming: boolean;
}): PanelClose {
  if (!state.pending) return { reload: 'none' };
  if (state.invalidatesPromptCache) {
    return { reload: 'warn-and-leave-pending', forceCommand: '/reload-plugins --force' };
  }
  return state.streaming ? { reload: 'queue-until-response-ends' } : { reload: 'run' };
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

/**
 * The command for an action, in a shell or in a session. `claude plugin marketplace remove <name>`
 * needs the name; `update` takes one or none; in a session `/plugin marketplace remove [name]`
 * opens the Marketplaces tab with none (cli-reference.md, "plugin marketplace remove", "Commands in
 * a session").
 */
export function marketplaceCommand(action: 'list', surface: CommandSurface): string;
export function marketplaceCommand(
  action: 'update',
  surface: CommandSurface,
  name?: string,
): string;
export function marketplaceCommand(action: 'remove', surface: 'shell', name: string): string;
export function marketplaceCommand(action: 'remove', surface: 'session', name?: string): string;
export function marketplaceCommand(
  action: MarketplaceAction,
  surface: CommandSurface,
  name?: string,
): string {
  return [PREFIX[surface], action, name].filter((part) => part !== undefined).join(' ');
}
