import type { PluginIssue } from '../format/issues.ts';
import type { HookEvent } from '../protocol/official.ts';
import type { EventFactsOf, HookSession } from './contracts.ts';
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
}

/** What an event came to, merged over every handler that ran. */
export interface HookOutcome<E extends HookEvent> {
  readonly event: E;
  /** `false`: the guarded action must not happen. */
  readonly proceed: boolean;
  readonly block?: BlockInfo & { readonly by: string };
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
