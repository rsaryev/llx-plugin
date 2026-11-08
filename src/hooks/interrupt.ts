import type { Environment } from '../ports/index.ts';
import type { HookEvent } from '../protocol/official.ts';
import type { HookOutcome } from './outcome.ts';

/**
 * What a user's interrupt does to the hooks of an event (hooks.md, "PostToolUse after an
 * interrupt" and "`Esc` during a prompt check").
 *
 * - `PostToolUse`: `Ctrl+Enter` that ends the turn while a tool runs gives the hooks "10 seconds to
 *   finish" and kills a command hook still running then, "whatever its `timeout`"; `Enter` only
 *   queues a message, so "the hooks keep their usual `timeout`"; `Esc` cancels the hooks at once.
 *   `Ctrl+Enter` "acts as `Esc` if you queued a `!` command ahead of your messages or background
 *   tasks are disabled, for example with `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS`".
 * - `UserPromptSubmit`: an interrupt while the hooks check a prompt stops the check, the prompt
 *   does not reach Claude, and the text goes back to the input, unless a hook blocked the prompt
 *   at the same moment: then it "stays blocked" and the text does not come back.
 *
 * Judgments (spec/judgments.md): the first rule is read for `PostToolUse` only, since no other
 * event's section says so; the second is read from the request's abort signal (an interrupted
 * session aborts it) together with a hook that was cancelled by it.
 */

export const INTERRUPT_KEYS = ['esc', 'enter', 'ctrl-enter'] as const;
export type InterruptKey = (typeof INTERRUPT_KEYS)[number];

/** The key the user pressed while a tool ran, and what the host knows of what they queued. */
export interface UserInterrupt {
  readonly key: InterruptKey;
  /** A `!` shell command was queued ahead of the messages. */
  readonly queuedShellCommand?: boolean;
}

/** What the interrupt does to the hooks that have not run. */
export interface InterruptPlan {
  /** The hooks are cancelled at once, none of them runs. */
  readonly cancel: boolean;
  /** The most a hook may run, in milliseconds, whatever its `timeout`. */
  readonly capMs?: number;
}

const CTRL_ENTER_BUDGET_MS = 10_000;
const KEEP: InterruptPlan = { cancel: false };
const CANCEL: InterruptPlan = { cancel: true };

const backgroundDisabled = (environment: Environment): boolean =>
  environment.get('CLAUDE_CODE_DISABLE_BACKGROUND_TASKS')?.trim() === '1';

const PLANS: {
  readonly [K in InterruptKey]: (
    interrupt: UserInterrupt,
    environment: Environment,
  ) => InterruptPlan;
} = {
  esc: () => CANCEL,
  enter: () => KEEP,
  'ctrl-enter': (interrupt, environment) =>
    interrupt.queuedShellCommand === true || backgroundDisabled(environment)
      ? CANCEL
      : { cancel: false, capMs: CTRL_ENTER_BUDGET_MS },
};

/** The events an interrupt during a tool call changes the hooks of. */
const AFTER_TOOL: ReadonlySet<HookEvent> = new Set<HookEvent>(['PostToolUse']);

export function interruptPlan(
  event: HookEvent,
  interrupt: UserInterrupt | undefined,
  environment: Environment,
): InterruptPlan {
  return interrupt === undefined || !AFTER_TOOL.has(event)
    ? KEEP
    : PLANS[interrupt.key](interrupt, environment);
}

/** The events whose prompt check an interrupt stops. */
const PROMPT_CHECKS: ReadonlySet<HookEvent> = new Set<HookEvent>(['UserPromptSubmit']);

/**
 * An interrupt that cancelled a prompt check: the prompt does not go ahead, and its text returns to
 * the input unless a hook blocked it, in which case the block message is what the user sees.
 */
export function withInterrupt<E extends HookEvent>(
  outcome: HookOutcome<E>,
  aborted: boolean,
): HookOutcome<E> {
  const cancelled = outcome.runs.some(({ status }) => status === 'cancelled');
  if (!aborted || !cancelled || !PROMPT_CHECKS.has(outcome.event)) return outcome;
  return {
    ...outcome,
    proceed: false,
    interrupted: { restoreInput: outcome.block === undefined },
  };
}
