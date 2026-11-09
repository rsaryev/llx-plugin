import { preToolUseHookOutcome, type HookOutcome } from '../hooks/index.ts';
import { decide, type DecideContext, type Decision, type PreparedCall } from '../rules/index.ts';
import type { HookPart } from './session-hooks.ts';

/** What `checkTool` found for one tool call. */
export interface ToolCheck {
  /** What the PreToolUse hooks answered: their messages, context and effects. */
  readonly hook: HookOutcome<'PreToolUse'>;
  /** The input to run: the hook's `updatedInput`, unless the hook deferred or returned none. */
  readonly input: unknown;
  /** The permission decision over that input, with the hook's answer applied. */
  readonly decision: Decision;
}

export interface ToolCheckPart {
  /**
   * Whether a tool call may run: the PreToolUse hooks, then the permission decision over the input
   * they return (hooks.md, "PreToolUse decision control": "Claude Code evaluates permission rules ...
   * against the input your hook returns, not the input Claude sent"; for `"defer"` it is ignored).
   * The prompt, a deferred turn and the auto-mode review of a changed input stay the host's.
   */
  checkTool(
    call: PreparedCall,
    options: {
      readonly toolUseId: string;
      readonly permissions: Omit<DecideContext, 'hook'>;
      readonly signal: AbortSignal;
    },
  ): Promise<ToolCheck>;
}

export function createToolCheckPart(hooks: Pick<HookPart, 'dispatch'>): ToolCheckPart {
  return {
    async checkTool(call, { toolUseId, permissions, signal }) {
      const facts = { tool_name: call.toolName, tool_input: call.input, tool_use_id: toolUseId };
      const hook = await hooks.dispatch('PreToolUse', facts, { signal });
      // The merge already drops `updatedInput` after a deny or a defer (hooks/output).
      const input = hook.effects.updatedInput ?? call.input;
      const decision = decide(
        { ...call, input },
        { ...permissions, hook: preToolUseHookOutcome(hook) },
      );
      return { hook, input, decision };
    },
  };
}
