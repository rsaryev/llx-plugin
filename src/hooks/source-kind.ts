import type { HookSource, HookSourceKind } from './contracts.ts';

/** What a kind of declaration site decides about its handlers, wherever the hooks read it. */
export interface SourcePolicy {
  /** A plugin's hooks file. */
  readonly plugin: boolean;
  /**
   * hooks.md, "Hook handler fields": "If you define the same handler in more than one settings
   * file, it runs once. A plugin's or skill's copy of the same handler stays separate."
   */
  readonly mergesCopies: boolean;
  /**
   * hooks.md, "Common fields": `once` is "Only honored for hooks declared in skill frontmatter;
   * ignored in settings files and agent frontmatter" (and so in a plugin's hooks file).
   */
  readonly honorsOnce: boolean;
  /**
   * `SessionEnd`: "your settings files" raise the budget, "plugin-provided hooks" do not (the
   * other kinds: judgment, spec/judgments.md).
   */
  readonly raisesSessionEndBudget: boolean;
  /**
   * A session registered it after it opened (a skill's, an agent's, the host's run): an update
   * keeps it, while the plugin and settings handlers are rebuilt from the new state.
   */
  readonly scoped: boolean;
}

/** One row per kind: a registry over the union, so a new kind is a compile error here. */
export const SOURCE_POLICY: { readonly [K in HookSourceKind]: SourcePolicy } = {
  plugin: {
    plugin: true,
    mergesCopies: false,
    honorsOnce: false,
    raisesSessionEndBudget: false,
    scoped: false,
  },
  settings: {
    plugin: false,
    mergesCopies: true,
    honorsOnce: false,
    raisesSessionEndBudget: true,
    scoped: false,
  },
  skill: {
    plugin: false,
    mergesCopies: false,
    honorsOnce: true,
    raisesSessionEndBudget: false,
    scoped: true,
  },
  agent: {
    plugin: false,
    mergesCopies: false,
    honorsOnce: false,
    raisesSessionEndBudget: false,
    scoped: true,
  },
  session: {
    plugin: false,
    mergesCopies: false,
    honorsOnce: false,
    raisesSessionEndBudget: false,
    scoped: true,
  },
};

export const isPluginSource = (source: HookSource): boolean => SOURCE_POLICY[source.kind].plugin;

/**
 * The name a plugin hook's notices give its plugin: the manifest name, else the plugin id. One
 * rule for the block error ("This hook comes from the <plugin> plugin.") and the missing
 * directory notice.
 */
export const pluginLabel = (entry: {
  readonly pluginId?: string | undefined;
  readonly source: HookSource;
}): string | undefined => entry.source.pluginName ?? entry.pluginId;
