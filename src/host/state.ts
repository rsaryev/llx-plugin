import type { PluginIssue } from '../format/issues.ts';
import type { ResolvedUserConfig } from '../loading/index.ts';
import { enabledPlugin, pluginConfig } from '../settings/plugins/index.ts';
import type { ParentSettingsContext } from '../settings/hooks/index.ts';
import { createPolicyView, type PolicyView } from '../settings/index.ts';
import { readCatalog, type PluginCatalog } from './catalog.ts';
import type { HostPlugin, HostUpdate, PluginHostOptions } from './types.ts';

/** A plugin the host runs: what its components read to, and the options saved for it. */
export interface ActivePlugin extends HostPlugin {
  readonly catalog: PluginCatalog;
  readonly userConfig: ResolvedUserConfig;
}

/** What every session of a host shares, decided once when the host is made. */
export interface HostState {
  readonly options: PluginHostOptions;
  readonly view: PolicyView;
  /** How parent settings are treated: the host's, else no administrator and no merge. */
  readonly parent: ParentSettingsContext;
  /** Every plugin the host was given, with whether it runs. */
  readonly all: readonly {
    readonly id: string;
    readonly name: string;
    readonly enabled: boolean;
  }[];
  /** The plugins that run, in the order given. */
  readonly active: readonly ActivePlugin[];
  readonly issues: readonly PluginIssue[];
}

const NO_SETTINGS = createPolicyView([]);

/**
 * Whether the host runs the plugin: the value the host gave, else what `enabledPlugins` says;
 * managed settings that turn it off win over both (settings-reference.md, `enabledPlugins`).
 */
function runs(view: PolicyView, entry: HostPlugin): boolean {
  const decision = enabledPlugin(view, entry.id);
  return decision.blockedByManaged ? false : (entry.enabled ?? decision.on);
}

/**
 * The saved options of a plugin: those of `pluginConfigs` in the settings, then the host's own
 * values over them (the host keeps the secure store; docs/API.md, "Variable substitution").
 */
function userConfigOf(
  view: PolicyView,
  options: PluginHostOptions,
  entry: HostPlugin,
): { readonly config: ResolvedUserConfig; readonly issues: readonly PluginIssue[] } {
  const saved = pluginConfig(view, entry.id);
  return {
    config: {
      declared: entry.plugin.userConfig,
      values: { ...saved.options, ...options.userConfig?.[entry.id] },
    },
    issues: saved.issues,
  };
}

export function createHostState(options: PluginHostOptions): HostState {
  const view = options.settings ?? NO_SETTINGS;
  const states = options.plugins.map((entry) => ({ entry, enabled: runs(view, entry) }));
  const active = states.flatMap(({ entry, enabled }) => {
    if (!enabled) return [];
    const config = userConfigOf(view, options, entry);
    const catalog = readCatalog(entry.plugin);
    return [
      {
        active: { ...entry, catalog, userConfig: config.config },
        issues: [...catalog.issues, ...config.issues],
      },
    ];
  });
  return {
    options,
    view,
    parent: options.parentSettings ?? { hasManagedSettings: false, parentMerge: false },
    all: states.map(({ entry, enabled }) => ({
      id: entry.id,
      name: entry.plugin.name,
      enabled,
    })),
    active: active.map((each) => each.active),
    issues: active.flatMap((each) => each.issues),
  };
}

const UPDATE_KEYS = ['plugins', 'settings', 'parentSettings', 'userConfig'] as const;

/**
 * The options after an update: each part the update gives replaces the host's, a part left out or
 * given as `undefined` stays (as in `applyTurn`: an update replaces, it cannot unset). Pure.
 */
export function mergeHostOptions(base: PluginHostOptions, update: HostUpdate): PluginHostOptions {
  const given = UPDATE_KEYS.filter((key) => update[key] !== undefined);
  return { ...base, ...Object.fromEntries(given.map((key) => [key, update[key]])) };
}

/**
 * The state the host's sessions read, replaced by `host.update`. A session never holds a state
 * past one use: it asks the cell, so an update reaches every session that is open.
 */
export interface HostStateCell {
  current(): HostState;
  set(next: HostState): void;
}

export function createStateCell(initial: HostState): HostStateCell {
  let state = initial;
  return {
    current: () => state,
    set: (next) => {
      state = next;
    },
  };
}
