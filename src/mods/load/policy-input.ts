import type { Settings, UserConfigValue } from '../../protocol/official.ts';
import type { ConfiguredServer } from '../../settings/managed/index.ts';
import {
  GUARD_CONFIG_ID,
  MOD_SETTINGS,
  type ModSettingName,
  type SettingHome,
} from '../../protocol/mods-settings.ts';

/**
 * What the load policy reads (plugins/mods/reference.md, "Settings and environment variables";
 * plugins/mods/admin.md). The host reads its settings files and hands the keys over as plain data;
 * the kit decides what each key means, reading a name only from the homes `MOD_SETTINGS` gives it.
 */

/**
 * The keys of one settings file that affect mods, as the SDK types them. `env` of the file counts only
 * in the user's, for `CLAUDE_CODE_PLUGIN_DIRS`; `pluginConfigs` maps a plugin id to `{ options }`.
 */
export type ModsSettingsFile = Readonly<
  Pick<
    Settings,
    | 'allowManagedHooksOnly'
    | 'disableAllHooks'
    | 'disableSideloadFlags'
    | 'prependPlugins'
    | 'appendPlugins'
    | 'pluginConfigs'
    | 'env'
  >
>;

/** How the session signed in (admin.md, "Know what happens by default"). */
export type Credential = 'api-key' | 'team-or-enterprise-login' | 'oauth-token' | 'none';

export interface ModsPolicyInput {
  /** Managed settings, when the machine has them. */
  readonly managed?: ModsSettingsFile;
  /** Managed settings exist and the guard cannot read them: it refuses every user's mod ("The guard fails closed"). */
  readonly managedUnreadable?: boolean;
  readonly user: ModsSettingsFile;
  readonly credential: Credential;
  /** The process environment. */
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly platform: 'posix' | 'windows';
  /** The session is a cloud session (Claude Code on the web): `disableSideloadFlags` drops its `--mcp-config` servers instead of exiting. */
  readonly cloud?: boolean;
  readonly flags: {
    readonly pluginDirs: readonly string[];
    /** `--plugin-url` archives: `disableSideloadFlags` rejects them at startup as it does `--plugin-dir`. */
    readonly pluginUrls?: readonly string[];
    /** `--agents` was given: `disableSideloadFlags` rejects it at startup too. */
    readonly agents?: boolean;
    /** The servers of `--mcp-config`, when the flag was given. */
    readonly mcpServers?: readonly ConfiguredServer[];
    readonly bare?: boolean;
    readonly safeMode?: boolean;
  };
  /**
   * Whether the user answered the trust prompt for the directory (admin.md, "Know which controls still
   * apply": "no mod loads until they answer the trust prompt"). Absent means trusted: a session with
   * no prompt, such as `claude -p`.
   */
  readonly isTrusted?: boolean;
  /**
   * The rollout switch for installed mods (troubleshoot.md, "Check whether mods can load"): `served-off`
   * when Anthropic turned them off remotely, `saved-off` when an earlier session saved that value.
   */
  readonly rollout?: 'served-off' | 'saved-off';
}

/** Whether the machine has managed settings, or the session signed in with a Team or Enterprise `/login`: where the guard loads. */
export const isManagedContext = (policy: ModsPolicyInput): boolean =>
  policy.managed !== undefined || policy.credential === 'team-or-enterprise-login';

/** The files whose value of `name` counts, from `MOD_SETTINGS`: managed first, then the user's when the table lets it. */
function filesFor(policy: ModsPolicyInput, name: ModSettingName): readonly ModsSettingsFile[] {
  const setting: { readonly homes: readonly SettingHome[]; readonly userOnlyWithoutPolicy?: true } =
    MOD_SETTINGS[name];
  const files: ModsSettingsFile[] = [];
  if (policy.managed && (setting.homes.includes('managed') || setting.homes.includes('any-file'))) {
    files.push(policy.managed);
  }
  const userCounts = setting.homes.includes('user') || setting.homes.includes('any-file');
  const allowed = setting.userOnlyWithoutPolicy === undefined || !isManagedContext(policy);
  if (userCounts && allowed) files.push(policy.user);
  return files;
}

export interface PluginList {
  readonly ids: readonly string[];
  /** True when the list is from managed settings: only then does it name organization mods. */
  readonly isManaged: boolean;
}

/** A list setting (`prependPlugins`, `appendPlugins`): managed settings win; the user's counts only where the table says. */
export function listSetting(
  policy: ModsPolicyInput,
  name: 'prependPlugins' | 'appendPlugins',
): PluginList | undefined {
  for (const file of filesFor(policy, name)) {
    const ids = file[name];
    if (ids !== undefined) return { ids, isManaged: file === policy.managed };
  }
  return undefined;
}

/** Whether a flag setting is on in managed settings, and in any other file, apart: `disableAllHooks` reaches differently by file. */
export function flagSetting(
  policy: ModsSettingsFile | undefined,
  name: 'allowManagedHooksOnly' | 'disableAllHooks' | 'disableSideloadFlags',
): boolean {
  return policy?.[name] === true;
}

const isOptionValue = (value: unknown): value is UserConfigValue =>
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean' ||
  (Array.isArray(value) && value.every((item) => typeof item === 'string'));

const isOptions = (value: unknown): value is Readonly<Record<string, UserConfigValue>> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value).every(isOptionValue);

/**
 * The `options` a settings file holds for plugin `id` (`pluginConfigs[id].options`), or `undefined`.
 * The SDK types an entry as `{ mcpServers, options }` or an open record, so the value is checked.
 */
export function pluginOptions(
  file: ModsSettingsFile | undefined,
  id: string,
): Readonly<Record<string, UserConfigValue>> | undefined {
  const entry = file?.pluginConfigs?.[id];
  const options: unknown = entry === undefined ? undefined : Reflect.get(entry, 'options');
  return isOptions(options) ? options : undefined;
}

/** The guard's options: only managed settings, under `cc-plugin-sec-default@builtin` ("Only managed settings count"). */
export function guardOption(
  policy: ModsPolicyInput,
  name: 'allowManagedModsOnly' | 'allowModsToOverrideDenyRules',
): boolean {
  return pluginOptions(policy.managed, GUARD_CONFIG_ID)?.[name] === true;
}
