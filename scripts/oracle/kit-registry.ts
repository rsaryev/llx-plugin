/**
 * What the kit's session registers from a plugin folder, in the shape of the runtime oracle's
 * registry (`runtime.ts`): `loadPlugin` over the folder, then a host with one plugin and a session,
 * read through `agents()`, `skills()`, `mcpServers()` and `outputStyles()` as a host reads them.
 */
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { z } from 'zod';
import {
  createPluginHost,
  createPolicyView,
  loadPlugin,
  readSettingsLayer,
  resolveOutputStyle,
} from '../../src/index.ts';
import {
  fakeEnvironment,
  locations,
  recordingHttp,
  scriptedRunner,
} from '../../src/testing/index.ts';
import { readCatalog, type PluginCatalog } from '../../src/host/catalog.ts';
import { diskFiles } from '../corpus/disk-files.ts';
import { SETTINGS_FILE, type Registry } from './runtime.ts';

const NOT_LOADED: Registry = {
  loaded: false,
  agents: [],
  slashCommands: [],
  skills: [],
  mcpServers: [],
  outputStyle: 'default',
};

const SESSION = {
  sessionId: 'oracle',
  cwd: '/work/app',
  permissionMode: 'default',
  transcriptPath: '/work/oracle.jsonl',
} as const;

/** The settings a fixture runs under, as a policy view of the user layer. */
async function settingsOf(dir: string) {
  const text = await readFile(join(dir, SETTINGS_FILE), 'utf8').catch(() => undefined);
  if (text === undefined) return { view: createPolicyView([]), outputStyle: undefined };
  const raw: unknown = JSON.parse(text);
  const { layer } = readSettingsLayer('user', raw);
  const style = z.object({ outputStyle: z.string() }).safeParse(raw);
  return {
    view: createPolicyView([layer]),
    outputStyle: style.success ? style.data.outputStyle : undefined,
  };
}

/**
 * What `init.skills` lists, as observed (docs/TESTING.md, "Runtime oracle"): the user-invocable
 * skills, and the user-invocable commands that set `disable-model-invocation`. It is not the model's
 * listing (a skill the model may not invoke is in it) and not the `/` menu (a command's own entry
 * decides the menu name, the skill's the `skills` one), so it is read off the catalog.
 */
function initSkills(catalog: PluginCatalog): string[] {
  const listed = [
    ...catalog.skills.filter((skill) => skill.userInvocable),
    ...catalog.commands.filter(
      (command) => command.userInvocable && command.disableModelInvocation,
    ),
  ];
  return [...new Set(listed.map((entry) => entry.command))].toSorted();
}

/** The kit's registry of the plugin in `dir`, named as Claude Code names a `--plugin-dir` plugin. */
export async function kitRegistry(dir: string): Promise<Registry> {
  const { plugin } = await loadPlugin({ files: diskFiles(dir), fallbackName: basename(dir) });
  if (plugin === undefined) return NOT_LOADED;
  const { view, outputStyle } = await settingsOf(dir);
  const host = createPluginHost({
    plugins: [{ id: `${plugin.name}@inline`, plugin }],
    ports: {
      commands: scriptedRunner(),
      http: recordingHttp(),
      locations: locations(),
      environment: fakeEnvironment(),
    },
    settings: view,
  });
  if (!host.plugins.some((one) => one.enabled)) return { ...NOT_LOADED, loaded: false };
  const session = host.openSession(SESSION);
  const listing = session.skills();
  const catalog = readCatalog(plugin);
  return {
    loaded: true,
    agents: (await session.agents({ builtin: false })).resolved
      .map((agent) => agent.name)
      .toSorted(),
    slashCommands: listing.menu.map((entry) => entry.name).toSorted(),
    skills: initSkills(catalog),
    mcpServers: (await session.mcpServers()).resolved.map((server) => server.key).toSorted(),
    outputStyle: resolveOutputStyle({
      ...(outputStyle === undefined ? {} : { setting: outputStyle }),
      styles: session.outputStyles(),
    }).id,
  };
}
