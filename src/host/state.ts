import type { PluginIssue } from '../format/issues.ts';
import type { ResolvedUserConfig } from '../loading/index.ts';
import { enabledPlugin, pluginConfig } from '../settings/plugins/index.ts';
import type { ParentSettingsContext } from '../settings/managed/index.ts';
import { createPolicyView, type PolicyView } from '../settings/index.ts';
import {
  createCustomizationPolicy,
  type CustomizationPolicy,
} from '../settings/customization/index.ts';

import { bundleSettingKey } from '../format/mcpb-manifest.ts';
import type { OptionValues } from '../settings/plugins/index.ts';
import type { Locations } from '../ports/index.ts';
import { readCatalog, type PluginCatalog } from './catalog.ts';
import { withDependencies } from './plugin-dependencies.ts';
import { distinctPlugins, layeredPlugins, withNameConflicts } from './plugin-set.ts';
import type { HostedPlugin, HostPlugin, HostUpdate, PluginHostOptions } from './types.ts';
import { hookSessionGates, type HookSessionGates } from '../settings/hooks/session-gates.ts';

/** A plugin the host runs: what its components read to, and the options saved for it. */
export interface ActivePlugin extends HostPlugin {
  readonly catalog: PluginCatalog;
  readonly userConfig: ResolvedUserConfig;
}

/** What every session of a host shares: the state of one generation of the host; `update` makes the next. */
export interface HostState {
  readonly options: PluginHostOptions;
  readonly view: PolicyView;
  /** How parent settings are treated: the host's, else no administrator and no merge. */
  readonly parent: ParentSettingsContext;
  /** `strictPluginOnlyCustomization` over `view` and `parent`, read once for this generation. */
  readonly customization: CustomizationPolicy;
  /** The hook gates over `view` and `parent`, read once for this generation. */
  readonly gates: HookSessionGates;
  /** Every plugin the host was given, with whether it runs. */
  readonly all: readonly HostedPlugin[];
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
  const decision = enabledPlugin(view, entry.id, entry.plugin.manifest?.defaultEnabled);
  return decision.blockedByManaged ? false : (entry.enabled ?? decision.on);
}

/** `pluginConfigs.<id>.mcpServers` as values under `<server>.<key>`, the form a bundled server reads. */
const serverValues = (servers: Readonly<Record<string, OptionValues>>): OptionValues =>
  Object.fromEntries(
    Object.entries(servers).flatMap(([server, values]) =>
      Object.entries(values).map(([key, value]) => [bundleSettingKey(server, key), value]),
    ),
  );

/**
 * The saved options of a plugin: those of `pluginConfigs` in the settings (a bundled server's under
 * `<server>.<key>`), then the host's own values over them (the host keeps the secure store;
 * docs/API.md, "Variable substitution").
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
      values: {
        ...serverValues(saved.mcpServers),
        ...saved.options,
        ...options.userConfig?.[entry.id],
      },
    },
    issues: saved.issues,
  };
}

export function createHostState(options: PluginHostOptions): HostState {
  const view = options.settings ?? NO_SETTINGS;
  const distinct = distinctPlugins(options.plugins);
  const named = withNameConflicts(
    view,
    distinct.kept.map((entry) => ({ entry, enabled: runs(view, entry) })),
  );
  const needed = withDependencies(named.runs);
  const states = needed.runs;
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
  const parent = options.parentSettings ?? { hasManagedSettings: false, parentMerge: false };
  return {
    options,
    view,
    parent,
    customization: createCustomizationPolicy(view, parent),
    gates: hookSessionGates(view, parent),
    all: states.map(({ entry, enabled }) => ({
      id: entry.id,
      name: entry.plugin.name,
      enabled,
    })),
    active: active.map((each) => each.active),
    issues: [
      ...distinct.issues,
      ...named.issues,
      ...needed.issues,
      ...active.flatMap((each) => each.issues),
    ],
  };
}

/**
 * The options after an update: each part the update gives replaces the host's, a part left out or
 * given as `undefined` stays (as in `applyTurn`: an update replaces, it cannot unset). Pure.
 */
export function mergeHostOptions(base: PluginHostOptions, update: HostUpdate): PluginHostOptions {
  const settings = update.settings ?? base.settings;
  const parentSettings = update.parentSettings ?? base.parentSettings;
  const userConfig = update.userConfig ?? base.userConfig;
  return {
    ...base,
    plugins: update.plugins ?? base.plugins,
    ...(settings === undefined ? {} : { settings }),
    ...(parentSettings === undefined ? {} : { parentSettings }),
    ...(userConfig === undefined ? {} : { userConfig }),
  };
}

/** What a session reads its state from, at each use. */
export interface HostStateSource {
  current(): HostState;
}

/**
 * The state the host's sessions read, replaced by `host.update`. A session never holds a state
 * past one use: it asks the cell, so an update reaches every session that is open.
 */
export interface HostStateCell extends HostStateSource {
  set(next: HostState): void;
}

/** What a session brings of its own: settings, plugins, saved values and locations (`SessionOptions`). */
export interface SessionOwn {
  readonly settings?: PolicyView | undefined;
  readonly plugins?: readonly HostPlugin[] | undefined;
  readonly userConfig?: PluginHostOptions['userConfig'] | undefined;
  readonly locations?: Locations | undefined;
}

/**
 * The host's options with what the session brings in place of the host's, its plugins over the host's.
 * The session's locations replace the host's port, so every part of the session that reads
 * `options.ports.locations` (hooks, skills, agents, servers, monitors, folders) reads the session's.
 */
const sessionOptionsOf = (host: PluginHostOptions, own: SessionOwn): PluginHostOptions => {
  const settings = own.settings ?? host.settings;
  const userConfig = own.userConfig ?? host.userConfig;
  return {
    ...host,
    ports: { ...host.ports, locations: own.locations ?? host.ports.locations },
    plugins: layeredPlugins(host.plugins, own.plugins),
    ...(settings === undefined ? {} : { settings }),
    ...(userConfig === undefined ? {} : { userConfig }),
  };
};

/** Whether the session brings anything of its own, so its state is not the host's. */
const bringsOwn = (own: SessionOwn): boolean =>
  [own.settings, own.plugins, own.userConfig, own.locations].some((part) => part !== undefined);

/**
 * A session's state: the host's, or, for a session with its own settings, plugins, saved values or
 * locations, the host's options with those in place (`SessionOptions`). Made again only when the
 * host's state changes, so a view that compares states sees one per host generation.
 */
export function sessionStateSource(cell: HostStateSource, own: SessionOwn): HostStateSource {
  if (!bringsOwn(own)) return cell;
  let from: HostState | undefined;
  let made: HostState | undefined;
  return {
    current: () => {
      const host = cell.current();
      if (made === undefined || from !== host) {
        made = createHostState(sessionOptionsOf(host.options, own));
        from = host;
      }
      return made;
    },
  };
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
