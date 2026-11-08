import type { PluginIssue } from '../format/issues.ts';
import type { HookEvent } from '../protocol/official.ts';
import type { EventFactsOf, HookSession } from './contracts.ts';
import type { UserInterrupt } from './interrupt.ts';
import type {
  BackgroundDelivery,
  BlockInfo,
  EventEffects,
  Feedback,
  HandlerStatus,
  BlockVia,
  HookNotice,
} from './verdict/types.ts';

/** A short record of one handler's run for the host's log. */
export interface HandlerRun {
  readonly handlerId: string;
  readonly status: HandlerStatus;
  readonly via?: BlockVia;
}

export interface DispatchRequest<E extends HookEvent> {
  readonly event: E;
  readonly facts: EventFactsOf<E>;
  readonly session: HookSession;
  readonly signal: AbortSignal;
  /** The key the user pressed while a tool ran (`PostToolUse` only: docs/API.md, "How a run is read"). */
  readonly interrupt?: UserInterrupt;
  /**
   * `TaskCompleted` only: what fired it (hooks.md, "TaskCompleted"): `task-update`, an agent marking
   * a task completed through the `TaskUpdate` tool, or `teammate-turn`, a teammate finishing its turn
   * with in-progress tasks. The input does not say; without it `effects.stopCondition` tells the host
   * where `continue: false` holds.
   */
  readonly taskCompletedBy?: 'task-update' | 'teammate-turn';
}

/** What an event came to, merged over every handler that ran. */
export interface HookOutcome<E extends HookEvent> {
  readonly event: E;
  /** `false`: the guarded action must not happen. */
  readonly proceed: boolean;
  readonly block?: BlockInfo & { readonly by: string };
  /**
   * `UserPromptSubmit`: the user interrupted while the hooks checked the prompt. The prompt did not
   * reach Claude (`proceed` is `false`); `restoreInput` says the text goes back to the input, which
   * it does not when a hook blocked the prompt at the same moment.
   */
  readonly interrupted?: { readonly restoreInput: boolean };
  readonly continue: boolean;
  readonly stopReason?: string;
  readonly systemMessages: readonly string[];
  readonly additionalContext: readonly string[];
  readonly effects: EventEffects;
  readonly terminalSequences: readonly string[];
  readonly notices: readonly HookNotice[];
  readonly feedback: readonly Feedback[];
  /** The stdout of each `WorktreeCreate` command hook that exited 0, in handler order. */
  readonly stdout: readonly string[];
  readonly runs: readonly HandlerRun[];
  /** Ids the session removes: skill-frontmatter `once: true` hooks that ran successfully. */
  readonly consumedOnce: readonly string[];
  readonly background: readonly Promise<BackgroundDelivery>[];
  readonly issues: readonly PluginIssue[];
}
