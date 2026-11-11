import { warning, type PluginIssue } from '../../format/issues.ts';
import type { EventEffects } from './effects.ts';

/**
 * Whether a `PreToolUse` `defer` pauses the turn (hooks.md, "Defer a tool call for later"): "Claude
 * Code honors `defer` only in non-interactive mode with the `-p` flag, and only when Claude makes a
 * single tool call in the turn". "In interactive sessions: it logs a warning and ignores the hook
 * result"; with "several tool calls at once: `defer` is ignored with a warning and the tool proceeds
 * through the normal permission flow". The merge says `defer` won; only the host knows the turn.
 */

/** What the host knows of the turn the tool call belongs to. */
export interface DeferTurn {
  /** An interactive terminal session, as `HookSession.interactive`. */
  readonly interactive: boolean;
  /** How many tool calls Claude made in this turn. */
  readonly toolCalls: number;
}

export type DeferResolution =
  /** The merged output holds no `defer`: nothing to resolve. */
  | { readonly kind: 'none' }
  /** The turn ends with `stop_reason: "tool_deferred"` and the pending call stays in the transcript. */
  | { readonly kind: 'deferred' }
  /** `defer` does not apply: log `warning`, run the normal permission flow with no hook decision. */
  | { readonly kind: 'ignored'; readonly warning: PluginIssue };

const PATH = 'hooks.PreToolUse.permissionDecision';

/** The resolution of the merged `effects` of a `PreToolUse` dispatch in `turn`. */
export function resolveDefer(
  effects: Pick<EventEffects, 'permissionDecision'>,
  turn: DeferTurn,
): DeferResolution {
  if (effects.permissionDecision !== 'defer') return { kind: 'none' };
  if (turn.interactive) {
    return {
      kind: 'ignored',
      warning: warning(
        PATH,
        '"defer" is honored only in non-interactive mode with the -p flag; the hook result is ignored',
      ),
    };
  }
  if (turn.toolCalls !== 1) {
    return {
      kind: 'ignored',
      warning: warning(
        PATH,
        '"defer" is honored only when Claude makes a single tool call in the turn; it is ignored and the tool proceeds through the normal permission flow',
      ),
    };
  }
  return { kind: 'deferred' };
}
