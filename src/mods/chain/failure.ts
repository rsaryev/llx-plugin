import type { HookFailure, HookFailureKind } from '../../protocol/mods-events.ts';
import { MOD_LIMITS } from '../../protocol/mods-limits.ts';
import type { SkipKind } from '../types.ts';

/** A hook failure with the reason a skipped hook is reported under, and the class the line is shown once for. */
export interface Failure {
  readonly kind: HookFailureKind;
  /** What was thrown, or the problem with the result; a timeout has none of its own. */
  readonly message?: string;
  readonly reason: string;
  readonly skip: SkipKind;
  /** What the hook threw, as it threw it: `passesThrough` compares it with what its `next` rejected with. */
  readonly thrownValue?: unknown;
}

/** Whether a failure of this kind is the hook's time running out: `next.trace` reads `expired`. */
export const EXPIRED: { readonly [K in HookFailureKind]: boolean } = {
  throw: false,
  timeout: true,
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
    return {
      kind: 'throw',
      message: String(error),
      reason: `threw ${String(error)}`,
      skip: 'throw',
      thrownValue: error,
    };
  const name = 'name' in error && typeof error.name === 'string' ? error.name : 'Error';
  return {
    kind: 'throw',
    message: error.message,
    reason: `threw ${name}: ${error.message}`,
    skip: 'throw',
    thrownValue: error,
  };
}

const nameOf = (value: unknown): unknown =>
  isErrorLike(value) && 'name' in value ? value.name : undefined;

/** The same error, or (across a realm or a worker, where it is copied) one of its name and message. */
const sameError = (thrownValue: unknown, rejection: unknown): boolean =>
  thrownValue === rejection ||
  (isErrorLike(thrownValue) &&
    isErrorLike(rejection) &&
    thrownValue.message === rejection.message &&
    nameOf(thrownValue) === nameOf(rejection));

/**
 * Whether a throw is what the hook's last `next(e)` rejected with, let through uncaught: what runs
 * beneath the hook (Claude Code's own behaviour, or a hook below that let it through too) refused.
 */
export const passesThrough = (
  failure: Failure,
  rejected: { readonly error: unknown } | undefined,
): boolean =>
  failure.skip === 'throw' &&
  rejected !== undefined &&
  'thrownValue' in failure &&
  sameError(failure.thrownValue, rejected.error);

/**
 * The same failure, its line saying that `next(e)` rejected and the hook did not catch it, so the
 * line does not read as the hook's own error: `tool.call hook skipped: next(e) rejected and the hook
 * did not catch it: PermissionGateBlockedError: …`. Judgment (spec/judgments.md):
 * claude-code/index.d.ts:4204 skips "a hook that fails (throws, …)" and reports it "by name"; a
 * rejection let through is such a throw (troubleshoot.md, "`$.agent.register refused`": a hook
 * that "doesn't catch the rejection, it fails and Claude Code skips it"), so it stays a `throw`, its
 * `.catch` handler still answers, and only the words change.
 */
export const uncaught = (failure: Failure): Failure => ({
  ...failure,
  reason: `next(e) rejected and the hook did not catch it: ${failure.reason.slice('threw '.length)}`,
});

/** A hook that used up its own time (judgment: the docs name the kind, not the words). */
export const timedOut = (ms: number): Failure => ({
  kind: 'timeout',
  reason: `timed out: ran over its ${ms} ms limit`,
  skip: 'timeout',
});

/** The hooks of one event that used up the time they share. */
export const groupTimedOut = (event: string, ms: number): Failure => ({
  kind: 'timeout',
  reason: `timed out: the ${event} hooks ran over the ${ms} ms they share`,
  skip: 'timeout',
});

/**
 * A hook that returned a result of the wrong shape: the line reads `returned the wrong shape (the
 * rule it broke)` (troubleshoot.md, "A pane or band is empty").
 */
export function wrongShape(problem: string): Failure {
  return {
    kind: 'throw',
    message: problem,
    reason: `returned the wrong shape (${problem})`,
    skip: 'wrong-shape',
  };
}

/**
 * A hook that returned nothing (claude-code/index.d.ts:6970, `Next`: "returning nothing is a
 * failure"); the words are the kit's.
 */
export const returnedNothing = (): Failure =>
  wrongShape('it returned nothing: return next(e) or a result');

/** A hook that returned a result that is refused: nested too deep. */
export function refused(problem: string): Failure {
  return {
    kind: 'throw',
    message: problem,
    reason: `returned a result that is refused: ${problem}`,
    skip: 'wrong-shape',
  };
}

/** The text of what a hook's last `next()` rejected with. */
const rejectionText = (rejected: { readonly error: unknown } | undefined): string | undefined => {
  if (rejected === undefined) return undefined;
  return isErrorLike(rejected.error) ? rejected.error.message : String(rejected.error);
};

/**
 * What `next.error` holds (claude-code/index.d.ts:5447, `HookFailure`): the kind, the message (for a
 * timeout, what the hook's last `next()` rejected with, else none) and the handler's grace.
 */
export function toHookFailure(
  failure: Failure,
  rejected: { readonly error: unknown } | undefined,
): HookFailure {
  const message = EXPIRED[failure.kind] ? rejectionText(rejected) : failure.message;
  const budget = MOD_LIMITS.catchMs;
  return message === undefined
    ? { kind: failure.kind, budget }
    : { kind: failure.kind, message, budget };
}
