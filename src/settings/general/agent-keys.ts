import type { PolicyView } from '../view.ts';

/**
 * `agent` and `disableAgentView` (settings-reference.md, `agent`, `disableAgentView`). `--agent` and
 * `--teammate-mode` for one session are `SESSION_OVERRIDES` rows; `CLAUDE_CODE_DISABLE_AGENT_VIEW`
 * is paired with its key here.
 */
export const readAgent = (view: PolicyView): string | undefined => view.get('agent');

/** `CLAUDE_CODE_DISABLE_AGENT_VIEW`, equivalent to `disableAgentView` for one session. */
export const AGENT_VIEW_ENV = 'CLAUDE_CODE_DISABLE_AGENT_VIEW';

const ON_VALUES: readonly string[] = ['1', 'true', 'yes', 'on'];

export interface AgentViewDecision {
  readonly disabled: boolean;
  /** Everything that turned it off: any one of them keeps it off. */
  readonly offBy: readonly ('disableAgentView' | 'env')[];
}

/**
 * Whether background agents and agent view are off: "whichever of the two turns it off, the other
 * can't turn it back on". The variable takes the usual on values (env-vars.md: "`1`, `true`, `yes`,
 * or `on` ... in any casing"); an off value, an empty one or an unlisted one leaves it unset.
 */
export function agentViewDisabled(
  view: PolicyView,
  env: Readonly<Record<string, string | undefined>>,
): AgentViewDecision {
  const offBy: ('disableAgentView' | 'env')[] = [];
  if (view.get('disableAgentView') === true) offBy.push('disableAgentView');
  if (ON_VALUES.includes((env[AGENT_VIEW_ENV] ?? '').trim().toLowerCase())) offBy.push('env');
  return { disabled: offBy.length > 0, offBy };
}
