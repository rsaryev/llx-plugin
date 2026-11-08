import { warning, type PluginIssue } from '../../../format/issues.ts';
import type { CommandSpec } from '../../../ports/index.ts';
import type { HandlerEntry, RunContext } from '../context.ts';
import { handlerSubstituter } from './placeholders.ts';

/**
 * Exec form (hooks.md, "Exec form and shell form"): `args` is present, `command` is the
 * executable, each `args` element is one argument as written, and no shell tokenizes anything.
 */

/** A spec to run, or none and the issues that say why. */
export interface CommandPlan {
  readonly spec?: CommandSpec;
  readonly issues: readonly PluginIssue[];
}

/** The path of a handler's field in an issue: `hooks.PostToolUse.command`. */
export const fieldPath = (entry: HandlerEntry<'command'>, field: string): string =>
  `hooks.${entry.event}.${field}`;

const SEPARATOR = /[\\/]/;

/**
 * "If `command` is a bare name with no path separator and contains whitespace alongside `args`,
 * Claude Code logs a warning because the spawn will fail: there is no executable named
 * `node script.js`. Absolute paths with spaces, such as `C:\Program Files\nodejs\node.exe`, are a
 * single valid executable and don't trigger the warning."
 */
function bareNameWarnings(entry: HandlerEntry<'command'>, command: string): PluginIssue[] {
  return !SEPARATOR.test(command) && /\s/.test(command)
    ? [
        warning(
          fieldPath(entry, 'command'),
          `"${command}" is a bare name with whitespace and "args" is set, so no executable of that name will start. Move the extra tokens into "args".`,
        ),
      ]
    : [];
}

export async function planExecForm(
  entry: HandlerEntry<'command'>,
  args: readonly string[],
  context: RunContext,
): Promise<CommandPlan> {
  const substitute = handlerSubstituter(entry, 'hook-exec', context);
  const command = await substitute(entry.handler.command, fieldPath(entry, 'command'));
  const each = await Promise.all(
    args.map((arg, index) => substitute(arg, fieldPath(entry, `args[${index}]`))),
  );
  return {
    spec: { form: 'exec', command: command.text, args: each.map(({ text }) => text) },
    issues: [
      ...command.issues,
      ...each.flatMap(({ issues }) => issues),
      ...bareNameWarnings(entry, command.text),
    ],
  };
}
