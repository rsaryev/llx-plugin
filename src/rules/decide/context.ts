import type { HookPermissionDecision, PermissionMode } from '../../protocol/official.ts';
import type { Decision, MatchContext, PermissionRule } from '../types.ts';

/**
 * What a PreToolUse hook answered (hooks.md, "PreToolUse decision control"): its
 * `permissionDecision`, whether the hook exited with code 2 (a block), and whether it returned
 * `updatedInput` beside an allow. `defer` is the hook asking the calling process to pause the
 * turn, so it is not an answer to the permission check.
 */
export interface HookOutcome {
  readonly decision?: HookPermissionDecision;
  /** "A hook that exits with code 2 stops the tool call before permission rules are evaluated." */
  readonly blocked?: boolean;
  /** "`AskUserQuestion` and `ExitPlanMode` need `updatedInput` paired with `\"allow\"`." */
  readonly hasUpdatedInput?: boolean;
}

/**
 * What a mod that handles `tool.check` answered (permissions.md, "Precedence among rules, hooks,
 * and mods"). `policyEnforced` is "managed settings on the machine, or a Team or Enterprise
 * `/login` as the session's credential": the setups where a mod's approval cannot undo a deny rule,
 * an ask rule or a hook's block or prompt. `blocked` is a mod that refuses the call.
 */
export interface ModOutcome {
  readonly approved: boolean;
  readonly policyEnforced: boolean;
  readonly blocked?: boolean;
}

/**
 * The session facts decided outside `decide`, and the rules in force. Each optional field is
 * something the host knows and the docs name: the kit reads no settings, environment or login.
 */
export interface DecideContext {
  readonly mode: PermissionMode;
  readonly rules: readonly PermissionRule[];
  readonly match: MatchContext;
  /** Auto mode can be used in the session (permission-modes.md, "Eliminate permission prompts with auto mode"). */
  readonly autoAvailable: boolean;
  /** `bypassPermissions` is in the mode cycle, so plan mode does not enforce its blocks at a terminal. */
  readonly bypassAvailable: boolean;
  /** An interactive terminal session: someone can answer a prompt there. */
  readonly interactive: boolean;
  /** `useAutoModeDuringPlan` (permission-modes.md): "on ... by default". */
  readonly useAutoModeDuringPlan?: boolean;
  readonly hook?: HookOutcome;
  readonly mod?: ModOutcome;
  readonly blockReadsOutsideWorkingDirectories?: boolean;
  readonly blockWritesOutsideWorkingDirectories?: boolean;
  /**
   * The command runs in a sandbox that enforces the read block: "This prompt doesn't apply when the
   * command runs in the sandbox and the sandbox enforces the block" (permissions.md, settings-reference.md).
   */
  readonly sandboxEnforcesReadBlock?: boolean;
  /**
   * Directories Claude Code itself keeps for the session, which the read and write blocks leave
   * alone: the session scratchpad (settings-reference.md, "What the write block refuses and what
   * stays writable"). The host knows where they are.
   */
  readonly sessionDirectories?: readonly string[];
  /**
   * The "Permission required" column of the tools table, as the host knows it. A tool it answers
   * `false` for runs without a prompt; with no function every tool outside the read-only set asks
   * (spec/judgments.md).
   */
  readonly requiresPermission?: (toolName: string) => boolean;
  /** MCP tools marked `requiresUserInteraction`; `AskUserQuestion` always requires it. */
  readonly requiresUserInteraction?: ReadonlySet<string>;
  /** A `--permission-prompt-tool` or SDK `canUseTool` callback decides what the kit calls `ask`. */
  readonly permissionCallback?: boolean;
  /** `CLAUDE_CODE_EVEN_MORE_DANGEROUSLY_SKIP_PERMISSIONS`: critical-path removals run in bypass mode. */
  readonly criticalPathPromptOff?: boolean;
  readonly protectedPaths?: ProtectedPathOptions;
}

/** What the session adds to the protected paths and their exceptions (permission-modes.md, "Protected paths"). */
export interface ProtectedPathOptions {
  /** Files passed to `--settings`, `--mcp-config` or `--agents`. */
  readonly files?: readonly string[];
  /**
   * The files that a symlinked settings file points to. Unlike `files`, a write to one prompts in
   * the modes that route protected-path writes to the classifier, "even when an allow rule matches".
   */
  readonly symlinkTargets?: readonly string[];
  /** The directory `CLAUDE_CONFIG_DIR` points to, in place of `~/.claude` (default `~/.claude`). */
  readonly configDirectory?: string;
  /** Directories loaded with `--plugin-dir`. */
  readonly directories?: readonly string[];
  /** The `plansDirectory` setting. */
  readonly plansDirectory?: string;
  /** A session started with `--restricted`. */
  readonly restricted?: boolean;
}

/**
 * How far a mod's approval reaches over an outcome: over anything (`any`), unless a permission
 * callback cannot be bypassed (`unbypassable`), only where no managed policy applies (`unenforced`),
 * or never.
 */
export type ModReach = 'any' | 'unbypassable' | 'unenforced' | 'never';

/** An outcome and how far a mod's approval reaches over it. */
export interface Pending {
  readonly decision: Decision;
  readonly reach: ModReach;
}
