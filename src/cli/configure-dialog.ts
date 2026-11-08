import type { ResolvedUserConfig, UserConfigValue } from '../loading/resolve/user-config.ts';
import { userConfigValue } from '../loading/resolve/user-config.ts';
import { unsetKeys } from './user-config-input.ts';

const SELECTIONS = {
  'session-install': 'unset',
  'session-enable': 'unset',
  'session-configure': 'all',
  'vscode-install': 'unset',
  'vscode-configure': 'all',
  'shell-install': 'none',
} as const;
export type ConfigurationEvent = keyof typeof SELECTIONS;

export interface ConfigurationDialog {
  readonly open: boolean;
  readonly keys: readonly string[];
  /** Sensitive starting values never leave the secure store. */
  readonly inputs: Readonly<Record<string, UserConfigValue>>;
}

const SELECT = {
  unset: (config: ResolvedUserConfig) => unsetKeys(config),
  all: (config: ResolvedUserConfig) => Object.keys(config.declared),
  none: (_config: ResolvedUserConfig): readonly string[] => [],
};

/** components.md § When the configuration dialog appears. The host renders this plan, never shell install. */
export function configurationDialog(
  event: ConfigurationEvent,
  config: ResolvedUserConfig,
): ConfigurationDialog {
  const keys = SELECT[SELECTIONS[event]](config);
  const inputs: Record<string, UserConfigValue> = {};
  for (const key of keys) {
    const value = userConfigValue(config, key);
    if (config.declared[key]?.sensitive !== true && value !== undefined) inputs[key] = value;
  }
  // Judgment: a plugin with no options needs no empty dialog, even for an explicit configure.
  return { open: keys.length > 0, keys, inputs };
}
