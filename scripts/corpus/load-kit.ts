/**
 * What the kit loads from a plugin folder, as the loading oracle's inventory (`load-oracle.ts`).
 * It reads `loadPlugin`'s plugin, the loader's own output: `plugin details` lists what a plugin
 * declares, not what a session resolves against its environment (a server whose `${VAR}` is unset
 * is still listed), and names a skill by the name it has inside its plugin.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { classifyPluginFolder, loadPlugin, type PluginTextFile } from '../../src/index.ts';
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

/**
 * `plugin details` lists only the top-level `.md` files of a commands or agents folder: not a
 * nested file (`agents/review/security.md`), not a file a manifest path names on its own, not a
 * command given inline in the manifest. Claude Code still loads those (a runtime session's `init`
 * event names them: tests/loading/oracle-load.test.ts records the fixture), so the comparison
 * leaves them out of the kit's side instead of calling them extra.
 */
const componentPaths = z
  .object({
    agents: z.unknown().optional(),
    commands: z.unknown().optional(),
    skills: z.unknown().optional(),
  })
  .loose();

const pathsOf = (value: unknown): string[] =>
  (Array.isArray(value) ? value : [value]).flatMap((path) =>
    typeof path === 'string' ? [path.replace(/^\.\//, '').replace(/\/+$/, '')] : [],
  );

const under = (dir: string, roots: readonly string[]): boolean =>
  roots.some((root) => root === '' || root === '.' || dir === root || dir.startsWith(`${root}/`));

/**
 * `plugin details` does not list a skill folder a commands location holds (engram's
 * `commands/recall/SKILL.md`), though a session's `init` names it (oracle 2.1.319, corpus:runtime):
 * the comparison leaves out the kit's skill folders that are under a commands location and under no
 * skills location (`commands: "./skills/"` lists them as the skills they also are).
 */
async function listedSkillByDetails(dir: string): Promise<(file: PluginTextFile) => boolean> {
  let commands = ['commands'];
  let skills = ['skills'];
  try {
    const raw: unknown = JSON.parse(
      await readFile(join(dir, '.claude-plugin', 'plugin.json'), 'utf8'),
    );
    const parsed = componentPaths.safeParse(raw);
    if (parsed.success) {
      commands = [...commands, ...pathsOf(parsed.data.commands)];
      skills = [...skills, ...pathsOf(parsed.data.skills)];
    }
  } catch {
    // no manifest, or one that does not parse: only the default folders
  }
  return (file) =>
    file.directory === undefined ||
    !under(file.directory, commands) ||
    under(file.directory, skills);
}

/** The `.md` files a manifest's `agents` and `commands` name one by one. */
const singleFiles = (value: unknown): string[] =>
  (Array.isArray(value) ? value : [value]).flatMap((path) =>
    typeof path === 'string' && path.endsWith('.md') ? [path.replace(/^\.\//, '')] : [],
  );

async function listedByDetails(dir: string): Promise<(file: PluginTextFile) => boolean> {
  let singles = new Set<string>();
  try {
    const raw: unknown = JSON.parse(
      await readFile(join(dir, '.claude-plugin', 'plugin.json'), 'utf8'),
    );
    const parsed = componentPaths.safeParse(raw);
    if (parsed.success)
      singles = new Set([...singleFiles(parsed.data.agents), ...singleFiles(parsed.data.commands)]);
  } catch {
    // no manifest, or one that does not parse: only the default folders
  }
  return (file) => file.path !== undefined && !file.name.includes(':') && !singles.has(file.path);
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
  const listed = await listedByDetails(dir);
  const listedSkill = await listedSkillByDetails(dir);
  return {
    loaded: true,
    skills: [...plugin.skills.filter(listedSkill), ...plugin.commands.filter(listed)]
      .map((file) => file.name)
      .toSorted(),
    agents: plugin.agents
      .filter(listed)
      .map((file) => file.name)
      .toSorted(),
    hookEvents: Object.keys(plugin.hooks).toSorted(),
    mcpServers: [...new Set([...Object.keys(plugin.mcpServers), ...dropped])].toSorted(),
    lspServers: Object.keys(plugin.lspServers).toSorted(),
  };
}
