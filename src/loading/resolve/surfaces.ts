import type { VariableComponent } from './field-map.ts';
import type { FieldPolicy, SubstitutionScope } from './scope.ts';
import { substituteTemplate, type Substituted } from './substitute.ts';
import { readsAsEmptyInRemoteMcp } from './remote-mcp-credentials.ts';

/**
 * Where a string is substituted, finer than a component where the docs split one: a hook runs in
 * exec form or shell form (or through PowerShell), and an MCP server is stdio or remote, whose
 * `headersHelper` runs through a shell.
 */
export const SURFACES = [
  'hook-exec',
  'hook-shell',
  'hook-powershell',
  'monitor-command',
  'mcp-stdio',
  'mcp-remote',
  'mcp-headers-helper',
  'lsp',
  'markdown-content',
] as const;
export type Surface = (typeof SURFACES)[number];

/** The component whose row of the table each surface belongs to. */
export const SURFACE_COMPONENT: { readonly [S in Surface]: VariableComponent } = {
  'hook-exec': 'hook-command',
  'hook-shell': 'hook-command',
  'hook-powershell': 'hook-command',
  'monitor-command': 'monitor-command',
  'mcp-stdio': 'mcp-stdio',
  'mcp-remote': 'mcp-remote',
  'mcp-headers-helper': 'mcp-remote',
  lsp: 'lsp',
  'markdown-content': 'markdown-content',
};

/**
 * The differences between surfaces, from the docs:
 * - `${user_config.*}`: exec-form `args`, MCP config, LSP config (manifest-reference, "Reference a
 *   saved value"); never shell-form hooks, monitors or `headersHelper` ("Fields that run through a
 *   shell"); non-sensitive only in skill and agent content.
 * - `${VAR}`: MCP `command`, `args`, `env`, `url`, `headers` (mcp.md, not `headersHelper`) and
 *   monitor `command` (components.md, "Monitors"). Judgment: nowhere else; a hook or LSP command
 *   keeps `${HOME}` for the process, and the docs give the kit no expansion to do.
 * - Windows paths: forward slashes, except exec-form hooks (native) and PowerShell hooks, where
 *   the placeholders become `${env:NAME}` (hooks.md, "Reference scripts by path in PowerShell hooks").
 * - `mcp-remote`: credential variables read as empty in `url` and `headers` (mcp.md, "Credential
 *   variables that read as empty"), `readsAsEmptyInRemoteMcp`.
 * - A hook with no `shell` field runs in PowerShell on Windows without Git Bash (hooks.md, "Exec
 *   form and shell form"); the kit cannot tell, so the caller picks `hook-shell` or `hook-powershell`.
 */
export const SURFACE_POLICY: { readonly [S in Surface]: FieldPolicy } = {
  'hook-exec': { userConfig: 'allow', environment: 'literal', paths: 'native' },
  'hook-shell': { userConfig: 'refuse', environment: 'literal', paths: 'normalized' },
  'hook-powershell': {
    userConfig: 'refuse',
    environment: 'literal',
    paths: 'environment-reference',
  },
  'monitor-command': { userConfig: 'refuse', environment: 'expand', paths: 'normalized' },
  'mcp-stdio': { userConfig: 'allow', environment: 'expand', paths: 'normalized' },
  'mcp-remote': {
    userConfig: 'allow',
    environment: 'expand',
    paths: 'normalized',
    readsAsEmpty: readsAsEmptyInRemoteMcp,
  },
  'mcp-headers-helper': { userConfig: 'refuse', environment: 'literal', paths: 'normalized' },
  lsp: { userConfig: 'allow', environment: 'literal', paths: 'normalized' },
  'markdown-content': { userConfig: 'non-sensitive', environment: 'literal', paths: 'normalized' },
};

/** `substituteTemplate` with the policy of a surface. */
export const substituteSurface = (
  surface: Surface,
  template: string,
  scope: SubstitutionScope,
  path = '',
): Promise<Substituted> => substituteTemplate(template, scope, SURFACE_POLICY[surface], path);
