import { isWithin } from '../format/path-text.ts';
import type { PluginTextFile } from './plugin-model.ts';
import type { ReaderContext } from './reader-types.ts';

const canonical = (path: string): string =>
  path
    .replaceAll('\\', '/')
    .replace(/^\.\/+/, '')
    .replace(/\/+$/, '');

const inside = (path: string, directory: string): boolean =>
  directory === '' || directory === '.' || isWithin(directory, canonical(path));

/** troubleshooting.md: this diagnostic belongs in the debug log, not the Plugin Errors tab. */
export async function commandDirectoryDebug(
  context: ReaderContext,
  commands: readonly PluginTextFile[],
): Promise<readonly string[]> {
  const value = context.manifest?.commands;
  const paths: readonly string[] =
    typeof value === 'string' ? [value] : Array.isArray(value) ? value : [];
  const messages = await Promise.all(
    paths.map(async (path) => {
      const directory = canonical(path);
      const stat = await context.files.stat(directory, context.signal).catch(() => undefined);
      const empty = !commands.some(
        (command) => command.path !== undefined && inside(command.path, directory),
      );
      return stat?.isDirectory && empty
        ? [`Warning: No commands found in plugin ${context.pluginName} custom directory`]
        : [];
    }),
  );
  return messages.flat();
}
