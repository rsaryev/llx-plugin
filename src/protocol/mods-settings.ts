/**
 * The settings and environment variables that affect mods, and where each is read from
 * (plugins/mods/reference.md, "Settings and environment variables", "Where"). Pure data: what a
 * setting does is the code of `mods/load/policy` and its neighbours, which read a name only from
 * the homes this table gives it.
 */

/**
 * Where a name is read: the process `environment`, the `env` of the user's settings
 * (`user-env`), `managed` settings, the user's own settings (`user`), any settings file
 * (`any-file`), or `guard-option`, an entry under `pluginConfigs` for the built-in guard that only
 * managed settings can set.
 */
export const SETTING_HOMES = [
  'environment',
  'user-env',
  'managed',
  'user',
  'any-file',
  'guard-option',
] as const;
export type SettingHome = (typeof SETTING_HOMES)[number];

export interface ModSetting {
  readonly homes: readonly SettingHome[];
  /**
   * True when the user's own settings count only on a machine with no managed settings, in a
   * session whose credential is not a Team or Enterprise `/login` ("Where": "User settings only on a
   * machine with no managed settings, in a session whose credential isn't a Team or Enterprise
   * `/login`").
   */
  readonly userOnlyWithoutPolicy?: true;
}

export const MOD_SETTINGS = {
  CLAUDE_CODE_PLUGIN_DIRS: { homes: ['environment', 'user-env'] },
  CLAUDE_CODE_PLUGIN_DIR_WATCH: { homes: ['environment'] },
  prependPlugins: { homes: ['managed', 'user'], userOnlyWithoutPolicy: true },
  appendPlugins: { homes: ['managed', 'user'], userOnlyWithoutPolicy: true },
  allowManagedModsOnly: { homes: ['guard-option'] },
  allowModsToOverrideDenyRules: { homes: ['guard-option'] },
  allowManagedHooksOnly: { homes: ['managed'] },
  disableAllHooks: { homes: ['any-file'] },
  disableSideloadFlags: { homes: ['managed'] },
  pluginConfigs: { homes: ['user', 'managed'] },
} as const satisfies Readonly<Record<string, ModSetting>>;

export type ModSettingName = keyof typeof MOD_SETTINGS;

/** The built-in guard's id in `pluginConfigs` (the only form there) and, as `prependPlugins` also accepts, its short id. */
export const GUARD_CONFIG_ID = 'cc-plugin-sec-default@builtin';
export const GUARD_ID = 'sec-default@builtin';
/** What `/plugin` and the debug log call the guard. */
export const GUARD_NAME = 'cc-plugin-sec-default';
