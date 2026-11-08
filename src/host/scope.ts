import type { SubstitutionScope } from '../loading/index.ts';
import type { ActivePlugin, HostState } from './state.ts';

/** What a plugin's `${...}` references resolve against, for this host (docs/API.md, "Variable substitution"). */
export const scopeOf = (
  state: HostState,
  plugin: ActivePlugin,
  signal?: AbortSignal,
): SubstitutionScope => ({
  pluginId: plugin.id,
  locations: state.options.ports.locations,
  environment: state.options.ports.environment,
  userConfig: plugin.userConfig,
  windows: state.options.windows ?? false,
  ...(signal === undefined ? {} : { signal }),
});
