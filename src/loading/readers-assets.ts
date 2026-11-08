import { error, type PluginIssue } from '../format/issues.ts';
import { pathNotFound } from '../format/messages.ts';
import { readTheme } from '../format/theme.ts';
import { inspectWorkflowScript } from '../format/workflow-script.ts';
import type { DiscoveredFile } from './discovered.ts';
import type { PluginTheme, PluginWorkflow } from './plugin-model.ts';
import type { ComponentRead, ReaderContext, ReadKind } from './reader-types.ts';

/**
 * Themes and workflows (plugins/components.md, "Themes and output styles"; workflows.md, "Distribute
 * a workflow in a plugin"): each file is read once, the theme through `readTheme` and the workflow's
 * `meta` through `inspectWorkflowScript`, which never runs the script. What is wrong with a file comes
 * back as issues at the file's path; the component stays in the plugin either way, so a host sees the
 * file and the reason (a theme that is not a JSON object has no `theme`; a script without a readable
 * `meta` has no `meta` and no qualified name).
 */

interface Source {
  readonly file: DiscoveredFile & { readonly path: string };
  readonly text: string | undefined;
}

async function sourcesOf(
  context: ReaderContext,
  found: readonly DiscoveredFile[],
): Promise<Source[]> {
  return Promise.all(
    found.flatMap((file) =>
      file.path === undefined
        ? []
        : [
            context.files
              .readText(file.path, context.signal)
              .then((text) => ({ file: { ...file, path: file.path ?? '' }, text })),
          ],
    ),
  );
}

const where = (path: string, issues: readonly PluginIssue[]): PluginIssue[] =>
  issues.map((issue) => ({ ...issue, path }));

function missing(kind: ReadKind, path: string): PluginIssue {
  return error(kind, pathNotFound(kind, path));
}

export async function readThemes(
  context: ReaderContext,
): Promise<ComponentRead<readonly PluginTheme[]>> {
  const sources = await sourcesOf(context, context.discovered.themes);
  const value: PluginTheme[] = [];
  const issues: PluginIssue[] = [];
  for (const { file, text } of sources) {
    if (text === undefined) {
      issues.push(missing('themes', file.path));
      continue;
    }
    const read = readTheme(file.name, text);
    issues.push(...where(file.path, read.issues));
    value.push({
      path: file.path,
      name: file.name,
      plugin: context.pluginName,
      theme: read.theme,
    });
  }
  return { value, issues };
}

export async function readWorkflows(
  context: ReaderContext,
): Promise<ComponentRead<readonly PluginWorkflow[]>> {
  const sources = await sourcesOf(context, context.discovered.workflows);
  const value: PluginWorkflow[] = [];
  const issues: PluginIssue[] = [];
  for (const { file, text } of sources) {
    if (text === undefined) {
      issues.push(missing('workflows', file.path));
      continue;
    }
    const report = inspectWorkflowScript(text);
    issues.push(...where(file.path, report.issues));
    const qualifiedName =
      report.meta === undefined ? undefined : `${context.pluginName}:${report.meta.name}`;
    value.push({ path: file.path, name: file.name, qualifiedName, meta: report.meta });
  }
  return { value, issues };
}
