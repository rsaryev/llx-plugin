import type { PluginIssue } from '../../format/issues.ts';
import type { CommandSpec, ShellKind } from '../../ports/index.ts';
import type { HookHandlerOf } from '../../protocol/hook-config.ts';
import { warning } from '../../format/issues.ts';
import { exportedEnvironment } from './exported-environment.ts';
import { noProgramIssue } from './powershell-no-program.ts';
import type { FieldPolicy, SubstitutionScope } from './scope.ts';
import { rejectUserConfigInShell } from './shell-guard.ts';
import { HOOK_GUARD } from './shell-guard-hook.ts';
import { substituter, type Substituter } from './substituter.ts';
import { surfacePolicy, type SubstitutionSurface } from './surfaces.ts';

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
   * False for a hook of no plugin (settings, a skill's frontmatter): `${user_config.*}` stays as
   * written in both forms, shell form is not refused for it (plugins/manifest-reference.md:
   * "Plugin hooks additionally substitute `${user_config.*}` values"), and `environment` holds only
   * `CLAUDE_PROJECT_DIR`. Default true.
   */
  readonly ofPlugin?: boolean;
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
   * sensitive ones included, in both forms (only `CLAUDE_PROJECT_DIR` for a hook of no plugin) (hooks.md: "both export them ... on the spawned process").
   */
  readonly environment: Readonly<Record<string, string>>;
}

export interface HookCommandResolution {
  /** Undefined when the hook does not run. */
  readonly resolved: ResolvedHookCommand | undefined;
  /**
   * Set when the hook runs but would start no program (`NO_PROGRAM`): the run is a failure to
   * start, with this message. Undefined for a hook that resolved or was refused.
   */
  readonly notStarted?: string;
  readonly issues: readonly PluginIssue[];
}

interface Plan {
  readonly spec?: CommandSpec;
  readonly notStarted?: string;
  readonly issues: PluginIssue[];
}

/** The surface of each shell: PowerShell rewrites the placeholders, bash gets forward slashes. */
const SHELL_SURFACES: { readonly [S in ShellKind]: SubstitutionSurface } = {
  bash: 'hook-shell',
  powershell: 'hook-powershell',
};

/**
 * The policy of one surface for this hook: the scope's `shellPaths` sets a bash command's path
 * rendering (`surfacePolicy`; PowerShell's is always a reference), and a hook of no plugin keeps
 * `${user_config.*}` as written.
 */
function policyOf(surface: SubstitutionSurface, run: Run): FieldPolicy {
  const policy = surfacePolicy(surface, run.scope);
  return run.options.ofPlugin === false ? { ...policy, userConfig: 'refuse' } : policy;
}

/**
 * hooks.md, "Reference scripts by path in PowerShell hooks": the bare `$CLAUDE_PROJECT_DIR` form
 * "parses as an undefined local variable" and "Claude Code doesn't rewrite that form; it logs a
 * warning". `$env:NAME` and `${env:NAME}` do not match: the `$` is followed by `env`, not the name.
 * Judgment: the same holds for the other two exported path variables; each name is reported once.
 */
const BARE_VARIABLE = /\$(CLAUDE_(?:PROJECT_DIR|PLUGIN_ROOT|PLUGIN_DATA))\b/g;

function bareVariableWarnings(command: string, path: string): PluginIssue[] {
  const names = new Set([...command.matchAll(BARE_VARIABLE)].map(([, name]) => name));
  return [...names].map((name) =>
    warning(
      path,
      `$${name} is an undefined variable in PowerShell and resolves to $null. Write \${${name}} or $env:${name}.`,
    ),
  );
}

/** Per shell, what else a shell-form command is checked for. */
const SHELL_CHECKS: {
  readonly [S in ShellKind]: (command: string, path: string) => PluginIssue[];
} = {
  bash: () => [],
  powershell: bareVariableWarnings,
};

const SEPARATOR = /[\\/]/;

/**
 * hooks.md, "Exec form": "If `command` is a bare name with no path separator and contains
 * whitespace alongside `args`, Claude Code logs a warning because the spawn will fail"; an
 * absolute path with spaces is "a single valid executable" and does not warn.
 */
const bareNameWarning = (command: string, path: string): PluginIssue[] =>
  !SEPARATOR.test(command) && /\s/.test(command)
    ? [
        warning(
          path,
          `"${command}" is a bare name with whitespace and "args" is set, so no executable of that name will start. Move the extra tokens into "args".`,
        ),
      ]
    : [];

/** One hook being resolved: its scope, the one substituter, the options and the issue path. */
interface Run {
  readonly scope: SubstitutionScope;
  readonly substitution: Substituter;
  readonly options: HookCommandOptions;
  readonly base: string;
}

async function execForm(
  handler: HookCommandHandler,
  args: readonly string[],
  run: Run,
): Promise<Plan> {
  const { substitution, base } = run;
  const policy = policyOf('hook-exec', run);
  const [command, each] = await Promise.all([
    substitution.run(handler.command, policy, `${base}.command`),
    Promise.all(args.map((arg, index) => substitution.run(arg, policy, `${base}.args[${index}]`))),
  ]);
  return {
    spec: { form: 'exec', command: command.text, args: each.map(({ text }) => text) },
    issues: [
      ...command.issues,
      ...each.flatMap(({ issues }) => issues),
      ...bareNameWarning(command.text, `${base}.command`),
    ],
  };
}

/** The errors.md refusal of a plugin's shell-form `${user_config.*}`, read from the template. */
const refusalOf = (
  handler: HookCommandHandler,
  scope: SubstitutionScope,
  options: HookCommandOptions,
  path: string,
): PluginIssue | undefined =>
  options.ofPlugin === false
    ? undefined
    : rejectUserConfigInShell(
        HOOK_GUARD,
        handler.command,
        { plugin: scope.pluginId, command: handler.command },
        path,
      );

async function shellForm(handler: HookCommandHandler, run: Run): Promise<Plan> {
  const { scope, substitution, options, base } = run;
  const path = `${base}.command`;
  const refused = refusalOf(handler, scope, options, path);
  if (refused) return { issues: [refused] };
  const shell = handler.shell ?? options.defaultShell ?? 'bash';
  const none = noProgramIssue(shell, handler.shell, path, handler.command);
  if (none) return { notStarted: none.message, issues: [none] };
  const policy = policyOf(SHELL_SURFACES[shell], run);
  const command = await substitution.run(handler.command, policy, path);
  return {
    spec: { form: 'shell', command: command.text, shell },
    issues: [...command.issues, ...SHELL_CHECKS[shell](handler.command, path)],
  };
}

/**
 * What the process gets: a plugin's hook the three path variables and its options; a hook of no
 * plugin only `CLAUDE_PROJECT_DIR`, since it has no plugin folder, data folder or options.
 */
const environmentOf = async ({
  scope,
  substitution,
  options,
}: Run): Promise<Record<string, string>> =>
  options.ofPlugin === false
    ? { CLAUDE_PROJECT_DIR: await substitution.variable('CLAUDE_PROJECT_DIR') }
    : exportedEnvironment('hook-command', scope, substitution);

/**
 * Resolves one command hook. With `args` it is exec form: `command` and each element are
 * substituted as plain strings, `${user_config.*}` included, and `shell` is ignored. Without `args`
 * it is shell form: in a plugin's hook `${user_config.*}` anywhere in `command` is an error and the
 * hook does not run, whatever is configured (the check reads the template); the way out is the
 * `CLAUDE_PLUGIN_OPTION_<KEY>` variable in `environment`, or exec form. A command PowerShell would
 * only print does not start (`notStarted`).
 */
export async function resolveHookCommand(
  handler: HookCommandHandler,
  scope: SubstitutionScope,
  options: HookCommandOptions = {},
): Promise<HookCommandResolution> {
  // One substituter for the command and the environment: the data folder is asked for once.
  const substitution = substituter(scope);
  const run: Run = { scope, substitution, options, base: options.path ?? 'hook' };
  const { spec, ...rest } =
    handler.args === undefined
      ? await shellForm(handler, run)
      : await execForm(handler, handler.args, run);
  if (spec === undefined) return { resolved: undefined, ...rest };
  return { resolved: { spec, environment: await environmentOf(run) }, issues: rest.issues };
}
