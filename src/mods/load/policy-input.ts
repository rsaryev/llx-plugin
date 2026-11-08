import type { JsonObject } from '../../foundation/index.ts';
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

/** The keys of one settings file that affect mods. */
export interface ModsSettingsFile {
  readonly allowManagedHooksOnly?: boolean;
  readonly disableAllHooks?: boolean;
  readonly disableSideloadFlags?: boolean;
  readonly prependPlugins?: readonly string[];
  readonly appendPlugins?: readonly string[];
  /** `pluginConfigs`: plugin id to `{ options }`. */
  readonly pluginConfigs?: Readonly<Record<string, { readonly options?: JsonObject }>>;
  /** `env` of the file: only the user's counts, for `CLAUDE_CODE_PLUGIN_DIRS`. */
  readonly env?: Readonly<Record<string, string>>;
}

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
  readonly flags: {
    readonly pluginDirs: readonly string[];
    readonly bare?: boolean;
    readonly safeMode?: boolean;
  };
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

/** The guard's options: only managed settings, under `cc-plugin-sec-default@builtin` ("Only managed settings count"). */
export function guardOption(
  policy: ModsPolicyInput,
  name: 'allowManagedModsOnly' | 'allowModsToOverrideDenyRules',
): boolean {
  return policy.managed?.pluginConfigs?.[GUARD_CONFIG_ID]?.options?.[name] === true;
}
