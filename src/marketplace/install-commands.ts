import { error, type PluginIssue } from '../format/issues.ts';
import { OFFICIAL_MARKETPLACE_ADD } from './install-hosts.ts';
import { PLUGIN_ACTIVE, RELOAD_TO_APPLY, type InstallSurface } from './install-errors.ts';
import { defaultScope, type ChosenScope } from './install-scopes.ts';

/**
 * What an install command does on each surface (plugins/install.md, "Install a plugin", "Install
 * from your shell", "Add a marketplace and install in one command", "JetBrains, non-interactive
 * runs, and the Agent SDK"): pure plans of what the command opens, adds, asks and prints; the host
 * runs them. The kit adds nothing to settings and prints nothing itself.
 */

export interface InstallCommand {
  readonly surface: InstallSurface;
  /** `<name>@<marketplace>`, or the bare name when `marketplace` (the `--marketplace` source) is given. */
  readonly plugin: string;
  /** The `--marketplace` source: "the same forms as `/plugin marketplace add`". */
  readonly marketplace?: string;
  /** `--scope` in a shell. */
  readonly scope?: ChosenScope;
  /** A marketplace from that source is already added. */
  readonly marketplaceAdded?: boolean;
}

export interface InstallCommandPlan {
  /** The plugin is installed now; false when the command only opens its details to review. */
  readonly installs: boolean;
  /** "In a session, this command doesn't install right away: it opens the `/plugin` panel on that plugin's details." */
  readonly opensDetails: boolean;
  /** "Claude Code shows the source it resolved and asks you to confirm before adding it." */
  readonly confirmsMarketplace: boolean;
  readonly addsMarketplace: boolean;
  /** A marketplace the shell adds "is declared in your user settings even when you pass `--scope project`". */
  readonly marketplaceDeclaredIn: 'user' | undefined;
  /** The scope of the install; `undefined` in a session, where the panel asks. */
  readonly scope: ChosenScope | undefined;
}

const SURFACES: {
  readonly [S in InstallSurface]: (
    command: InstallCommand,
    adds: boolean,
  ) => Omit<InstallCommandPlan, 'addsMarketplace'>;
} = {
  session: (_, adds) => ({
    installs: false,
    opensDetails: true,
    confirmsMarketplace: adds,
    marketplaceDeclaredIn: undefined,
    scope: undefined,
  }),
  shell: (command, adds) => ({
    installs: true,
    opensDetails: false,
    confirmsMarketplace: false,
    marketplaceDeclaredIn: adds ? 'user' : undefined,
    scope: command.scope ?? defaultScope('install', []),
  }),
};

const refuse = (message: string): PluginIssue => error('plugin', message);

/** The refusals before anything runs: a suffixed name beside `--marketplace`, a source with spaces in a session. */
function commandIssue(command: InstallCommand): PluginIssue | undefined {
  if (command.marketplace === undefined) return undefined;
  if (command.plugin.includes('@')) {
    return refuse(
      `Give the plugin name by itself, without an @marketplace suffix, when --marketplace names the source: ${command.plugin}`,
    );
  }
  return command.surface === 'session' && /\s/.test(command.marketplace)
    ? refuse(`In a session, the --marketplace source can't contain spaces: ${command.marketplace}`)
    : undefined;
}

/**
 * Plans an install command. A marketplace "you've already added from that source is reused";
 * a new one is added, after a confirmation in a session and without one from a shell.
 */
export function planInstallCommand(command: InstallCommand): InstallCommandPlan | PluginIssue {
  const refused = commandIssue(command);
  if (refused !== undefined) return refused;
  const adds = command.marketplace !== undefined && command.marketplaceAdded !== true;
  return { ...SURFACES[command.surface](command, adds), addsMarketplace: adds };
}

/** What the shell prints, in order: the marketplace it added, then the install ("when it finishes"). */
export function shellInstallLines(input: {
  readonly pluginId: string;
  readonly scope: ChosenScope;
  /** The name of the marketplace the command added; absent when it reused one or none was named. */
  readonly addedMarketplace?: string;
}): readonly string[] {
  const added =
    input.addedMarketplace === undefined
      ? []
      : [`Successfully added marketplace: ${input.addedMarketplace} (declared in user settings)`];
  return [...added, `Successfully installed plugin: ${input.pluginId} (scope: ${input.scope})`];
}

/**
 * "On a machine where no one has opened an interactive Claude Code session yet, the official
 * marketplace isn't registered, so a script that installs from it runs `claude plugin marketplace
 * add anthropics/claude-plugins-official` before the install."
 */
export function shellInstallPrelude(input: {
  readonly marketplace: string;
  readonly registered: readonly string[];
}): readonly string[] {
  const needed =
    input.marketplace === OFFICIAL_MARKETPLACE_ADD.name &&
    !input.registered.includes(OFFICIAL_MARKETPLACE_ADD.name);
  return needed ? [`claude plugin marketplace add ${OFFICIAL_MARKETPLACE_ADD.source}`] : [];
}

// ---- the install summary ----

export interface SummaryFacts {
  /** Activating the plugin now would invalidate the prompt cache. */
  readonly invalidatesPromptCache: boolean;
  readonly activationFailed: boolean;
  /** The plugin could not be loaded at all. */
  readonly loadFailed: boolean;
  /** The plugin's bundled MCP server needs options before it can start. */
  readonly bundledServerNeedsSetup: boolean;
}

export interface InstallSummary {
  /** The last sentences of the summary. */
  readonly lines: readonly string[];
  /** The panel closes and Claude Code runs `/reload-plugins` for you. */
  readonly runsReload: boolean;
  /** The reload would invalidate the prompt cache: it warns and leaves the plugin pending. */
  readonly pending: boolean;
}

const SETUP = 'Its bundled MCP server needs configuration before it can start';
const LOAD_FAILED = "The plugin couldn't be loaded";

/**
 * The summary after the scope is chosen: "Active now" (`Plugin is now active.`), active with a
 * server that needs setup, "Reload needed" (`Run /reload-plugins to apply.`, which the panel runs
 * for you unless it would invalidate the prompt cache, when the plugin stays pending until
 * `/reload-plugins --force`), or "Load failed".
 */
export function installSummary(facts: SummaryFacts): InstallSummary {
  if (facts.loadFailed) return { lines: [LOAD_FAILED], runsReload: false, pending: false };
  if (facts.activationFailed || facts.invalidatesPromptCache) {
    return {
      lines: [RELOAD_TO_APPLY],
      runsReload: !facts.invalidatesPromptCache,
      pending: facts.invalidatesPromptCache,
    };
  }
  const setup = facts.bundledServerNeedsSetup ? [SETUP] : [];
  return { lines: [PLUGIN_ACTIVE, ...setup], runsReload: false, pending: false };
}
