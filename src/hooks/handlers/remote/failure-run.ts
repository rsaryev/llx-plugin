import { error, type PluginIssue } from '../../../format/issues.ts';
import type { PortFailure } from '../../../ports/index.ts';
import type { HookHandlerType } from '../../../protocol/hook-config.ts';
import type { RegisteredHandler } from '../../contracts.ts';
import type { HandlerResult, RawRun } from '../context.ts';

/**
 * What a port's `PortFailure` is to a hook run. "Timeout: the hook is canceled, as described under
 * Timeouts", so a `timeout` is the shared `timed-out` run; an `aborted` request is a session abort,
 * the shared `cancelled` run. Any other failure is the type's own non-blocking failure, which the
 * caller names.
 */
export function failureRun(failure: PortFailure, other: (message: string) => RawRun): RawRun {
  if (failure.failure === 'timeout') return { kind: 'timed-out' };
  if (failure.failure === 'aborted') return { kind: 'cancelled' };
  return other(failure.message);
}

/** The path of a handler's field in an issue: `hooks.PostToolUse.url`. */
export const remotePath = (entry: RegisteredHandler, field: string): string =>
  `hooks.${entry.event}.${field}`;

/**
 * A hook whose port the host did not give does not run: "a missing port is a `PluginIssue` for the
 * component that needed it" (docs/ARCHITECTURE.md, "Ports").
 */
export function withoutPort(
  entry: RegisteredHandler,
  type: HookHandlerType,
  port: string,
): HandlerResult {
  const message = `A ${type} hook needs the host's ${port}, which it did not give: the hook does not run.`;
  const issues: readonly PluginIssue[] = [error(remotePath(entry, 'type'), message)];
  return { run: { kind: 'skipped', reason: message }, issues };
}
