import type { HookEvent } from '../../../protocol/official.ts';
import type { ModelRun } from './types.ts';

/**
 * What `ok: false` of a `prompt` or `agent` hook does on each event (hooks.md, "Response schema":
 * "What happens on `ok: false` depends on the event"). The run says what the model decided; this
 * says what the event does with it, as data the interpreter turns into its outcome.
 */

/** The events that run `prompt` and `agent` hooks (`PermissionRequest`: prompt only). */
export type PromptEvent = Extract<
  HookEvent,
  | 'PermissionDenied'
  | 'PermissionRequest'
  | 'PostToolBatch'
  | 'PostToolUse'
  | 'PostToolUseFailure'
  | 'PreToolUse'
  | 'Stop'
  | 'SubagentStop'
  | 'TaskCompleted'
  | 'TaskCreated'
  | 'TeammateIdle'
  | 'UserPromptExpansion'
  | 'UserPromptSubmit'
>;

/** Where the reason goes. */
export type Delivery =
  /** "Fed back to Claude as its next instruction". */
  | 'claude-instruction'
  /** "Returned to Claude as a tool error". */
  | 'claude-tool-error'
  /** "The reason appears in the chat as a warning line". */
  | 'user-warning'
  /** "Fed back to the teammate". */
  | 'teammate';

export type OkFalseEffect =
  /** No effect: `ok: true`, or an event on which `ok: false` changes nothing. */
  | { readonly kind: 'none' }
  /** `Stop` and `SubagentStop` with `impossible: true`: "Claude Code allows the stop and the turn ends". */
  | { readonly kind: 'allow-stop' }
  | {
      readonly kind: 'block';
      readonly reason: string;
      /** The turn ends (or the teammate stops) instead of going on. */
      readonly endsTurn: boolean;
      readonly delivery: Delivery;
      /** `PreToolUse`: "the tool call is denied". */
      readonly deniesTool: boolean;
    };

/** What a rule reads: the verdict, and how the hook was configured. */
export interface OkFalseCase {
  readonly reason: string;
  /** `continueOnBlock: true` of a prompt hook, or an agent hook (it behaves as if set). */
  readonly continues: boolean;
  /** The model said `impossible` and the hook type reads it (prompt hooks only). */
  readonly impossible: boolean;
  /** `TaskCompleted` fired because a teammate stopped, not because a task was marked completed. */
  readonly teammateStopped: boolean;
}

type Rule = (found: OkFalseCase) => OkFalseEffect;

const NONE: OkFalseEffect = { kind: 'none' };

const block = (
  found: OkFalseCase,
  endsTurn: boolean,
  delivery: Delivery,
  deniesTool = false,
): OkFalseEffect => ({ kind: 'block', reason: found.reason, endsTurn, delivery, deniesTool });

/** "Fed back to Claude ... and the turn continues", or with `continueOnBlock` unset "the turn ends". */
const endsUnlessContinues =
  (delivery: Delivery, deniesTool = false): Rule =>
  (found) =>
    found.continues
      ? block(found, false, delivery, deniesTool)
      : block(found, true, 'user-warning', deniesTool);

const alwaysEnds: Rule = (found) => block(found, true, 'user-warning');
const alwaysToolError: Rule = (found) => block(found, false, 'claude-tool-error');

/**
 * `TaskCompleted`: "when it fires because a task is marked completed during a turn, the reason is
 * returned to Claude as a tool error and the turn continues, regardless of `continueOnBlock`. When
 * it fires because a teammate stops, it behaves like `TeammateIdle`".
 */
const taskCompleted: Rule = (found) =>
  found.teammateStopped ? endsUnlessContinues('teammate')(found) : alwaysToolError(found);

export const OK_FALSE_RULES: { readonly [E in PromptEvent]: Rule } = {
  Stop: (found) =>
    found.impossible ? { kind: 'allow-stop' } : block(found, false, 'claude-instruction'),
  SubagentStop: (found) =>
    found.impossible ? { kind: 'allow-stop' } : block(found, false, 'claude-instruction'),
  PreToolUse: endsUnlessContinues('claude-tool-error', true),
  PostToolUse: endsUnlessContinues('claude-instruction'),
  PostToolBatch: alwaysEnds,
  UserPromptSubmit: alwaysEnds,
  UserPromptExpansion: alwaysEnds,
  PostToolUseFailure: alwaysToolError,
  TaskCreated: alwaysToolError,
  TaskCompleted: taskCompleted,
  TeammateIdle: endsUnlessContinues('teammate'),
  // "`ok: false` has no effect" (PermissionRequest); "the denial already happened" (PermissionDenied).
  PermissionRequest: () => NONE,
  PermissionDenied: () => NONE,
};

export const isPromptEvent = (event: HookEvent): event is PromptEvent =>
  Object.hasOwn(OK_FALSE_RULES, event);

export interface OkFalseOptions {
  /** The hook is an `agent` hook: "the way it handles a prompt hook with `continueOnBlock: true`"; no `impossible`. */
  readonly agent: boolean;
  /** `continueOnBlock` of the prompt hook. */
  readonly continueOnBlock?: boolean;
  /** `TaskCompleted` only: a teammate stopping fired it. Without it the event is a `TaskUpdate`. */
  readonly teammateStopped?: boolean;
}

/** What the verdict of a prompt or agent hook does on `event`. */
export function okFalseEffect(
  event: PromptEvent,
  run: ModelRun,
  options: OkFalseOptions,
): OkFalseEffect {
  if (run.ok) return NONE;
  return OK_FALSE_RULES[event]({
    reason: run.reason ?? '',
    continues: options.agent || options.continueOnBlock === true,
    impossible: !options.agent && run.impossible === true,
    teammateStopped: options.teammateStopped === true,
  });
}
