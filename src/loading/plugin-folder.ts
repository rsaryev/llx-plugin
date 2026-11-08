import type { PluginFiles } from '../ports/index.ts';

/**
 * What a folder passed as `--plugin-dir` is (plugins/create.md, "Load a folder of plugins"): "If the
 * folder has no `.claude-plugin/` directory and no plugin components at its top level, Claude Code
 * treats it as a folder of plugins", whose children that have a manifest load as plugins of their
 * own; the folder itself then loads nothing. A host loads a folder of plugins by classifying each
 * child, then calls `loadPlugin` on those that are plugins.
 */
export type PluginFolderKind = 'plugin' | 'folder-of-plugins';

/** The top-level entries that mark a folder as one plugin: components, not metadata (oracle 2.1.319). */
const MARKERS = [
  'skills',
  'commands',
  'agents',
  'hooks',
  'output-styles',
  'themes',
  'monitors',
  'workflows',
  'SKILL.md',
  '.lsp.json',
] as const;

/**
 * Judgment (spec/judgments.md, oracle 2.1.319): the docs name the rule, not its edges. A
 * `.claude-plugin/` folder marks a plugin unless it holds a `marketplace.json` and no `plugin.json`
 * (the docs' marketplace-beside-plugins case); `.mcp.json` marks one unless it is zero bytes;
 * `settings.json`, `bin/`, `CLAUDE.md` and a lower-case `skill.md` mark nothing.
 */
export async function classifyPluginFolder(input: {
  readonly files: PluginFiles;
  readonly signal?: AbortSignal;
}): Promise<PluginFolderKind> {
  const { files, signal } = input;
  const [marketplace, manifest, shelf, mcp, ...rest] = await Promise.all([
    files.exists('.claude-plugin/marketplace.json', signal),
    files.exists('.claude-plugin/plugin.json', signal),
    files.exists('.claude-plugin', signal),
    files.stat('.mcp.json', signal),
    ...MARKERS.map((marker) => files.exists(marker, signal)),
  ]);
  const shelfMarks = shelf && (manifest || !marketplace);
  return shelfMarks || (mcp?.size ?? 0) > 0 || rest.some(Boolean) ? 'plugin' : 'folder-of-plugins';
}
