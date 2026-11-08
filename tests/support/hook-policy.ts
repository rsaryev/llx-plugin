/** Helpers for the hook-policy tests: a hook policy over sources of settings, and the origins a host reports. */
import {
  createHookPolicy,
  type HookLocks,
  type PolicyHookSource,
  type HookPolicy,
  type HookPolicyContext,
  type PluginHookSource,
} from '../../src/settings/hooks/index.ts';
import { viewOf, type Source } from './plugin-settings.ts';

/** A machine with no administrator, a trusted folder and no pluginOnly lock on hooks. */
const plainMachine: HookPolicyContext = {
  hasManagedSettings: false,
  parentMerge: false,
  folderTrusted: true,
  safeMode: false,
};

export interface Machine {
  readonly locks?: HookLocks;
  readonly context?: Partial<HookPolicyContext>;
}

/** The policy the kit makes of the sources, in the order given. */
export const hookPolicyOf = (sources: readonly Source[], machine: Machine = {}): HookPolicy =>
  createHookPolicy(viewOf(...sources), machine.locks ?? { hooks: false }, {
    ...plainMachine,
    ...machine.context,
  });

/** Settings of a source that only carry what a test names. */
export const managed = (settings: object): Source => ['managed', settings];
export const user = (settings: object): Source => ['user', settings];
export const project = (settings: object): Source => ['project', settings];
export const local = (settings: object): Source => ['local', settings];
export const flag = (settings: object): Source => ['flag', settings];
export const parent = (settings: object): Source => ['parent', settings];

/** `enabledPlugins` that managed settings force on. */
export const forceEnable = (...ids: readonly string[]): Source =>
  managed({ enabledPlugins: Object.fromEntries(ids.map((id) => [id, true])) });

export const fromManaged: PolicyHookSource = { kind: 'managedSettings' };
export const fromSdk: PolicyHookSource = { kind: 'sdkCallback' };
export const fromSettings = (
  scope: 'user' | 'project' | 'local' | 'flag' | 'sdkSettingsOption',
): PolicyHookSource => ({ kind: 'settings', scope });

const plainPlugin = {
  skillsDirPlugin: false,
  commandSource: false,
  isMod: false,
  isOrgMod: false,
} as const;

const pluginSource = (
  id: PluginHookSource['id'],
  extra: Partial<Omit<PluginHookSource, 'id'>> = {},
): PluginHookSource => ({ id, ...plainPlugin, ...extra });

export const fromPlugin = (
  id: PluginHookSource['id'],
  extra: Partial<Omit<PluginHookSource, 'id'>> = {},
): PolicyHookSource => ({ kind: 'plugin', ...pluginSource(id, extra) });

export const fromFrontmatter = (
  owner: 'skill' | 'command' | 'agent',
  from: 'user' | 'project' | 'addDir' | 'synced' | 'managed' | 'bundled',
): PolicyHookSource => ({ kind: 'frontmatter', owner, from });

export const fromPluginFrontmatter = (
  owner: 'skill' | 'command' | 'agent',
  id: PluginHookSource['id'],
  extra: Partial<Omit<PluginHookSource, 'id'>> = {},
): PolicyHookSource => ({
  kind: 'frontmatter',
  owner,
  from: 'plugin',
  plugin: pluginSource(id, extra),
});

/** Whether the hook of this origin runs. */
export const runs = (policy: HookPolicy, origin: PolicyHookSource): boolean =>
  policy.runs(origin).run;
