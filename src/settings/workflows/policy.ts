import type { PolicyView } from '../view.ts';
import { workflowsDecision, type WorkflowsContext, type WorkflowsDecision } from './enablement.ts';
import { keywordTrigger, type KeywordVerdict, type PromptInput } from './keyword.ts';
import { workflowSize, type WorkflowSizeContext, type WorkflowSizeDecision } from './size.ts';

/** What the host tells the workflow keys besides the layers. */
export type WorkflowPolicyContext = WorkflowsContext & WorkflowSizeContext;

/** The workflow keys of the settings as one object over a view (docs/API.md, "Settings"). */
export interface WorkflowSettingsPolicy {
  enablement(): WorkflowsDecision;
  readonly workflowsEnabled: boolean;
  keyword(prompt: PromptInput): KeywordVerdict;
  size(): WorkflowSizeDecision;
}

export function createWorkflowSettingsPolicy(
  view: PolicyView,
  context: WorkflowPolicyContext,
): WorkflowSettingsPolicy {
  const enablement = workflowsDecision(view, context);
  return {
    enablement: () => enablement,
    workflowsEnabled: enablement.enabled,
    keyword: (prompt) => keywordTrigger(view, context, prompt),
    size: () => workflowSize(view, context),
  };
}
