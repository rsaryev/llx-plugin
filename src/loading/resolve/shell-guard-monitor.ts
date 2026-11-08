import type { ShellGuard } from './shell-guard.ts';

/**
 * A monitor `command`, which runs through a shell (plugins/components.md, "Monitors"; errors.md,
 * "Plugin command references user_config in a shell command"). The message is the one errors.md
 * quotes for a monitor: `Monitor "<name>" from plugin <plugin> references ${user_config.*} in its
 * command` followed by the explanation.
 *
 * Judgment: `<plugin>` is the plugin identifier the host uses (`name@marketplace`, or the bare name),
 * the form the shell-form hook message of the same page shows (`formatter@acme-tools`); the monitor
 * example prints a name with no marketplace, which a bare identifier gives too.
 */
export const MONITOR_GUARD: ShellGuard<{ readonly monitor: string; readonly plugin: string }> = {
  message: ({ monitor, plugin }) =>
    `Monitor "${monitor}" from plugin ${plugin} references \${user_config.*} in its command. The substituted value would be passed to a shell. Monitor commands cannot safely reference \${user_config.*}; have the monitor script read the value from a config file or prompt instead.`,
};
