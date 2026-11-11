import type { VariableComponent } from './field-map.ts';
import type { FieldPolicy, PathRendering, ShellPaths, SubstitutionScope } from './scope.ts';
import type { Substituted } from './substitute.ts';
import { substituteTemplate } from './substituter.ts';
import { readsAsEmptyInRemoteMcp } from '../../format/remote-mcp-credentials.ts';

/**
 * Where a string is substituted, finer than a component where the docs split one: a hook runs in
 * exec form or shell form (or through PowerShell), and an MCP server is stdio or remote, whose
 * `headersHelper` runs through a shell.
 */
export const SUBSTITUTION_SURFACES = [
  'hook-exec',
  'hook-shell',
  'hook-powershell',
  'monitor-command',
  'mcp-stdio',
  'mcp-remote',
  'mcp-headers-helper',
  'lsp',
  'markdown-content',
  'skill-bash',
  'skill-powershell',
] as const;
export type SubstitutionSurface = (typeof SUBSTITUTION_SURFACES)[number];

/** The component whose row of the table each surface belongs to. */
export const SURFACE_COMPONENT: { readonly [S in SubstitutionSurface]: VariableComponent } = {
  'hook-exec': 'hook-command',
  'hook-shell': 'hook-command',
  'hook-powershell': 'hook-command',
  'monitor-command': 'monitor-command',
  'mcp-stdio': 'mcp-stdio',
  'mcp-remote': 'mcp-remote',
  'mcp-headers-helper': 'mcp-remote',
  lsp: 'lsp',
  'markdown-content': 'markdown-content',
  'skill-bash': 'markdown-content',
  'skill-powershell': 'markdown-content',
};

/** Skill and agent content: a sensitive option is a placeholder, paths are written in. */
const MARKDOWN: FieldPolicy = {
  userConfig: 'non-sensitive',
  environment: 'literal',
  paths: 'normalized',
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
 *   A bash shell-form hook keeps `${NAME}` for the shell to read from the hook's environment, as
 *   Claude Code does (oracle 2.1.322), whatever the scope's `shellPaths`.
 * - `mcp-remote`: credential variables read as empty in `url` and `headers` (mcp.md, "Credential
 *   variables that read as empty"), `readsAsEmptyInRemoteMcp`.
 * - A hook with no `shell` field runs in PowerShell on Windows without Git Bash (hooks.md, "Exec
 *   form and shell form"); the kit cannot tell, so the caller picks `hook-shell` or `hook-powershell`.
 * - A skill's `!` command is skill content (skills.md, "Available string substitutions") that the
 *   Bash or the PowerShell tool runs ("How injected commands run"): `skill-bash` and
 *   `skill-powershell`, the text the shell receives; the permission check reads the same command
 *   as `markdown-content`.
 */
export const SURFACE_POLICY: { readonly [S in SubstitutionSurface]: FieldPolicy } = {
  'hook-exec': { userConfig: 'allow', environment: 'literal', paths: 'native' },
  'hook-shell': { userConfig: 'refuse', environment: 'literal', paths: 'shell-reference' },
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
  'markdown-content': MARKDOWN,
  'skill-bash': MARKDOWN,
  'skill-powershell': MARKDOWN,
};

/** How a POSIX shell's text carries a path under each `shellPaths`. */
const POSIX: { readonly [M in ShellPaths]: PathRendering } = {
  pasted: 'normalized',
  'environment-reference': 'shell-reference',
};

/**
 * The surfaces whose text a shell parses and where Claude Code pastes the paths, and how each writes
 * a path under the scope's `shellPaths`: a monitor `command`, an MCP `headersHelper` (components.md,
 * "Monitors"; mcp.md, "Use dynamic headers") and a skill's `!` command (skills.md, "How injected
 * commands run"), whose PowerShell reference is `${env:NAME}`. Hooks are not here: Claude Code never
 * pastes into them, a bash shell-form hook keeps `${NAME}` (oracle 2.1.322) and a PowerShell hook gets
 * `${env:NAME}` (hooks.md, "Reference scripts by path in PowerShell hooks").
 */
const SHELL_PARSED: {
  readonly [S in SubstitutionSurface]?: { readonly [M in ShellPaths]: PathRendering };
} = {
  'monitor-command': POSIX,
  'mcp-headers-helper': POSIX,
  'skill-bash': POSIX,
  'skill-powershell': { pasted: 'normalized', 'environment-reference': 'environment-reference' },
};

/** The default of `SubstitutionScope.shellPaths`: the one place it is decided (spec/judgments.md). */
const DEFAULT_SHELL_PATHS: ShellPaths = 'environment-reference';

/** The scope's `shellPaths`, or the default. */
export const shellPathsOf = (scope: Pick<SubstitutionScope, 'shellPaths'>): ShellPaths =>
  scope.shellPaths ?? DEFAULT_SHELL_PATHS;

/**
 * The policy of a surface in this scope: `SURFACE_POLICY`, with a shell-parsed surface's paths as
 * the scope's `shellPaths` make them. Every resolver asks this, so the choice is made once.
 */
export const surfacePolicy = (
  surface: SubstitutionSurface,
  scope: Pick<SubstitutionScope, 'shellPaths'>,
): FieldPolicy => {
  const rendering = SHELL_PARSED[surface];
  return rendering === undefined
    ? SURFACE_POLICY[surface]
    : { ...SURFACE_POLICY[surface], paths: rendering[shellPathsOf(scope)] };
};

/** `substituteTemplate` with the policy of a surface in this scope. */
export const substituteSurface = (
  surface: SubstitutionSurface,
  template: string,
  scope: SubstitutionScope,
  path = '',
): Promise<Substituted> => substituteTemplate(template, scope, surfacePolicy(surface, scope), path);
