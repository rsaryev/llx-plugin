import type { PluginIssue } from '../../format/issues.ts';
import type { CommandSpec, ShellKind } from '../../ports/index.ts';
import type { HookHandlerOf } from '../../protocol/hook-config.ts';
import { warning } from '../../format/issues.ts';
import { exportedEnvironment } from './exported-environment.ts';
import { fieldRunner } from './field-runner.ts';
import type { FieldPolicy, MonitorPaths, PathRendering, SubstitutionScope } from './scope.ts';
import { rejectUserConfigInShell } from './shell-guard.ts';
import { HOOK_GUARD } from './shell-guard-hook.ts';
import { substituter } from './substitute.ts';
import { SURFACE_POLICY, type Surface } from './surfaces.ts';

/** A `command` hook handler, as the official type has it. */
export type HookCommandHandler = HookHandlerOf<'command'>;

export interface HookCommandOptions {
  /** Where the hook sits, for the issues (`hooks.PostToolUse[0].hooks[1]`). Default `hook`. */
  readonly path?: string;
  /**
   * The shell a hook with no `shell` field runs in on this host. hooks.md: "Defaults to `bash`, or
   * to `powershell` on Windows when Git Bash isn't installed"; the kit cannot tell (L3), so a
   * Windows host without Git Bash says `powershell`. Default `bash`.
   */
  readonly defaultShell?: ShellKind;
  /**
   * How a bash shell-form command carries a path variable: `pasted` (the default) writes the path
   * into the command; `environment-reference` leaves `${CLAUDE_PLUGIN_ROOT}` for the shell to read
   * from the process environment, where `environment` puts it, so a folder name holding shell
   * metacharacters is never parsed as shell. Judgment (spec/judgments.md), as `monitorPaths`.
   */
  readonly shellPaths?: MonitorPaths;
}

/**
 * A command hook ready for the host's `CommandRunner` (plugins/manifest-reference.md, "Where each
 * variable resolves"; hooks.md, "Exec form and shell form"). The kit never spawns it: the host runs
 * `spec` with `environment` added to the process, in the working directory and with the timeout
 * the hooks engine decides.
 */
export interface ResolvedHookCommand {
  readonly spec: CommandSpec;
  /**
   * The three path variables and `CLAUDE_PLUGIN_OPTION_<KEY>` for every option with a value,
   * sensitive ones included, in both forms (hooks.md: "both export them ... on the spawned process").
   */
  readonly environment: Readonly<Record<string, string>>;
}

export interface HookCommandResolution {
  /** Undefined when the hook does not run. */
  readonly resolved: ResolvedHookCommand | undefined;
  readonly issues: readonly PluginIssue[];
}

/** What `shellPaths` makes of a bash command's path rendering; PowerShell's is always a reference. */
const BASH_PATHS: { readonly [M in MonitorPaths]: PathRendering } = {
  pasted: 'normalized',
  'environment-reference': 'shell-reference',
};

const shellPolicy = (shell: ShellKind, options: HookCommandOptions): FieldPolicy => {
  const policy = SURFACE_POLICY[SHELL_SURFACES[shell]];
  return shell === 'bash'
    ? { ...policy, paths: BASH_PATHS[options.shellPaths ?? 'pasted'] }
    : policy;
};

/** The surface of each shell: PowerShell rewrites the placeholders, bash gets forward slashes. */
const SHELL_SURFACES: { readonly [S in ShellKind]: Surface } = {
  bash: 'hook-shell',
  powershell: 'hook-powershell',
};

const BARE_PATH_VARIABLE = /\$(CLAUDE_PLUGIN_ROOT|CLAUDE_PLUGIN_DATA|CLAUDE_PROJECT_DIR)\b/;

/**
 * hooks.md, "Reference scripts by path in PowerShell hooks": the bare `$CLAUDE_PROJECT_DIR`
 * "parses as an undefined local variable ... Claude Code doesn't rewrite that form; it logs a
 * warning". Judgment: the same holds for the other two exported path variables.
 */
const bareVariableWarning = (command: string, path: string): PluginIssue[] => {
  const bare = BARE_PATH_VARIABLE.exec(command)?.[0];
  return bare === undefined
    ? []
    : [
        warning(
          path,
          `PowerShell reads ${bare} as an undefined local variable; write \${${bare.slice(1)}} or $env:${bare.slice(1)}`,
        ),
      ];
};

/** Per shell, what else a shell-form command is checked for. */
const SHELL_CHECKS: {
  readonly [S in ShellKind]: (command: string, path: string) => PluginIssue[];
} = {
  bash: () => [],
  powershell: bareVariableWarning,
};

const hasSeparator = (command: string): boolean => command.includes('/') || command.includes('\\');

/**
 * hooks.md, "Exec form": a `command` that is a bare name with whitespace next to `args` "logs a
 * warning because the spawn will fail"; a path ("an absolute path with spaces") does not.
 */
const bareNameWarning = (command: string, path: string): PluginIssue[] =>
  !hasSeparator(command) && /\s/.test(command)
    ? [
        warning(
          path,
          `"${command}" is not an executable: with args, command is the executable name or path only; move the extra tokens into args`,
        ),
      ]
    : [];

async function execForm(
  handler: HookCommandHandler,
  args: readonly string[],
  scope: SubstitutionScope,
  base: string,
): Promise<{ spec: CommandSpec; issues: PluginIssue[] }> {
  const run = fieldRunner(substituter(scope), base);
  const [command, list] = await Promise.all([
    run.one('hook-exec', handler.command, 'command'),
    run.list('hook-exec', args, 'args'),
  ]);
  return {
    spec: { form: 'exec', command: command.value, args: list.value },
    issues: [
      ...command.issues,
      ...list.issues,
      ...bareNameWarning(command.value, `${base}.command`),
    ],
  };
}

async function shellForm(
  handler: HookCommandHandler,
  scope: SubstitutionScope,
  options: HookCommandOptions,
  base: string,
): Promise<{ spec: CommandSpec | undefined; issues: PluginIssue[] }> {
  const path = `${base}.command`;
  const refused = rejectUserConfigInShell(
    HOOK_GUARD,
    handler.command,
    { plugin: scope.pluginId, command: handler.command },
    path,
  );
  if (refused) return { spec: undefined, issues: [refused] };
  const shell = handler.shell ?? options.defaultShell ?? 'bash';
  const command = await substituter(scope).run(handler.command, shellPolicy(shell, options), path);
  return {
    spec: { form: 'shell', command: command.text, shell },
    issues: [...command.issues, ...SHELL_CHECKS[shell](handler.command, path)],
  };
}

/**
 * Resolves one command hook of a plugin. With `args` it is exec form: `command` and each element
 * are substituted as plain strings, `${user_config.*}` included, and `shell` is ignored. Without
 * `args` it is shell form: `${user_config.*}` anywhere in `command` is an error and the hook does
 * not run, whatever is configured (the check reads the template); the way out is the
 * `CLAUDE_PLUGIN_OPTION_<KEY>` variable in `environment`, or exec form.
 */
export async function resolveHookCommand(
  handler: HookCommandHandler,
  scope: SubstitutionScope,
  options: HookCommandOptions = {},
): Promise<HookCommandResolution> {
  const base = options.path ?? 'hook';
  const { spec, issues } =
    handler.args === undefined
      ? await shellForm(handler, scope, options, base)
      : await execForm(handler, handler.args, scope, base);
  if (spec === undefined) return { resolved: undefined, issues };
  return {
    resolved: { spec, environment: await exportedEnvironment('hook-command', scope) },
    issues,
  };
}
