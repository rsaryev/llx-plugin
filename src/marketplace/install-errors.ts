import { collaboratorInstallCommand, installCommand, type InstallScope } from './install-scopes.ts';
import type { ErrorsTabEntry } from './install-messages.ts';
import type { MarketplaceSource } from '../format/marketplace/types.ts';

/**
 * What an install says when it stops, and what the Errors tab of `/plugin` shows when a plugin or
 * its marketplace cannot be found, read or trusted (plugins/troubleshooting.md, "Install a plugin",
 * "Plugin installed but not working"; plugins/loading.md, "Check which stage a plugin reached",
 * "Find where a plugin is enabled"). Pure texts; a text the docs quote is quoted verbatim, and the
 * joins the docs do not show are rows in spec/judgments.md.
 */

// ---- not found ----

export interface PluginNotFound {
  readonly message: string;
  /** Present when the catalog may be stale or could not be refreshed. */
  readonly hint?: string;
}

/**
 * `Plugin "<name>" not found in marketplace "<marketplace>"`, with a hint when Claude Code did not
 * refresh the marketplace before the lookup: `Your local copy may be out of date — try claude
 * plugin marketplace update <marketplace>`, or `The marketplace couldn't be refreshed (...)` when
 * it tried and failed; with no hint the name is the likeliest problem. The message and the hint
 * are separate values, as the docs print them as two statements.
 */
export function pluginNotFound(
  plugin: string,
  marketplace: string,
  refresh: { readonly done: boolean; readonly failure?: string },
): PluginNotFound {
  const message = `Plugin "${plugin}" not found in marketplace "${marketplace}"`;
  if (refresh.done) return { message };
  const hint =
    refresh.failure === undefined
      ? `Your local copy may be out of date — try claude plugin marketplace update ${marketplace}`
      : `The marketplace couldn't be refreshed (${refresh.failure})`;
  return { message, hint };
}

/** Where an install was typed: `/plugin install` in a session, or `claude plugin install` in a shell. */
export type InstallSurface = 'session' | 'shell';

const NOT_ANY: { readonly [S in InstallSurface]: (name: string) => string } = {
  session: (name) => `Plugin "${name}" not found in any marketplace`,
  shell: (name) => `Plugin "${name}" not found in any configured marketplace`,
};

/** `Plugin "<name>" not found in any marketplace` in a session; `claude plugin install` says `any configured marketplace`. */
export const pluginNotFoundAnywhere = (name: string, surface: InstallSurface): string =>
  NOT_ANY[surface](name);

/** The fix for the lookup that found nothing: name the marketplace, so Claude Code refreshes it first. */
export const nameTheMarketplace = (name: string): string => `/plugin install ${name}@<marketplace>`;

// ---- already installed ----

/** A plugin installed at user scope or by managed settings is "already installed globally". */
export const isInstalledGlobally = (scopes: readonly InstallScope[]): boolean =>
  scopes.some((scope) => GLOBAL[scope]);

const GLOBAL: { readonly [S in InstallScope]: boolean } = {
  user: true,
  managed: true,
  project: false,
  local: false,
};

/**
 * `/plugin install` refuses a plugin already installed globally: `Plugin '<name>@<marketplace>' is
 * already installed globally. Use '/plugin' to manage existing plugins.`; typed without
 * `@<marketplace>`, the message omits `globally`.
 */
export const alreadyInstalledGlobally = (plugin: string, withMarketplace: boolean): string =>
  `Plugin '${plugin}' is already installed${withMarketplace ? ' globally' : ''}. Use '/plugin' to manage existing plugins.`;

/** What `claude plugin install` prints for a plugin already installed at the target scope (exit 0). */
export const alreadyInstalledAtScope = (id: string, scope: InstallScope): string =>
  `Plugin "${id}" is already installed (scope: ${scope})`;

// ---- one summary of failures ----

export interface InstallFailure {
  readonly plugin: string;
  readonly reason: string;
}

const FULL_ERROR = 'Installing a plugin from its details (Enter) in /plugin shows its full error.';

/**
 * The summary the `/plugin` menu closes with when none of the selected plugins installed: `Failed
 * to install: <plugin> (<reason>)`. A reason shows only its first line, and when one was
 * shortened the summary ends with `Installing a plugin from its details (Enter) in /plugin shows
 * its full error.` Judgment: several failures are joined by `, `.
 */
export function failedToInstall(failures: readonly InstallFailure[]): string {
  const firstLines = failures.map((one) => ({
    plugin: one.plugin,
    reason: one.reason.split('\n')[0] ?? '',
    shortened: one.reason.includes('\n'),
  }));
  const summary = `Failed to install: ${firstLines.map((one) => `${one.plugin} (${one.reason})`).join(', ')}`;
  return firstLines.some((one) => one.shortened) ? `${summary} ${FULL_ERROR}` : summary;
}

// ---- reload pending ----

/** The line an install summary ends with when the plugin is not yet active. */
export const RELOAD_TO_APPLY = 'Run /reload-plugins to apply.';
export const PLUGIN_ACTIVE = 'Plugin is now active.';
/** The notice above the prompt that can appear at the same time. */
export const PLUGINS_CHANGED = 'Plugins changed. Run /reload-plugins to activate.';

export interface InstallActivationFacts {
  /** Activating the plugin now would invalidate the prompt cache. */
  readonly invalidatesPromptCache: boolean;
  /** The attempt to activate the plugin during the install failed. */
  readonly activationFailed: boolean;
}

/**
 * Whether an install activated the plugin, and the line its summary ends with: `Plugin is now
 * active.` when it did, else `Run /reload-plugins to apply.` "Claude Code didn't activate the
 * plugin during the install, either because activating it would invalidate the prompt cache or
 * because the activation attempt failed" (troubleshooting.md).
 */
export function installActivation(facts: InstallActivationFacts): {
  readonly activated: boolean;
  readonly ending: string;
} {
  const activated = !facts.invalidatesPromptCache && !facts.activationFailed;
  return { activated, ending: activated ? PLUGIN_ACTIVE : RELOAD_TO_APPLY };
}

// ---- Errors tab entries ----

/** `Plugin "<name>" not cached at <path>`: the install record points at a directory that is gone. */
export const notCached = (name: string, path: string): ErrorsTabEntry => ({
  message: `Plugin "${name}" not cached at ${path}`,
  guidance: 'Run /plugin to refresh the plugin cache',
});

/** The shell command that re-downloads a plugin whose record exists but whose directory is missing. */
export const reinstallCommand = (name: string, marketplace: string): string =>
  installCommand(`${name}@${marketplace}`);

/** A project's settings enable the plugin, but it was never installed on this machine. */
export const enabledNotInstalled = (name: string, marketplace: string): ErrorsTabEntry => ({
  message: `Plugin "${name}" is enabled in project settings but isn't installed here`,
  guidance: `Run ${collaboratorInstallCommand(`${name}@${marketplace}`)} to install it for this project`,
});

/** An enabled plugin its marketplace lists by relative path, with no directory at that path. */
export const pluginDirectoryNotFound = (path: string): string =>
  `Plugin directory not found at path: ${path}`;

/** The marketplace's own directory is missing, such as a local marketplace that moved. */
export const marketplaceDirectoryNotFound = (path: string): string =>
  `Marketplace directory not found at path: ${path}`;

/** A plugin hook's failure when the directory the session loaded its hooks from is gone. */
export const pluginDirectoryMissingAtRun = (path: string, plugin: string): string =>
  `Failed to run: Plugin directory does not exist: ${path} (${plugin} — run /plugin to reinstall)`;

// ---- empty ----

/** Where the empty list shows: the **Discover** tab, or `claude plugin marketplace list`. */
export type EmptyView = 'discover' | 'marketplace-list';

const EMPTY: { readonly [V in EmptyView]: string } = {
  discover: 'No plugins available',
  'marketplace-list': 'No marketplaces configured',
};

/** What the fix is when no marketplace is registered: add the official one. */
const ADD_OFFICIAL = '/plugin marketplace add anthropics/claude-plugins-official';

/**
 * `No plugins available` on the Discover tab, `No marketplaces configured` from the list command:
 * both mean no marketplace is registered, so there is no catalog; `undefined` when one is.
 */
export function noMarketplaces(
  registered: readonly string[],
  view: EmptyView,
): ErrorsTabEntry | undefined {
  return registered.length > 0 ? undefined : { message: EMPTY[view], guidance: ADD_OFFICIAL };
}

// ---- a different source ----

const refSuffix = (source: { readonly ref?: string }): string =>
  source.ref === undefined ? '' : `#${source.ref}`;

/** One reading of a source per shape its fields give; the first that applies names it. */
const DESCRIBERS: readonly ((source: MarketplaceSource) => string | undefined)[] = [
  (source) => ('repo' in source ? `github:${source.repo}${refSuffix(source)}` : undefined),
  (source) => ('package' in source ? `npm:${source.package}` : undefined),
  (source) =>
    'url' in source && 'path' in source ? `git:${source.url}${refSuffix(source)}` : undefined,
  (source) => ('hostPattern' in source ? source.hostPattern : undefined),
  (source) => ('pathPattern' in source ? source.pathPattern : undefined),
  (source) => ('path' in source ? source.path : undefined),
  (source) => ('plugins' in source ? `settings:${source.name}` : undefined),
  (source) => ('url' in source ? source.url : undefined),
];

/**
 * A source as the "already added from a different source" message writes it: `github:acme/plugins`
 * for GitHub (the docs' example). Judgment (spec/judgments.md): the other kinds are written the
 * same way, `git:<url>`, `npm:<package>`, `settings:<name>`, and a URL or a path as it is.
 */
export const describeSource = (source: MarketplaceSource): string =>
  DESCRIBERS.map((describe) => describe(source)).find((text) => text !== undefined) ?? 'skills-dir';

/**
 * `Marketplace "<name>" is already added from a different source (<source>). To use this source
 * instead, remove that marketplace first with /plugin marketplace remove <name>.`
 */
export const alreadyAddedFromDifferentSource = (
  name: string,
  existing: MarketplaceSource,
): string =>
  `Marketplace "${name}" is already added from a different source (${describeSource(existing)}). To use this source instead, remove that marketplace first with /plugin marketplace remove ${name}.`;

/**
 * "The failure is shown once per session for each hook event and command" (troubleshooting.md,
 * "Plugin directory does not exist"): the returned function says whether this event and command
 * have not failed yet this session, and remembers that they have.
 */
export function failureOnce(): (event: string, command: string) => boolean {
  const seen = new Set<string>();
  return (event, command) => {
    const key = JSON.stringify([event, command]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  };
}
