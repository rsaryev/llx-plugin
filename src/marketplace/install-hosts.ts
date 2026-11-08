import type { ChosenScope } from './install-scopes.ts';

/**
 * Where a plugin is installed from and what each place does (plugins/install.md, "Install a
 * plugin" and its tabs, "Install from your shell", "JetBrains, non-interactive runs, and the Agent
 * SDK"): one table of facts per host, read only through the plans below, which a host runs. The
 * kit opens nothing and adds nothing itself.
 */

export type InstallHost =
  | 'terminal'
  | 'jetbrains'
  | 'desktop'
  | 'vscode'
  | 'non-interactive'
  | 'agent-sdk'
  | 'cloud';

/** What to use to install and manage plugins on a host. */
export type InstallWith =
  | 'panel'
  | 'terminal-steps'
  | 'plugin-browser'
  | 'manage-plugins'
  | 'shell-commands'
  | 'sdk-plugins-option'
  | 'none';

/** When an install takes effect in a session. */
export type ApplyMoment = 'next-start' | 'reload-plugins' | 'install-summary' | 'open-sessions';

interface HostFacts {
  /** `/plugin` runs here and opens the panel. */
  readonly pluginPanel: boolean;
  readonly installWith: InstallWith;
  /** The reply to `/plugin` where it does not run. */
  readonly panelReply?: string;
  /** The scopes the install surface offers the user to choose between; none where there is no surface. */
  readonly scopes: readonly ChosenScope[];
  /** Claude Code starts an interactive terminal session here, which registers the official marketplace the first time. */
  readonly startsTerminalSession: boolean;
  /** When a plugin installed in this host's own surface takes effect; `undefined` where the docs say nothing. */
  readonly appliesAfterInstall: readonly ApplyMoment[] | undefined;
  /** Plugins already installed on the machine, or enabled by the repository's settings, load. */
  readonly loadsInstalled: boolean | undefined;
}

const THREE_SCOPES: readonly ChosenScope[] = ['user', 'project', 'local'];

const TERMINAL: HostFacts = {
  pluginPanel: true,
  installWith: 'panel',
  scopes: THREE_SCOPES,
  startsTerminalSession: true,
  // "prints an install summary": `installSummary` says whether the plugin is active or needs a reload
  appliesAfterInstall: ['install-summary'],
  loadsInstalled: true,
};

const INSTALL_HOSTS: { readonly [H in InstallHost]: HostFacts } = {
  terminal: TERMINAL,
  // "the JetBrains plugin runs Claude Code in the IDE's terminal, so use the Terminal tab's steps there"
  jetbrains: { ...TERMINAL, installWith: 'terminal-steps' },
  // "Click the + button next to the prompt box and select Add plugins"
  desktop: {
    pluginPanel: false,
    installWith: 'plugin-browser',
    scopes: THREE_SCOPES,
    startsTerminalSession: false,
    appliesAfterInstall: undefined,
    loadsInstalled: true,
  },
  // "Type /plugins ... Your changes apply to open sessions without a restart."
  vscode: {
    pluginPanel: false,
    installWith: 'manage-plugins',
    scopes: THREE_SCOPES,
    startsTerminalSession: false,
    appliesAfterInstall: ['open-sessions'],
    loadsInstalled: true,
  },
  // "`/plugin` doesn't run ... Plugins you already installed do load."
  'non-interactive': {
    pluginPanel: false,
    installWith: 'shell-commands',
    panelReply: "/plugin isn't available in this environment.",
    scopes: [],
    startsTerminalSession: false,
    appliesAfterInstall: undefined,
    loadsInstalled: true,
  },
  'agent-sdk': {
    pluginPanel: false,
    installWith: 'sdk-plugins-option',
    scopes: [],
    startsTerminalSession: false,
    appliesAfterInstall: undefined,
    loadsInstalled: undefined,
  },
  // "has no plugin browser and doesn't load the plugins you installed on your own machine or the
  // ones your repository's `.claude/settings.json` turns on"
  cloud: {
    pluginPanel: false,
    installWith: 'none',
    scopes: [],
    startsTerminalSession: false,
    appliesAfterInstall: undefined,
    loadsInstalled: false,
  },
};

export interface PluginCommandPlan {
  /** What `/plugin` opens: the Discover tab with no plugin name, the plugin's details with one; nothing where the panel does not run. */
  readonly opens: 'discover' | 'details' | undefined;
  /** What Claude replies where `/plugin` does not run, when the docs quote it. */
  readonly reply: string | undefined;
}

/**
 * What `/plugin` does on a host: "run `/plugin` with no plugin name: the panel opens on the
 * Discover tab"; with a name it opens that plugin's details; where it does not run (`claude -p`)
 * Claude replies `/plugin isn't available in this environment.`
 */
export function planPluginCommand(input: {
  readonly host: InstallHost;
  readonly plugin?: string;
}): PluginCommandPlan {
  const facts = INSTALL_HOSTS[input.host];
  if (!facts.pluginPanel) return { opens: undefined, reply: facts.panelReply };
  return { opens: input.plugin === undefined ? 'discover' : 'details', reply: undefined };
}

/** What to use to install and manage plugins on the host. */
export const installWith = (host: InstallHost): InstallWith => INSTALL_HOSTS[host].installWith;

/** The scopes the host's install surface offers, in the order the docs list them; none without a surface. */
export const scopeChoices = (host: InstallHost): readonly ChosenScope[] =>
  INSTALL_HOSTS[host].scopes;

/** Whether plugins installed on the machine, or enabled by the repository, load on the host; `undefined` where the docs say nothing. */
export const loadsInstalledPlugins = (host: InstallHost): boolean | undefined =>
  INSTALL_HOSTS[host].loadsInstalled;

/**
 * `claude plugin install` in a shell: "plugins it installs load the next time you start Claude
 * Code, or when you run `/reload-plugins` in a session that's already open".
 */
const SHELL_APPLIES: readonly ApplyMoment[] = ['next-start', 'reload-plugins'];

/** Where an install was made: `claude plugin install` in a shell, or the host's own install surface. */
export type ApplyOrigin = 'shell' | 'surface';

const APPLIES: {
  readonly [O in ApplyOrigin]: (host: InstallHost) => readonly ApplyMoment[] | undefined;
} = {
  shell: () => SHELL_APPLIES,
  surface: (host) => INSTALL_HOSTS[host].appliesAfterInstall,
};

/**
 * When an install takes effect: from a shell, at the next start or on `/reload-plugins`, whatever
 * the host; from the host's own surface, as that surface says (VS Code "apply[ies] to open
 * sessions without a restart"); `undefined` where the docs say nothing.
 */
export function planPluginApply(
  host: InstallHost,
  origin: ApplyOrigin,
): readonly ApplyMoment[] | undefined {
  return APPLIES[origin](host);
}

export interface MarketplaceAdd {
  readonly name: string;
  readonly source: string;
}

export const OFFICIAL_MARKETPLACE_ADD: MarketplaceAdd = {
  name: 'claude-plugins-official',
  source: 'anthropics/claude-plugins-official',
};

/**
 * The marketplaces Claude Code adds on its own at start: "Claude Code adds Anthropic's official
 * marketplace for you the first time you start an interactive terminal session". Nothing is added
 * by any other start (a shell command, `claude -p`, another surface) or once it is registered.
 */
export function marketplacesAddedAtStart(input: {
  readonly host: InstallHost;
  /** No interactive terminal session has run on this machine yet. */
  readonly firstInteractiveStart: boolean;
  readonly registered: readonly string[];
}): readonly MarketplaceAdd[] {
  const adds =
    INSTALL_HOSTS[input.host].startsTerminalSession &&
    input.firstInteractiveStart &&
    !input.registered.includes(OFFICIAL_MARKETPLACE_ADD.name);
  return adds ? [OFFICIAL_MARKETPLACE_ADD] : [];
}
