import type { HookEvent } from '../../protocol/official.ts';

/**
 * What each event honours of a hook's JSON output and what it discards (hooks.md, "JSON output":
 * "Every event accepts them, but some events discard them ... Each event's section says so"). One
 * row per event of the official union.
 */

/** The groups of fields an event can discard. */
export const CAPPED_FIELDS = [
  /** `continue` and `stopReason`. */
  'continue',
  'systemMessage',
  'terminalSequence',
  /** The top-level `decision` and `reason`. */
  'decision',
  /** `hookSpecificOutput`: `additionalContext` and the event's own fields. */
  'specific',
] as const;
export type CappedField = (typeof CAPPED_FIELDS)[number];

export interface OutputCap {
  readonly accepts: ReadonlySet<CappedField>;
  readonly discards: ReadonlySet<CappedField>;
}

const capOf = (discarded: readonly CappedField[]): OutputCap => ({
  accepts: new Set(CAPPED_FIELDS.filter((field) => !discarded.includes(field))),
  discards: new Set(discarded),
});

/** Events with no decision control: "No blocking or decision control". */
const NO_DECISION: readonly CappedField[] = ['decision'];

/**
 * `terminalSequence` is dropped nowhere here: "Claude Code writes the sequence itself when it
 * processes your hook's output, so the field works on events that discard `systemMessage` and
 * `continue`", and its two exceptions (non-interactive sessions, a command `WorktreeCreate` hook)
 * are not a matter of the event's output but of the host and handler.
 * Judgment (spec/judgments.md): that includes the events that "discard their JSON output fields".
 */
export const OUTPUT_CAPS: { readonly [E in HookEvent]: OutputCap } = {
  PreToolUse: capOf([]),
  PostToolUse: capOf([]),
  PostToolUseFailure: capOf([]),
  PostToolBatch: capOf([]),
  UserPromptSubmit: capOf([]),
  UserPromptExpansion: capOf([]),
  Stop: capOf([]),
  SubagentStop: capOf([]),
  PermissionRequest: capOf(NO_DECISION),
  PreModelSwitch: capOf([]),
  // "Claude Code shows the user any `systemMessage` your hook returns regardless of the decision".
  PostModelSwitch: capOf(NO_DECISION),
  SubagentStart: capOf(NO_DECISION),
  SessionStart: capOf(NO_DECISION),
  // "On every exit code, Claude Code discards a Setup hook's JSON output fields".
  Setup: capOf(['continue', 'systemMessage', 'decision', 'specific']),
  // "Claude Code discards their `systemMessage` and `continue` fields".
  Notification: capOf(['continue', 'systemMessage', 'decision']),
  InstructionsLoaded: capOf(['continue', 'systemMessage', 'decision', 'specific']),
  SessionEnd: capOf(['continue', 'systemMessage', 'decision', 'specific']),
  // "Claude Code discards a PreCompact hook's `systemMessage` and `continue` fields."
  PreCompact: capOf(['continue', 'systemMessage']),
  PostCompact: capOf(['continue', 'systemMessage', 'decision']),
  // "Run for notification and logging purposes only": only `terminalSequence` counts.
  StopFailure: capOf(['continue', 'systemMessage', 'decision', 'specific']),
  // "continue: false stops the teammate entirely"; no top-level decision.
  TeammateIdle: capOf(NO_DECISION),
  TaskCompleted: capOf(NO_DECISION),
  // "Claude Code ignores `continue: false` from this event".
  TaskCreated: capOf(['continue']),
  // "Claude Code acts on the blocking decision ... and discards `systemMessage` and `continue`."
  ConfigChange: capOf(['continue', 'systemMessage']),
  // "Claude Code reads `watchPaths` and `systemMessage` ... and discards `continue`."
  CwdChanged: capOf(['continue', 'decision']),
  FileChanged: capOf(['continue', 'decision']),
  DirectoryAdded: capOf(['continue', 'decision']),
  // "Claude Code acts on the hook's success and the returned path, and discards `systemMessage` and `continue`."
  WorktreeCreate: capOf(['continue', 'systemMessage', 'decision']),
  WorktreeRemove: capOf(['continue', 'systemMessage', 'decision', 'specific']),
  // "Claude Code discards `reason`, `systemMessage`, and `continue`"; `decision: "block"` declines.
  Elicitation: capOf(['continue', 'systemMessage']),
  ElicitationResult: capOf(['continue', 'systemMessage']),
  // "The only output this event reads is `hookSpecificOutput.retry`."
  PermissionDenied: capOf(['continue', 'systemMessage', 'decision']),
  // "discards `systemMessage` and `continue`".
  MessageDisplay: capOf(['continue', 'systemMessage', 'decision']),
};
