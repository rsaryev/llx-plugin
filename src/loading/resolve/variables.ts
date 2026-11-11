import { pluginDataId } from './data-id.ts';
import type { PathRendering, SubstitutionScope } from './scope.ts';

/**
 * The three path variables Claude Code provides to plugin components (plugins/manifest-reference.md,
 * "Environment variables"). `${CLAUDE_PLUGIN_ROOT}` is the installed version, `${CLAUDE_PLUGIN_DATA}`
 * the persistent folder, `${CLAUDE_PROJECT_DIR}` the project root.
 */
export const PLUGIN_VARIABLES = [
  'CLAUDE_PLUGIN_ROOT',
  'CLAUDE_PLUGIN_DATA',
  'CLAUDE_PROJECT_DIR',
] as const;
export type PluginVariable = (typeof PLUGIN_VARIABLES)[number];

export const isPluginVariable = (name: string): name is PluginVariable =>
  PLUGIN_VARIABLES.some((variable) => variable === name);

/**
 * Where each variable comes from, as the host reports it (native paths). The data folder is the
 * only one that is created: "created on first reference", so the host is asked here, and only when
 * a caller needs the value. Judgment: the port gets the sanitized `<id>` (`pluginDataId`), the
 * part of the path the docs define, so a host joins it and cannot disagree.
 */
const SOURCES: { readonly [V in PluginVariable]: (scope: SubstitutionScope) => Promise<string> } = {
  CLAUDE_PLUGIN_ROOT: (scope) => Promise.resolve(scope.locations.pluginRoot(scope.pluginId)),
  CLAUDE_PLUGIN_DATA: (scope) =>
    scope.locations.pluginData(pluginDataId(scope.pluginId), scope.signal),
  CLAUDE_PROJECT_DIR: (scope) => Promise.resolve(scope.locations.projectDir()),
};

/** The variable's path as the host reports it: what a process receives in its environment. */
export const pluginVariableValue = (
  variable: PluginVariable,
  scope: SubstitutionScope,
): Promise<string> => SOURCES[variable](scope);

/**
 * Whether a rendering writes the variable's path into the text. A reference the shell or PowerShell
 * expands (`${CLAUDE_PLUGIN_DATA}`, `${env:CLAUDE_PLUGIN_DATA}`) does not, so it never asks the host
 * for the data folder.
 */
const NEEDS_VALUE: { readonly [R in PathRendering]: boolean } = {
  normalized: true,
  native: true,
  'environment-reference': false,
  'shell-reference': false,
};

export const renderingNeedsValue = (rendering: PathRendering): boolean => NEEDS_VALUE[rendering];

/** Writes a variable into text (plugins/manifest-reference.md, "Quoting and path separators"). */
const RENDERINGS: {
  readonly [R in PathRendering]: (variable: string, value: string, windows: boolean) => string;
} = {
  normalized: (_variable, value, windows) => (windows ? value.replaceAll('\\', '/') : value),
  native: (_variable, value) => value,
  'environment-reference': (variable) => `\${env:${variable}}`,
  // Braced, so text right after the reference (`"${CLAUDE_PLUGIN_ROOT}"_old`) is not read as part of the name.
  'shell-reference': (variable) => `\${${variable}}`,
};

/**
 * `value` is the variable's path; a rendering that does not need it (`renderingNeedsValue`) ignores
 * it. `variable` is one of the three or a path another layer owns (`SubstitutionScope.extraPaths`).
 */
export const renderPluginVariable = (
  rendering: PathRendering,
  variable: string,
  value: string,
  windows: boolean,
): string => RENDERINGS[rendering](variable, value, windows);
