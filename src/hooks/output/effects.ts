import type { HookSpecificOutputOf } from '../../protocol/hook-events.ts';

/**
 * What a merged output asks the host to do, beside the decision itself (hooks.md, "Decision
 * control" and each event's "decision control" or "output" section). One flat record, every field
 * optional: an event sets only the fields its section names, and a field is absent when no hook
 * returned it. Fields are typed from the official output types where the SDK has them.
 */

/** `PreToolUse` and `PreModelSwitch` (hooks.md, "PreToolUse decision control"). */
interface GateEffects {
  readonly permissionDecision?: HookSpecificOutputOf<'PreToolUse'>['permissionDecision'];
  readonly permissionDecisionReason?: string;
  /** Replaces the whole input of the tool call (`PreToolUse` only). */
  readonly updatedInput?: HookSpecificOutputOf<'PreToolUse'>['updatedInput'];
  /**
   * `defer` only: "Claude Code honors `defer` only in non-interactive mode with the `-p` flag, and
   * only when Claude makes a single tool call in the turn". The host applies the condition.
   */
  readonly deferCondition?: 'non-interactive-single-tool-call';
}

/** `PermissionRequest`: the `decision` object of the winning hooks. */
interface PermissionRequestEffects {
  readonly permissionRequest?: HookSpecificOutputOf<'PermissionRequest'>['decision'];
}

/** `PostToolUse`. */
interface ToolResultEffects {
  /** Replaces the tool's output before Claude sees it (built-in tools: only a value of the tool's shape). */
  readonly updatedToolOutput?: unknown;
  /** The note for the auto mode classifier, at most 2,000 characters over every hook. */
  readonly classifierContext?: string;
}

/** `SessionStart`, `UserPromptSubmit`, `UserPromptExpansion`. */
interface PromptEffects {
  readonly initialUserMessage?: string;
  readonly sessionTitle?: string;
  readonly reloadSkills?: boolean;
  readonly suppressOriginalPrompt?: boolean;
}

/** `Elicitation` and `ElicitationResult`: what the MCP server receives. */
interface ElicitationEffects {
  readonly elicitation?: {
    readonly action: NonNullable<HookSpecificOutputOf<'Elicitation'>['action']>;
    readonly content?: Readonly<Record<string, unknown>>;
  };
}

/** The rest: one field per event that has one. */
interface MiscEffects {
  /** `SessionStart`, `CwdChanged`, `FileChanged`: replaces the dynamic watch list; `[]` clears it. */
  readonly watchPaths?: readonly string[];
  /** `MessageDisplay`: shown in place of the delta. */
  readonly displayContent?: string;
  /** `PermissionDenied`: the model may retry the denied call. */
  readonly retry?: boolean;
  /** `WorktreeCreate` (an HTTP hook): the path of the created worktree. */
  readonly worktreePath?: string;
  /** `PreCompact`: the hooks' stdout, instructions for the compaction summary. */
  readonly compactionInstructions?: readonly string[];
  /**
   * `TaskCompleted` with `continue: false`: it "stops the teammate entirely" only "when a teammate
   * finishing its turn triggered the event"; "when the `TaskUpdate` tool triggered the event, Claude
   * Code ignores `continue: false`". The input does not say which fired it, so the host applies this.
   */
  readonly stopCondition?: 'teammate-finished-its-turn';
  /**
   * `Stop` and `SubagentStop`: a hook's `additionalContext` keeps the conversation going without a
   * block ("non-error feedback"), through the same loop protections.
   */
  readonly continuesTurn?: boolean;
}

export type EventEffects = GateEffects &
  PermissionRequestEffects &
  ToolResultEffects &
  PromptEffects &
  ElicitationEffects &
  MiscEffects;
