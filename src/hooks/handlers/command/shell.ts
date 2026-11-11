import type { ShellKind } from '../../../ports/index.ts';
import type { HandlerEntry, RunContext } from '../context.ts';

/**
 * The shell a command hook runs in, or none: "A command hook runs as exec form when `args` is set",
 * and exec form has no shell; shell form runs in the hook's `shell`, else the host's default
 * (hooks.md, "Exec form and shell form"; "Command hook fields", `shell`).
 */
export const shellOf = (
  entry: HandlerEntry<'command'>,
  context: Pick<RunContext, 'defaultShell'>,
): ShellKind | undefined =>
  entry.handler.args === undefined ? (entry.handler.shell ?? context.defaultShell) : undefined;
