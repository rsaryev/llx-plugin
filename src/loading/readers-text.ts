import { parseFrontmatter } from '../format/frontmatter.ts';
import { error } from '../format/issues.ts';
import { pathNotFound } from '../format/messages.ts';
import type { PluginIssue } from '../format/issues.ts';
import type { DiscoveredFile } from './discovered.ts';
import type { PluginTextFile } from './plugin-model.ts';
import type { ComponentRead, ReaderContext, ReadKind } from './reader-types.ts';

const qualify = (plugin: string, name: string): string => `${plugin}:${name}`;

/**
 * A skill named by itself (the plugin root, or a manifest path to its folder): the frontmatter
 * `name` names it and the discovered name is the fallback. For the root, "`name` supplies the whole
 * final segment. Without a `name` field, Claude Code falls back to the plugin's directory name"
 * (skills.md, "How a skill gets its command name"); for a listed folder the oracle 2.1.319 does the same.
 */
function aloneSkillName(text: string, fallback: string): string {
  const { name } = parseFrontmatter(text).fields;
  return typeof name === 'string' && name.trim() !== '' ? name.trim() : fallback;
}

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
        const name = file.alone === true ? aloneSkillName(text, file.name) : file.name;
        const named = {
          path: file.path,
          name,
          text,
          qualifiedName: qualify(context.pluginName, name),
        };
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
