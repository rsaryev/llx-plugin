import { error, type PluginIssue } from '../../format/issues.ts';
import type { McpBundleConfig } from '../../format/mcp-config.ts';
import {
  bundleSettingKey,
  missingBundleSettings,
  requiredBundleSettings,
} from '../../format/mcpb-manifest.ts';
import type { SubstitutionScope } from './scope.ts';
import type { UserConfigValue } from './user-config.ts';

/** "A bundled server with a required setting that has no saved value doesn't start" (plugins/components.md). */
const needsConfiguration = (server: string): PluginIssue =>
  error('mcpServers', `Bundled MCP server "${server}" was not started: it needs configuration`);

/** A saved value a reference can stand for: text, a number or a Boolean. */
const isPlain = (value: UserConfigValue | undefined): value is string | number | boolean =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';

/** The plain values saved for one bundled server: the plugin's values under `<server>.<key>`. */
function savedOf(
  scope: SubstitutionScope,
  server: string,
  bundle: McpBundleConfig,
): Record<string, string | number | boolean> {
  return Object.fromEntries(
    Object.keys(bundle.userConfig).flatMap((key) => {
      const value = scope.userConfig.values[bundleSettingKey(server, key)];
      return isPlain(value) ? [[key, value]] : [];
    }),
  );
}

/**
 * The scope of a bundled server, or why it does not start (plugins/components.md, "Include a packaged
 * MCPB server"). Its `${user_config.KEY}` reads its bundle's own settings, never the plugin's
 * `userConfig`: the values saved under `<server>.<key>` (`pluginConfigs.<id>.mcpServers.<server>`, the
 * host's store over it; the `--config` form), else the setting's default, answered in the same one
 * pass as every other reference, so a value holding `${...}` stays that text. The verdict is made here,
 * when the server is resolved for a session, so one loaded plugin serves sessions with different
 * values; a value that is not text, a number or a Boolean is none (judgments, spec/judgments.md).
 */
export function bundleScope(
  scope: SubstitutionScope,
  server: string,
  bundle: McpBundleConfig,
): { readonly scope: SubstitutionScope } | { readonly issue: PluginIssue } {
  const saved = savedOf(scope, server, bundle);
  const flat = Object.fromEntries(
    Object.entries(saved).map(([key, value]) => [bundleSettingKey(server, key), value]),
  );
  const required = requiredBundleSettings({ name: server, options: bundle.userConfig });
  if (missingBundleSettings(required, flat).length > 0)
    return { issue: needsConfiguration(server) };
  return {
    scope: { ...scope, userConfig: { declared: bundle.userConfig, values: saved } },
  };
}
