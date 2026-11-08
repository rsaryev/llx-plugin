import type { HookFailure, HookFailureKind, ReentryCause } from '../../protocol/mods-events.ts';

/** A hook failure with the reason a skipped hook is reported under. */
export interface Failure extends HookFailure {
  readonly reason: string;
}

/**
 * Whether a failure of this kind with no `.catch` handler is reported. A hook skipped because its
 * own mod's API call fired the event is skipped quietly (judgment: events.md lists only a throw, a
 * timeout and a wrong shape under the line that names the mod).
 */
export const REPORTED: { readonly [K in HookFailureKind]: boolean } = {
  throw: true,
  timeout: true,
  're-entry': false,
};

// A guest's error is not an `Error` of this realm, so it is read by its shape.
const isErrorLike = (value: unknown): value is { name?: unknown; message: string } =>
  typeof value === 'object' &&
  value !== null &&
  'message' in value &&
  typeof value.message === 'string';

/** A hook that threw: `threw Error: boom`. */
export function thrown(error: unknown): Failure {
  if (!isErrorLike(error))
    return { kind: 'throw', message: String(error), reason: `threw ${String(error)}` };
  const name = 'name' in error && typeof error.name === 'string' ? error.name : 'Error';
  return { kind: 'throw', message: error.message, reason: `threw ${name}: ${error.message}` };
}

/** A hook that used up its own time (judgment: the docs name the kind, not the words). */
export function timedOut(ms: number): Failure {
  const message = `ran over its ${ms} ms limit`;
  return { kind: 'timeout', message, reason: `timed out: ${message}` };
}

/** The hooks of one event that used up the time they share. */
export function groupTimedOut(event: string, ms: number): Failure {
  const message = `the ${event} hooks ran over the ${ms} ms they share`;
  return { kind: 'timeout', message, reason: `timed out: ${message}` };
}

/** A hook that returned a result of the wrong shape, or one that is refused (too deeply nested). */
export function refused(problem: string): Failure {
  return {
    kind: 'throw',
    message: problem,
    reason: `returned a result that is refused: ${problem}`,
  };
}

/** A hook skipped because the event came from inside a mods API call by its own mod. */
export function reentered(plugin: string, cause: ReentryCause | undefined): Failure {
  const message = `the event came from a mods API call by ${plugin}`;
  const reason = `skipped: ${message}`;
  return cause === undefined
    ? { kind: 're-entry', message, reason }
    : { kind: 're-entry', message, cause, reason };
}

/** What `next.error` holds: the failure without its report reason. */
export const toHookFailure = (failure: Failure): HookFailure =>
  failure.cause === undefined
    ? { kind: failure.kind, message: failure.message }
    : { kind: failure.kind, message: failure.message, cause: failure.cause };
