import type { HandlerVerdict, BlockInfo, BlockVia } from './types.ts';
import { EXIT2_RULES } from './exit2.ts';
import {
  failedBlocking,
  handlerLabel,
  hookError,
  hookName,
  timedOutBlocking,
  timedOutBlocksSwitch,
  windowsBlocking,
} from './notices.ts';
import type { Subject } from './subject.ts';

/**
 * A hook that fails (hooks.md, "Block the action when a hook fails"): "Each of these counts as a
 * failure": a command hook that can't start, an exit code other than 0 or 2, an HTTP error, a
 * timeout, invalid output. Without `onFailure: "block"` a failure is a non-blocking error and "the
 * action goes ahead"; with it "a failure does what exit code 2 does on that event, except on
 * `PermissionRequest`, where it denies the request".
 */

export const FAILURE_CAUSES = [
  'cannot-start',
  'other-exit',
  'http-error',
  'timeout',
  'invalid-output',
  /** An `mcp_tool` hook's tool answered `isError: true` (no `onFailure` on that type). */
  'tool-error',
] as const;
export type FailureCause = (typeof FAILURE_CAUSES)[number];

export interface Failure {
  readonly cause: FailureCause;
  /** What the notice of a non-blocking error carries. */
  readonly text: string;
  /** The hook's own error output, which follows `failed; blocking because ...`. */
  readonly detail: string;
}

/** The `onFailure` of a `command` or `http` hook; the other types have no such field. */
const onFailureOf = (subject: Subject): 'continue' | 'block' | undefined => {
  const { handler } = subject.entry;
  return 'onFailure' in handler ? handler.onFailure : undefined;
};

/**
 * "On Windows without Git Bash, a shell-form `PreToolUse` or `PermissionRequest` command hook that
 * fails with `onFailure` unset can instead block the tool call": without Git Bash "any exit code
 * other than 0 or 2 from that hook counts as a failure". A hook in exec form (`args` set) is not
 * one: "Claude Code then starts the program with no shell".
 */
const WINDOWS_GATES: ReadonlySet<string> = new Set(['PreToolUse', 'PermissionRequest']);

const isWindowsGate = (subject: Subject): boolean => {
  const { handler } = subject.entry;
  return (
    subject.gitBashMissing &&
    WINDOWS_GATES.has(subject.event) &&
    'command' in handler &&
    handler.args === undefined &&
    onFailureOf(subject) === undefined
  );
};

/**
 * "Background command hooks: command hooks that set `async` or `asyncRewake`": `onFailure` has no
 * effect on them.
 */
const runsInBackground = (subject: Subject): boolean => {
  const { handler } = subject.entry;
  return 'async' in handler && Boolean(handler.async || handler.asyncRewake);
};

/**
 * `onFailure: "block"` is set and takes effect on this hook: not on the events whose exit 2 keeps
 * Claude working (`Stop`, `SubagentStop`, `TaskCompleted`, `TeammateIdle`) and not on background hooks.
 */
export const onFailureBlocks = (subject: Subject): boolean =>
  (onFailureOf(subject) === 'block' || isWindowsGate(subject)) &&
  EXIT2_RULES[subject.event].ignoresOnFailure !== true &&
  !runsInBackground(subject);

const viaOf = (failure: Failure): BlockVia => (failure.cause === 'timeout' ? 'timeout' : 'failure');

interface Resolution {
  /** The text of the hook error line. */
  readonly message: string;
  readonly reason: string;
}

const lineOf = (subject: Subject, reason: string): Resolution => ({
  reason,
  message: hookError(
    hookName(subject.event, subject.toolName),
    handlerLabel(subject.entry.handler),
    reason,
  ),
});

const blockInfo = (
  subject: Subject,
  failure: Failure,
  reason: string,
  conditional: boolean,
): BlockInfo => ({
  via: viaOf(failure),
  ...lineOf(subject, reason),
  ...(conditional ? { condition: 'worktree-directory-remains' as const } : {}),
});

/** The text a failure that blocks carries: `failed; blocking because onFailure is "block"` and the detail. */
function blockingText(subject: Subject, failure: Failure): string {
  if (isWindowsGate(subject)) return windowsBlocking(failure.detail);
  return failure.cause === 'timeout'
    ? timedOutBlocking(failure.detail)
    : failedBlocking(failure.detail);
}

const base = (subject: Subject) => ({
  handler: subject.entry,
  succeeded: false,
  issues: [],
});

/** "On PreModelSwitch, a hook canceled at its timeout blocks the model switch." Judgment: an explicit `onFailure: "continue"` lets it go ahead. */
const blocksSwitch = (subject: Subject, failure: Failure): boolean =>
  EXIT2_RULES[subject.event].timeoutBlocks === true &&
  failure.cause === 'timeout' &&
  onFailureOf(subject) !== 'continue';

/** `onFailure: "block"` where the event can be blocked, or where it denies (`PermissionRequest`). */
function blocksByOnFailure(subject: Subject): boolean {
  const rule = EXIT2_RULES[subject.event];
  return (
    onFailureBlocks(subject) &&
    (rule.canBlock || rule.failureDenies === true) &&
    rule.cannotBlockWhen?.(subject.facts) !== true
  );
}

/** The kind of block a failure comes to on this event, if any. */
function blockFor(subject: Subject, failure: Failure): BlockInfo | undefined {
  const rule = EXIT2_RULES[subject.event];
  const conditional = rule.blocksUnlessDirectoryGone === true;
  // "Except on events with their own failure contract in the per-event table, such as WorktreeCreate".
  if (rule.anyNonZeroBlocks === true) {
    return blockInfo(subject, failure, failure.detail || failure.text, conditional);
  }
  if (blocksByOnFailure(subject)) {
    return blockInfo(subject, failure, blockingText(subject, failure), conditional);
  }
  return blocksSwitch(subject, failure)
    ? blockInfo(subject, failure, timedOutBlocksSwitch(failure.detail), false)
    : undefined;
}

/**
 * `onFailure: "block"` on an event where exit 2 only shows stderr (`PostToolUse`): the failure does
 * what exit 2 does there, which is the channel of the table's row.
 */
function failureAsExit2Feedback(subject: Subject, failure: Failure): HandlerVerdict | undefined {
  const rule = EXIT2_RULES[subject.event];
  if (!onFailureBlocks(subject) || rule.canBlock || rule.failureDenies === true) return undefined;
  const { message } = lineOf(subject, blockingText(subject, failure));
  const handlerId = subject.entry.id;
  if (rule.stderr === 'claude') {
    return {
      ...base(subject),
      status: 'non-blocking-error',
      feedback: { handlerId, to: 'claude', text: message },
    };
  }
  if (rule.stderr === 'user') {
    return { ...base(subject), status: 'non-blocking-error', notice: { handlerId, message } };
  }
  return { ...base(subject), status: 'non-blocking-error' };
}

/** What a failed run comes to. */
export function failureVerdict(subject: Subject, failure: Failure): HandlerVerdict {
  const block = blockFor(subject, failure);
  if (block !== undefined) return { ...base(subject), status: 'blocked', block };
  const feedback = failureAsExit2Feedback(subject, failure);
  if (feedback !== undefined) return feedback;
  const { message } = lineOf(subject, failure.text);
  return {
    ...base(subject),
    status: failure.cause === 'timeout' ? 'timed-out' : 'non-blocking-error',
    notice: { handlerId: subject.entry.id, message },
  };
}
