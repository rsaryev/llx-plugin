import type { PluginId } from '../plugins/plugin-id.ts';

/**
 * Where a hook comes from, as a host reports it. What `allowManagedHooksOnly`, `disableAllHooks` and
 * the `hooks` surface of `strictPluginOnlyCustomization` stop is a property of the origin
 * (settings-reference.md, `disableAllHooks` "The reach depends on which file carries the key" and
 * "What runs under `allowManagedHooksOnly`"), so the host names the origin and the policy answers.
 */

/** A plugin that ships hooks, with the facts the locks look at. */
export interface PluginHookSource {
  /** `plugin@marketplace`, matched whole against the plugins managed settings force-enable. */
  readonly id: PluginId;
  /** A folder the user keeps under `skills/`: user customization to `strictPluginOnlyCustomization`. */
  readonly skillsDirPlugin: boolean;
  /** A plugin whose directory a marketplace-declared command produces. */
  readonly commandSource: boolean;
  /** A plugin whose code registers hooks. */
  readonly isMod: boolean;
  /** A mod that counts as the organization's (plugins/mods/admin.md, "Install your organization's mods"). */
  readonly isOrgMod: boolean;
}

/** Where `settings` hooks are read from: the `--settings` file and the SDK `settings` option count as the user's own. */
export type SettingsHookScope = 'user' | 'project' | 'local' | 'flag' | 'sdkSettingsOption';

/** What declares frontmatter hooks (hooks.md, "Hooks in skills and agents"). */
export type HookFrontmatterOwner = 'skill' | 'command' | 'agent';

/** The sources a skill, command or agent can come from. */
export type HookFrontmatterSource =
  | 'user'
  | 'project'
  | 'addDir'
  | 'synced'
  | 'managed'
  | 'bundled';

/** One frontmatter origin per source, so a registry can be typed over `from`. */
type PlainFrontmatter = {
  readonly [F in HookFrontmatterSource]: {
    readonly kind: 'frontmatter';
    readonly owner: HookFrontmatterOwner;
    readonly from: F;
  };
}[HookFrontmatterSource];

export type PolicyHookSource =
  | { readonly kind: 'managedSettings' }
  | { readonly kind: 'sdkCallback' }
  | { readonly kind: 'settings'; readonly scope: SettingsHookScope }
  | ({ readonly kind: 'plugin' } & PluginHookSource)
  | PlainFrontmatter
  | {
      readonly kind: 'frontmatter';
      readonly owner: HookFrontmatterOwner;
      readonly from: 'plugin';
      readonly plugin: PluginHookSource;
    };

/** Why a hook does not run. */
export const HOOK_BLOCK_REASONS = [
  'commandSourceDisabled',
  'disableAllHooks',
  'allowManagedHooksOnly',
  'strictPluginOnlyCustomization.hooks',
] as const;
export type HookBlockReason = (typeof HOOK_BLOCK_REASONS)[number];

export type HookVerdict =
  | { readonly run: true }
  | { readonly run: false; readonly reason: HookBlockReason };

/** Which of the locks stops a hook of one origin. */
export interface Stops {
  /** `disableAllHooks` in managed settings. */
  readonly managedDisable: boolean;
  /** `disableAllHooks` in any other file, or in the SDK's `managedSettings`. */
  readonly otherDisable: boolean;
  /** `allowManagedHooksOnly`. */
  readonly managedOnly: boolean;
  /** The `hooks` surface of `strictPluginOnlyCustomization`. */
  readonly pluginOnly: boolean;
  /** `disableCommandPluginSources`, or `allowManagedHooksOnly` standing in for it. */
  readonly commandSource: boolean;
}

export type ForceEnabled = (id: string) => boolean;
