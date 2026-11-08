import type { PluginIssue } from './issues.ts';
import type { PluginManifest } from './manifest-schema.ts';
import { pathIssues, pathsIn, type PathRule } from './paths.ts';

/**
 * Which manifest keys name component paths, and under which rule (plugins/manifest-reference.md,
 * "Path rules", "Path-only fields"). `experimental.evals` is not a component path. `types` is a
 * "Path" to "A `.d.ts` file": the extension is the field table's. Judgment: it also follows the
 * `./` and containment rules, since it is a path relative to the plugin root like the component
 * keys and a `..` or absolute one would name a file outside the plugin (spec/judgments.md).
 */
type Checked = readonly [field: string, value: unknown, rule: PathRule];

const commandSources = (value: PluginManifest['commands']): string[] =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? Object.values(value).flatMap((entry) => (entry.source ? [entry.source] : []))
    : [];

function checked(manifest: PluginManifest): Checked[] {
  const { commands, experimental } = manifest;
  return [
    ['skills', manifest.skills, { root: true }],
    ['commands', Array.isArray(commands) || typeof commands === 'string' ? commands : [], {}],
    ['commands', commandSources(commands), {}],
    ['agents', manifest.agents, { extension: '.md' }],
    ['hooks', manifest.hooks, {}],
    ['mcpServers', manifest.mcpServers, { remote: true }],
    ['lspServers', manifest.lspServers, {}],
    ['outputStyles', manifest.outputStyles, {}],
    ['workflows', manifest.workflows, {}],
    ['themes', manifest.themes, {}],
    ['monitors', manifest.monitors, {}],
    ['types', manifest.types, { extension: '.d.ts' }],
    ['experimental.themes', experimental?.themes, {}],
    ['experimental.monitors', experimental?.monitors, {}],
  ];
}

/** Path issues of a manifest whose keys parsed. */
export function manifestPathIssues(manifest: PluginManifest): PluginIssue[] {
  return checked(manifest).flatMap(([field, value, rule]) =>
    pathsIn(value).flatMap((path) => pathIssues(path, field, rule)),
  );
}
