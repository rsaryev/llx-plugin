import type { PluginIssue } from '../../format/issues.ts';
import { warning } from '../../format/issues.ts';
import type { HookEvent } from '../../protocol/official.ts';
import { EXIT2_RULES } from '../verdict/exit2.ts';
import type { MergedBlock, MergedOutput, TaggedOutput } from '../verdict/types.ts';
import { OUTPUT_CAPS } from './caps.ts';
import { textIn } from './fields.ts';
import { routeMessages } from './messages.ts';
import { checkOutput } from './parse.ts';
import { mergePermissionRequest, mergePreModelSwitch, mergePreToolUse } from './merge-gates.ts';
import { NOTHING, eventSet, type Merger, type Read } from './merge-rules.ts';
import {
  mergeDisplay,
  mergeElicitation,
  mergePostToolUse,
  mergePreCompact,
  mergeRetry,
  mergeSessionStart,
  mergeStop,
  mergeUserPrompt,
  mergeWatchList,
  mergeWorktreeCreate,
} from './merge-simple.ts';
import { allowedTerminalSequence } from './terminal-sequence.ts';

/**
 * The merge of every hook's output on one event (hooks.md, "JSON output", "Decision control"):
 * what each event honours (`OUTPUT_CAPS`), the universal fields, the context every hook adds, and
 * the event's own rule from `MERGERS`.
 */

/** The merge rule of each event; an event that only adds context has none beyond the common part. */
const MERGERS: { readonly [E in HookEvent]: Merger } = {
  PreToolUse: mergePreToolUse,
  PostToolUse: mergePostToolUse,
  PostToolUseFailure: () => NOTHING,
  PostToolBatch: () => NOTHING,
  Notification: () => NOTHING,
  UserPromptSubmit: mergeUserPrompt,
  UserPromptExpansion: mergeUserPrompt,
  SessionStart: mergeSessionStart,
  SessionEnd: () => NOTHING,
  Stop: mergeStop,
  StopFailure: () => NOTHING,
  SubagentStart: () => NOTHING,
  SubagentStop: mergeStop,
  PreCompact: mergePreCompact,
  PostCompact: () => NOTHING,
  PreModelSwitch: mergePreModelSwitch,
  PostModelSwitch: () => NOTHING,
  PermissionRequest: mergePermissionRequest,
  PermissionDenied: mergeRetry,
  Setup: () => NOTHING,
  TeammateIdle: () => NOTHING,
  TaskCreated: () => NOTHING,
  TaskCompleted: () => NOTHING,
  Elicitation: (reads) => mergeElicitation('Elicitation', reads),
  ElicitationResult: (reads) => mergeElicitation('ElicitationResult', reads),
  ConfigChange: () => NOTHING,
  WorktreeCreate: mergeWorktreeCreate,
  WorktreeRemove: () => NOTHING,
  InstructionsLoaded: () => NOTHING,
  CwdChanged: mergeWatchList,
  FileChanged: mergeWatchList,
  DirectoryAdded: () => NOTHING,
  MessageDisplay: mergeDisplay,
};

/**
 * Where the docs say a top-level `decision: "block"` holds the action back ("Decision control"
 * table); the gates and the elicitations read it in their own merge.
 */
const DECISION_BLOCKS = eventSet(
  'UserPromptSubmit',
  'UserPromptExpansion',
  'PostToolUse',
  'PostToolUseFailure',
  'PostToolBatch',
  'Stop',
  'SubagentStop',
  'ConfigChange',
  'PreCompact',
  'TaskCreated',
);

/** "Returning `decision: \"block\"` or `continue: false` stops the agentic loop": the same block. */
const CONTINUE_FALSE_BLOCKS = eventSet('PostToolBatch');

/**
 * Judgment (spec/judgments.md): "`continue: false` ... Takes precedence over any event-specific
 * decision fields", so a `Stop` hook that both stops and blocks the stop stops.
 */
const STOP_OVERRIDES_DECISION = eventSet('Stop', 'SubagentStop');

/** Where a hook's `additionalContext` reaches Claude ("Add context for Claude"). */
const CONTEXT_EVENTS = eventSet(
  'SessionStart',
  'SubagentStart',
  'UserPromptSubmit',
  'UserPromptExpansion',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'PostToolBatch',
  'Stop',
  'SubagentStop',
  'PostModelSwitch',
);

/** "`additionalContext` ... Ignored when `permissionDecision` is `\"defer\"`." */
const defers = (read: Read): boolean =>
  read.output?.hookSpecificOutput !== undefined &&
  'permissionDecision' in read.output.hookSpecificOutput &&
  read.output.hookSpecificOutput.permissionDecision === 'defer';

const SKIPS_CONTEXT: { readonly [E in HookEvent]?: (read: Read) => boolean } = {
  PreToolUse: defers,
};

/** "If your string contains a `<system-reminder>` or `</system-reminder>` tag, Claude receives the string with that tag's `<` replaced by `&lt;`." */
const SYSTEM_REMINDER_TAG = /<(\/?system-reminder>)/g;
const escapeReminderTags = (text: string): string => text.replace(SYSTEM_REMINDER_TAG, '&lt;$1');

function readOf(event: HookEvent, tagged: TaggedOutput): Read {
  const checked = tagged.output === undefined ? undefined : checkOutput(event, tagged.output).data;
  return {
    handler: tagged.handler,
    output: checked,
    specific: OUTPUT_CAPS[event].accepts.has('specific') ? checked?.hookSpecificOutput : undefined,
    plainText: tagged.plainText,
    effectsIgnored: tagged.effectsIgnored === true,
  };
}

function contextOf(event: HookEvent, read: Read): readonly string[] {
  if (!CONTEXT_EVENTS.has(event) || SKIPS_CONTEXT[event]?.(read) === true) return [];
  const json = textIn(read.specific, 'additionalContext');
  const plain = read.plainText?.as === 'context' ? read.plainText.text : undefined;
  return [json, plain].flatMap((text) =>
    text === undefined || text === '' ? [] : [escapeReminderTags(text)],
  );
}

interface Sequences {
  readonly sequences: readonly string[];
  readonly issues: readonly PluginIssue[];
}

function sequencesOf(event: HookEvent, reads: readonly Read[]): Sequences {
  if (!OUTPUT_CAPS[event].accepts.has('terminalSequence')) return { sequences: [], issues: [] };
  const sequences: string[] = [];
  const issues: PluginIssue[] = [];
  for (const read of reads) {
    const value = read.output?.terminalSequence;
    if (value === undefined) continue;
    const allowed = allowedTerminalSequence(value);
    if (allowed === undefined) {
      issues.push(
        warning(
          `hooks.${event}.${read.handler.id}.terminalSequence`,
          'holds something outside the allowlist (OSC 0, 1, 2, 9, 99, 777 and BEL) and is ignored',
        ),
      );
    } else sequences.push(allowed);
  }
  return { sequences, issues };
}

/** The hooks whose `continue` is `false`, where the event honours it. */
const stoppingOf = (event: HookEvent, reads: readonly Read[]): readonly Read[] =>
  OUTPUT_CAPS[event].accepts.has('continue')
    ? reads.filter((read) => read.output?.continue === false)
    : [];

function decisionBlockOf(
  event: HookEvent,
  reads: readonly Read[],
  facts: object,
): MergedBlock | undefined {
  if (!DECISION_BLOCKS.has(event) || !OUTPUT_CAPS[event].accepts.has('decision')) return undefined;
  // "`policy_settings` changes can't be blocked", whatever hook says so.
  if (EXIT2_RULES[event].cannotBlockWhen?.(facts) === true) return undefined;
  const stops = STOP_OVERRIDES_DECISION.has(event);
  const found = reads.find(
    (read) => read.output?.decision === 'block' && !(stops && read.output.continue === false),
  );
  return found === undefined
    ? undefined
    : {
        via: 'decision',
        by: found.handler.id,
        ...(found.output?.reason === undefined ? {} : { reason: found.output.reason }),
      };
}

const firstOf = <T>(values: readonly (T | undefined)[]): T | undefined =>
  values.find((value) => value !== undefined);

/** `facts` carry what a rule needs from the event (`source`, `tool_name`). */
export function mergeOutputs(
  event: HookEvent,
  outputs: readonly TaggedOutput[],
  facts: object = {},
): MergedOutput {
  const reads = outputs.map((tagged) => readOf(event, tagged));
  const stopping = stoppingOf(event, reads);
  const merged = MERGERS[event](reads, facts);
  const sequences = sequencesOf(event, reads);
  const messages = routeMessages(event, reads, facts);
  const stopReason = firstOf(stopping.map((read) => read.output?.stopReason));
  const stopper = stopping[0];
  const block =
    merged.block ??
    decisionBlockOf(event, reads, facts) ??
    (CONTINUE_FALSE_BLOCKS.has(event) && stopper !== undefined
      ? {
          via: 'continue-false' as const,
          by: stopper.handler.id,
          ...(stopReason === undefined ? {} : { reason: stopReason }),
        }
      : undefined);
  return {
    ...(block === undefined ? {} : { block }),
    continue: stopping.length === 0,
    ...(stopReason === undefined ? {} : { stopReason }),
    systemMessages: messages.toUser,
    additionalContext: [...reads.flatMap((read) => contextOf(event, read)), ...messages.toClaude],
    terminalSequences: sequences.sequences,
    effects: merged.effects,
    issues: [...merged.issues, ...sequences.issues],
  };
}
