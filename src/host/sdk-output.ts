import { defined } from '../format/defined.ts';
import { worktreeCandidate, type HookOutcome } from '../hooks/index.ts';
import type { EventWithSpecificOutput, HookSpecificOutputOf } from '../protocol/hook-events.ts';
import type {
  HookEvent,
  HookPermissionDecision,
  SyncHookJSONOutput,
} from '../protocol/official.ts';

/**
 * A merged `HookOutcome` as the JSON a Claude Agent SDK hook callback returns (agent-sdk/hooks.md,
 * "Outputs": "SDK callback hooks use the same JSON output format as Claude Code shell command
 * hooks"). The kit has already merged the plugins' hooks of the event into one outcome; this writes
 * that outcome back as one hook's answer, each field typed by the SDK's own output types.
 *
 * Judgment (spec/judgments.md): several hooks' `additionalContext` and `systemMessage` texts are
 * joined with a newline, terminal sequences with nothing; what the SDK output has no field for
 * (`PreCompact` instructions, background deliveries, notices) stays on the outcome for the host.
 */

type AnyOutcome = HookOutcome<HookEvent>;

/** What an event's `hookSpecificOutput` is; `never` for an event that has none. */
type SpecificOf<E extends HookEvent> = E extends EventWithSpecificOutput
  ? HookSpecificOutputOf<E>
  : never;

const joined = (texts: readonly string[], separator: string): string | undefined =>
  texts.length === 0 ? undefined : texts.join(separator);

const contextOf = (outcome: AnyOutcome): string | undefined =>
  joined(outcome.additionalContext, '\n');

/** A hook held the action back by its decision or exit code, not by `continue: false`. */
const blocksBy = (outcome: AnyOutcome): boolean =>
  outcome.block !== undefined && outcome.block.via !== 'continue-false';

/** The text of a block `blocksBy` counts, when it has one (it is empty when routed to no one). */
const reasonOf = (outcome: AnyOutcome): string | undefined =>
  blocksBy(outcome) && outcome.block !== undefined && outcome.block.reason.length > 0
    ? outcome.block.reason
    : undefined;

/** An event whose `hookSpecificOutput` has only `additionalContext`. */
const contextOnly =
  <E extends EventWithSpecificOutput>(event: E) =>
  (outcome: AnyOutcome) => ({
    hookEventName: event,
    ...defined({ additionalContext: contextOf(outcome) }),
  });

const none = (): undefined => undefined;

/** A blocking hook (exit 2) on a gate is a deny, as `permissionDecision` says it. */
const gateDecision = (outcome: AnyOutcome): HookPermissionDecision | undefined =>
  outcome.effects.permissionDecision ?? (blocksBy(outcome) ? 'deny' : undefined);

/** `PreModelSwitch` takes no `defer`. */
const MODEL_DECISION: {
  readonly [
    D in HookPermissionDecision
  ]: HookSpecificOutputOf<'PreModelSwitch'>['permissionDecision'];
} = { allow: 'allow', deny: 'deny', ask: 'ask', defer: undefined };

const watchPathsOf = (outcome: AnyOutcome): string[] | undefined =>
  outcome.effects.watchPaths === undefined ? undefined : [...outcome.effects.watchPaths];

function permissionRequestOf(
  outcome: AnyOutcome,
): HookSpecificOutputOf<'PermissionRequest'> | undefined {
  const decision =
    outcome.effects.permissionRequest ??
    (blocksBy(outcome)
      ? { behavior: 'deny' as const, message: reasonOf(outcome) ?? '' }
      : undefined);
  return decision === undefined ? undefined : { hookEventName: 'PermissionRequest', decision };
}

function worktreeOf(outcome: AnyOutcome): HookSpecificOutputOf<'WorktreeCreate'> | undefined {
  const worktreePath = worktreeCandidate(outcome);
  return worktreePath === undefined ? undefined : { hookEventName: 'WorktreeCreate', worktreePath };
}

const elicitationOf =
  <E extends 'Elicitation' | 'ElicitationResult'>(event: E) =>
  (outcome: AnyOutcome) => ({
    hookEventName: event,
    ...defined({
      action: outcome.effects.elicitation?.action,
      content: outcome.effects.elicitation?.content,
    }),
  });

/** Every official event, so an event the SDK adds is a compile error here until it is written. */
const SPECIFIC: {
  readonly [E in HookEvent]: (outcome: AnyOutcome) => SpecificOf<E> | undefined;
} = {
  PreToolUse: (outcome) => ({
    hookEventName: 'PreToolUse',
    ...defined({
      permissionDecision: gateDecision(outcome),
      permissionDecisionReason: outcome.effects.permissionDecisionReason ?? reasonOf(outcome),
      updatedInput: outcome.effects.updatedInput,
      additionalContext: contextOf(outcome),
    }),
  }),
  PreModelSwitch: (outcome) => {
    const decision = gateDecision(outcome);
    return {
      hookEventName: 'PreModelSwitch',
      ...defined({
        permissionDecision: decision === undefined ? undefined : MODEL_DECISION[decision],
        permissionDecisionReason: outcome.effects.permissionDecisionReason ?? reasonOf(outcome),
      }),
    };
  },
  PermissionRequest: permissionRequestOf,
  PostToolUse: (outcome) => ({
    hookEventName: 'PostToolUse',
    ...defined({
      additionalContext: contextOf(outcome),
      classifierContext: outcome.effects.classifierContext,
      updatedToolOutput: outcome.effects.updatedToolOutput,
    }),
  }),
  SessionStart: (outcome) => ({
    hookEventName: 'SessionStart',
    ...defined({
      additionalContext: contextOf(outcome),
      initialUserMessage: outcome.effects.initialUserMessage,
      sessionTitle: outcome.effects.sessionTitle,
      watchPaths: watchPathsOf(outcome),
      reloadSkills: outcome.effects.reloadSkills,
    }),
  }),
  UserPromptSubmit: (outcome) => ({
    hookEventName: 'UserPromptSubmit',
    ...defined({
      additionalContext: contextOf(outcome),
      sessionTitle: outcome.effects.sessionTitle,
      suppressOriginalPrompt: outcome.effects.suppressOriginalPrompt,
    }),
  }),
  UserPromptExpansion: (outcome) => ({
    hookEventName: 'UserPromptExpansion',
    ...defined({
      additionalContext: contextOf(outcome),
      suppressOriginalPrompt: outcome.effects.suppressOriginalPrompt,
    }),
  }),
  CwdChanged: (outcome) => ({
    hookEventName: 'CwdChanged',
    ...defined({ watchPaths: watchPathsOf(outcome) }),
  }),
  FileChanged: (outcome) => ({
    hookEventName: 'FileChanged',
    ...defined({ watchPaths: watchPathsOf(outcome) }),
  }),
  MessageDisplay: (outcome) => ({
    hookEventName: 'MessageDisplay',
    ...defined({ displayContent: outcome.effects.displayContent }),
  }),
  PermissionDenied: (outcome) => ({
    hookEventName: 'PermissionDenied',
    ...defined({ retry: outcome.effects.retry }),
  }),
  Elicitation: elicitationOf('Elicitation'),
  ElicitationResult: elicitationOf('ElicitationResult'),
  WorktreeCreate: worktreeOf,
  Notification: contextOnly('Notification'),
  PostModelSwitch: contextOnly('PostModelSwitch'),
  PostToolBatch: contextOnly('PostToolBatch'),
  PostToolUseFailure: contextOnly('PostToolUseFailure'),
  Setup: contextOnly('Setup'),
  Stop: contextOnly('Stop'),
  SubagentStart: contextOnly('SubagentStart'),
  SubagentStop: contextOnly('SubagentStop'),
  SessionEnd: none,
  StopFailure: none,
  PreCompact: none,
  PostCompact: none,
  TeammateIdle: none,
  TaskCreated: none,
  TaskCompleted: none,
  ConfigChange: none,
  WorktreeRemove: none,
  InstructionsLoaded: none,
  DirectoryAdded: none,
};

/** The outcome of the plugins' hooks of one event as the answer of one SDK hook callback. */
export function toSdkHookOutput(outcome: AnyOutcome): SyncHookJSONOutput {
  return defined({
    continue: outcome.continue ? undefined : false,
    stopReason: outcome.stopReason,
    systemMessage: joined(outcome.systemMessages, '\n'),
    terminalSequence: joined(outcome.terminalSequences, ''),
    decision: blocksBy(outcome) ? ('block' as const) : undefined,
    reason: reasonOf(outcome),
    hookSpecificOutput: SPECIFIC[outcome.event](outcome),
  });
}
