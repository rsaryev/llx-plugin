import { error, warning, type PluginIssue } from '../../../format/issues.ts';
import { referencesUserConfig, type SubstitutionSurface } from '../../../loading/resolve/index.ts';
import type { ShellKind } from '../../../ports/index.ts';
import type { HandlerEntry, RunContext } from '../context.ts';
import { fieldPath, type CommandPlan } from './exec-form.ts';
import { handlerSubstituter } from './placeholders.ts';
import { noProgramIssue } from './powershell.ts';

/**
 * Shell form (hooks.md, "Exec form and shell form"): `args` is absent and the `command` string is
 * passed to a shell that tokenizes it, expands variables and reads pipes, `&&`, redirects and globs.
 */

const SHELL_SURFACES: { readonly [S in ShellKind]: SubstitutionSurface } = {
  bash: 'hook-shell',
  powershell: 'hook-powershell',
};

/**
 * hooks.md, "Reference scripts by path in PowerShell hooks": the bare `$CLAUDE_PROJECT_DIR` form
 * "parses as an undefined local variable" and "Claude Code doesn't rewrite that form; it logs a
 * warning". `$env:NAME` and `${env:NAME}` do not match: the `$` is followed by `env`, not the name.
 */
const BARE_VARIABLE = /\$(CLAUDE_(?:PROJECT_DIR|PLUGIN_ROOT|PLUGIN_DATA))\b/g;

function bareVariableWarnings(entry: HandlerEntry<'command'>, command: string): PluginIssue[] {
  const names = new Set([...command.matchAll(BARE_VARIABLE)].map(([, name]) => name));
  return [...names].map((name) =>
    warning(
      fieldPath(entry, 'command'),
      `$${name} is an undefined variable in PowerShell and resolves to $null. Write \${${name}} or $env:${name}.`,
    ),
  );
}

/** What each shell's own syntax gets warned about in the command text. */
const SHELL_WARNINGS: {
  readonly [S in ShellKind]: (entry: HandlerEntry<'command'>, command: string) => PluginIssue[];
} = {
  bash: () => [],
  powershell: bareVariableWarnings,
};

/**
 * errors.md, "Plugin command references user_config in a shell command": the message a shell-form
 * hook reports, with the plugin and the command template.
 */
const refusal = (pluginId: string, command: string): string =>
  `Hook from plugin ${pluginId} references \${user_config.*} in a shell-form command. ` +
  'The substituted value would be re-parsed by the shell. Use exec form instead — ' +
  '{"command": "<executable>", "args": ["${user_config.KEY}", ...]} — ' +
  `or read $CLAUDE_PLUGIN_OPTION_<KEY> from the hook's environment. Command: ${command}`;

export async function planShellForm(
  entry: HandlerEntry<'command'>,
  context: RunContext,
): Promise<CommandPlan> {
  const { pluginId } = entry;
  const { command } = entry.handler;
  // "A shell-form plugin hook whose `command` references `${user_config.*}` fails with an error
  // instead of running." The check reads the template, so it fires with nothing configured.
  if (pluginId !== undefined && referencesUserConfig(command)) {
    return { issues: [error(fieldPath(entry, 'command'), refusal(pluginId, command))] };
  }
  const shell = entry.handler.shell ?? context.defaultShell;
  const none =
    shell === 'powershell'
      ? noProgramIssue(entry, fieldPath(entry, 'command'), command)
      : undefined;
  if (none !== undefined) return { notStarted: none.message, issues: [none] };
  const text = await handlerSubstituter(
    entry,
    SHELL_SURFACES[shell],
    context,
  )(command, fieldPath(entry, 'command'));
  return {
    spec: { form: 'shell', command: text.text, shell },
    issues: [...text.issues, ...SHELL_WARNINGS[shell](entry, command)],
  };
}
