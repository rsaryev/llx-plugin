import type { z } from 'zod';
import type { HookEvent } from '../../protocol/official.ts';
import type { Assert, Equal } from '../../protocol/type-equality.ts';
import type { EventFactsOf } from '../contracts.ts';
import * as agents from './facts-agents.ts';
import * as misc from './facts-misc.ts';
import * as model from './facts-model.ts';
import * as session from './facts-session.ts';
import * as tools from './facts-tools.ts';

/**
 * The schema of the facts of every event, typed over the official `HookEvent` union: an event
 * the SDK adds is a compile error here until it has a schema.
 */
const FACT_SCHEMAS = {
  PreToolUse: tools.PreToolUseFacts,
  PostToolUse: tools.PostToolUseFacts,
  PostToolUseFailure: tools.PostToolUseFailureFacts,
  PostToolBatch: tools.PostToolBatchFacts,
  Notification: misc.NotificationFacts,
  UserPromptSubmit: session.UserPromptSubmitFacts,
  UserPromptExpansion: session.UserPromptExpansionFacts,
  SessionStart: session.SessionStartFacts,
  SessionEnd: session.SessionEndFacts,
  Stop: agents.StopFacts,
  StopFailure: agents.StopFailureFacts,
  SubagentStart: agents.SubagentStartFacts,
  SubagentStop: agents.SubagentStopFacts,
  PreCompact: session.PreCompactFacts,
  PostCompact: session.PostCompactFacts,
  PreModelSwitch: model.PreModelSwitchFacts,
  PostModelSwitch: model.PostModelSwitchFacts,
  PermissionRequest: tools.PermissionRequestFacts,
  PermissionDenied: tools.PermissionDeniedFacts,
  Setup: session.SetupFacts,
  TeammateIdle: agents.TeammateIdleFacts,
  TaskCreated: agents.TaskCreatedFacts,
  TaskCompleted: agents.TaskCompletedFacts,
  Elicitation: misc.ElicitationFacts,
  ElicitationResult: misc.ElicitationResultFacts,
  ConfigChange: misc.ConfigChangeFacts,
  WorktreeCreate: misc.WorktreeCreateFacts,
  WorktreeRemove: misc.WorktreeRemoveFacts,
  InstructionsLoaded: misc.InstructionsLoadedFacts,
  CwdChanged: misc.CwdChangedFacts,
  FileChanged: misc.FileChangedFacts,
  DirectoryAdded: misc.DirectoryAddedFacts,
  MessageDisplay: session.MessageDisplayFacts,
} as const satisfies { readonly [E in HookEvent]: z.ZodType<EventFactsOf<E>> };

type Output<E extends HookEvent> = z.output<(typeof FACT_SCHEMAS)[E]>;
type CoversSdk<E extends HookEvent> = [Output<E>] extends [EventFactsOf<E>]
  ? [EventFactsOf<E>] extends [Output<E>]
    ? true
    : false
  : false;

/** @public Drift guard: no schema is narrower than the SDK's input (an enum value it adds). */
export type FactSchemasCoverSdk = Assert<
  Equal<{ readonly [E in HookEvent]: CoversSdk<E> }[HookEvent], true>
>;

/** The schema of `event`'s facts, typed for them: each entry of the registry satisfies its own event. */
export const factSchemaOf = <E extends HookEvent>(event: E): z.ZodType<EventFactsOf<E>> =>
  FACT_SCHEMAS[event] as z.ZodType<EventFactsOf<E>>;
