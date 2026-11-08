import { error } from '../format/issues.ts';
import { pathNotFound } from '../format/messages.ts';
import type { PluginIssue } from '../format/issues.ts';
import type { DiscoveredFile } from './discovered.ts';
import type { PluginPath, PluginTextFile } from './plugin-model.ts';
import type { ComponentRead, ReaderContext, ReadKind } from './reader-types.ts';

const qualify = (plugin: string, name: string): string => `${plugin}:${name}`;

/** The text of one discovered file, or an inline command's `content`; `undefined` when it cannot be read. */
async function textOf(context: ReaderContext, file: DiscoveredFile): Promise<string | undefined> {
  if (file.path === undefined) return file.entry?.content;
  return context.files.readText(file.path, context.signal);
}

/**
 * Reads the text of what discovery found for a kind that holds Markdown. This is the seam the stream
 * that owns the component's content replaces with its own parser (skill, command, agent, output
 * style); until then the text is kept as written.
 */
export const textFiles =
  (kind: ReadKind, find: (context: ReaderContext) => readonly DiscoveredFile[]) =>
  async (context: ReaderContext): Promise<ComponentRead<readonly PluginTextFile[]>> => {
    const issues: PluginIssue[] = [];
    const read = await Promise.all(
      find(context).map(async (file) => {
        const text = await textOf(context, file);
        if (text === undefined) {
          issues.push(error(kind, pathNotFound(kind, file.path ?? file.name)));
          return [];
        }
        const base = { path: file.path, name: file.name, text };
        const named = { ...base, qualifiedName: qualify(context.pluginName, file.name) };
        return [
          {
            ...named,
            ...(file.directory !== undefined && { directory: file.directory }),
            ...(file.entry !== undefined && { entry: file.entry }),
          },
        ];
      }),
    );
    return { value: read.flat(), issues };
  };

/** Workflows and themes: loading keeps the path and name; the file is the host's to run or apply. */
export const pathFiles =
  (find: (context: ReaderContext) => readonly DiscoveredFile[]) =>
  (context: ReaderContext): Promise<ComponentRead<readonly PluginPath[]>> =>
    Promise.resolve({
      value: find(context).flatMap((file) =>
        file.path === undefined
          ? []
          : [
              {
                path: file.path,
                name: file.name,
                qualifiedName: qualify(context.pluginName, file.name),
              },
            ],
      ),
      issues: [],
    });
