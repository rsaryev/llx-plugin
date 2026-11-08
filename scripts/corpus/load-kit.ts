/**
 * What the kit loads from a plugin folder, as the loading oracle's inventory (`load-oracle.ts`).
 * It reads `loadPlugin`'s plugin, the loader's own output: `plugin details` lists what a plugin
 * declares, not what a session resolves against its environment (a server whose `${VAR}` is unset
 * is still listed), and names a skill by the name it has inside its plugin.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { classifyPluginFolder, loadPlugin } from '../../src/index.ts';
import { diskFiles } from './disk-files.ts';
import type { LoadInventory } from './load-oracle.ts';

const NOT_LOADED: LoadInventory = {
  loaded: false,
  skills: [],
  agents: [],
  hookEvents: [],
  mcpServers: [],
  lspServers: [],
};

/** The immediate subfolder of a folder of plugins whose manifest is named `name`, if any. */
async function childNamed(dir: string, name: string): Promise<string | undefined> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries.filter((one) => one.isDirectory())) {
    const child = join(dir, entry.name);
    const text = await readFile(join(child, '.claude-plugin', 'plugin.json'), 'utf8').catch(
      () => undefined,
    );
    if (text === undefined) continue;
    try {
      const manifest: unknown = JSON.parse(text);
      if (
        typeof manifest === 'object' &&
        manifest !== null &&
        'name' in manifest &&
        manifest.name === name
      )
        return child;
    } catch {
      // a manifest that is not JSON does not load
    }
  }
  return undefined;
}

const DROPPED_SERVER = /MCP server(?: config for)? "(.*?)"/;

export async function kitInventory(dir: string, name: string): Promise<LoadInventory> {
  const files = diskFiles(dir);
  // `--plugin-dir` on a folder of plugins loads the folder's children, never the folder.
  if ((await classifyPluginFolder({ files })) === 'folder-of-plugins') {
    const child = await childNamed(dir, name);
    return child === undefined ? NOT_LOADED : kitInventory(child, name);
  }
  const { plugin, issues } = await loadPlugin({ files, fallbackName: name });
  if (plugin === undefined) return NOT_LOADED;
  // `plugin details` lists the servers a file declares before it reads their entries.
  const dropped = issues.flatMap((found) => DROPPED_SERVER.exec(found.message)?.[1] ?? []);
  return {
    loaded: true,
    skills: [...plugin.skills, ...plugin.commands].map((file) => file.name).toSorted(),
    agents: plugin.agents.map((file) => file.name).toSorted(),
    hookEvents: Object.keys(plugin.hooks).toSorted(),
    mcpServers: [...new Set([...Object.keys(plugin.mcpServers), ...dropped])].toSorted(),
    lspServers: Object.keys(plugin.lspServers).toSorted(),
  };
}
