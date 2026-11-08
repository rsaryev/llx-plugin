import {
  inFile,
  warningAt,
  type Finding,
  type ValidationIssue,
} from '../../format/validate/finding.ts';
import { declaredOptions } from '../../format/validate/plugin-manifest.ts';
import type { PluginFiles } from '../../ports/index.ts';
import { componentIssues, manifestPaths } from './components.ts';
import { hooksFileIssues, mcpFileIssues } from './json-files.ts';

const CLAUDE_MD =
  'CLAUDE.md at the plugin root is not loaded as project context. To ship context with your plugin, use a skill (skills/<name>/SKILL.md) instead.';
const REMOTE = /^https?:\/\//i;

async function hookIssues(
  files: PluginFiles,
  manifest: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<ValidationIssue[]> {
  const paths = ['hooks/hooks.json', ...manifestPaths(manifest.hooks)];
  const found = await Promise.all(
    [...new Set(paths)].map((path) => hooksFileIssues(files, path, signal)),
  );
  return found.flat();
}

async function mcpIssues(
  files: PluginFiles,
  manifest: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<ValidationIssue[]> {
  const declared = declaredOptions(manifest);
  const paths = ['.mcp.json', ...manifestPaths(manifest.mcpServers).filter((p) => !REMOTE.test(p))];
  const found = await Promise.all(
    [...new Set(paths)].map((path) => mcpFileIssues(files, path, declared, signal)),
  );
  return found.flat();
}

/** The plugin's own manifest and what is written inline in it. */
export interface PluginManifestSite {
  readonly manifest: Record<string, unknown>;
  readonly file: string;
  readonly inline: readonly Finding[];
}

/** Everything beside the manifest that the validator reads in a plugin folder. */
export async function pluginContents(
  files: PluginFiles,
  site: PluginManifestSite,
  signal?: AbortSignal,
): Promise<ValidationIssue[]> {
  const { manifest } = site;
  const own = await files.stat('CLAUDE.md', signal);
  const claude =
    own?.isFile === true && !own.isSymlink
      ? inFile('CLAUDE.md', [warningAt('root', CLAUDE_MD)])
      : [];
  return [
    ...claude,
    ...(await componentIssues(files, signal)),
    ...(await hookIssues(files, manifest, signal)),
    ...inFile(site.file, site.inline),
    ...(await mcpIssues(files, manifest, signal)),
  ];
}
