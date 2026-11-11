import type { PluginVariable } from './variables.ts';

/**
 * The table "Where each variable resolves" (plugins/manifest-reference.md): per plugin component,
 * the fields where `${...}` resolves inline and what the process receives in its environment.
 * Each resolver reads its field list here, so a component Claude Code adds is one row.
 */
export const VARIABLE_COMPONENTS = [
  'hook-command',
  'monitor-command',
  'mcp-stdio',
  'mcp-remote',
  'lsp',
  'markdown-content',
] as const;
export type VariableComponent = (typeof VARIABLE_COMPONENTS)[number];

/** A field `${...}` resolves in; `body` is "anywhere in the Markdown body". */
export type VariableField =
  | 'command'
  | 'args'
  | 'env'
  | 'url'
  | 'headers'
  | 'headersHelper'
  | 'workspaceFolder'
  | 'body';

/** The name of the option variables, `CLAUDE_PLUGIN_OPTION_<KEY>`, as the table writes it. */
export const OPTION_VARIABLES = 'CLAUDE_PLUGIN_OPTION_<KEY>';
export type ExportedVariable = PluginVariable | typeof OPTION_VARIABLES;

export interface ComponentVariables {
  readonly fields: readonly VariableField[];
  readonly exported: readonly ExportedVariable[];
}

const PATHS: readonly ExportedVariable[] = [
  'CLAUDE_PLUGIN_ROOT',
  'CLAUDE_PLUGIN_DATA',
  'CLAUDE_PROJECT_DIR',
];

export const VARIABLE_FIELDS: { readonly [C in VariableComponent]: ComponentVariables } = {
  'hook-command': { fields: ['command', 'args'], exported: [...PATHS, OPTION_VARIABLES] },
  'monitor-command': { fields: ['command'], exported: [] },
  'mcp-stdio': { fields: ['command', 'args', 'env'], exported: PATHS },
  // `http`, `sse` and `ws`: the process variables are "not applicable".
  'mcp-remote': { fields: ['url', 'headers', 'headersHelper'], exported: [] },
  lsp: { fields: ['command', 'args', 'env', 'workspaceFolder'], exported: PATHS },
  'markdown-content': { fields: ['body'], exported: [] },
};
