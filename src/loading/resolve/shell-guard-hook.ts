import type { ShellGuard } from './shell-guard.ts';

/**
 * A shell-form hook `command`, which runs through a shell (hooks.md, "Exec form and shell form";
 * errors.md, "Plugin command references user_config in a shell command"). The message is the one
 * errors.md quotes for a hook: `Hook from plugin <plugin> references ${user_config.*} in a
 * shell-form command`, the way out, and the offending template after `Command:`.
 *
 * Judgment: `<plugin>` is the plugin identifier the host uses (`name@marketplace`, or the bare
 * name), the form errors.md prints (`formatter@acme-tools`); `<command>` is the template as written.
 */
export const HOOK_GUARD: ShellGuard<{ readonly plugin: string; readonly command: string }> = {
  message: ({ plugin, command }) =>
    `Hook from plugin ${plugin} references \${user_config.*} in a shell-form command. The substituted value would be re-parsed by the shell. Use exec form instead — {"command": "<executable>", "args": ["\${user_config.KEY}", ...]} — or read $CLAUDE_PLUGIN_OPTION_<KEY> from the hook's environment. Command: ${command}`,
};
