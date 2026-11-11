/** A session over in-memory agent folders and plugins, for the host tests of the agent catalog. */
import type { HostPlugin, PluginSession } from '../../src/host/index.ts';
import { loaded, signal } from './host.ts';

export const agentFile = (name: string, extra = '', body = 'Do the work.'): string =>
  `---\nname: ${name}\ndescription: ${name} agent\n${extra}---\n${body}\n`;

export const PLUGIN_ID = 'my-plugin@acme-tools';
const manifest = (extra: Record<string, unknown> = {}): string =>
  JSON.stringify({ name: 'my-plugin', ...extra });

export async function pluginOf(
  files: Record<string, string>,
  manifestFields: Record<string, unknown> = {},
  enabled = true,
): Promise<readonly HostPlugin[]> {
  const plugin = await loaded({ '.claude-plugin/plugin.json': manifest(manifestFields), ...files });
  return [{ id: PLUGIN_ID, plugin, enabled }];
}

export const reload = (session: PluginSession) => session.reloadAgents({ signal: signal() });

export const namesOf = (session: PluginSession) =>
  session.agentCatalog().agents.map((agent) => agent.name);
