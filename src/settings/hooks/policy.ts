import { applyParentRules, type ParentSettingsContext } from '../managed/parent.ts';
import type { PolicyView } from '../view.ts';
import {
  createCommandGates,
  type CommandGates,
  type CommandSessionFacts,
} from './custom-commands.ts';
import type { HttpHookUrlPolicy } from './http-policy.ts';
import type { PolicyHookSource, HookVerdict } from './origins.ts';
import { hookDecision } from './session-gates.ts';

/** What the host tells the hook policy besides the layers. */
export type HookPolicyContext = ParentSettingsContext & CommandSessionFacts;

/**
 * The keys that decide which hooks run, as one object over a view (docs/API.md, "Settings"): the
 * hooks engine asks `runs(origin)` before it runs any hook and `httpHook(url, allowedEnvVars)` before
 * it sends an HTTP request. The same decision as `hookSessionGates`, in the shape of questions.
 */
export interface HookPolicy extends CommandGates {
  runs(origin: PolicyHookSource): HookVerdict;
  httpHook: HttpHookUrlPolicy['check'];
}

/** The hook policy over a view the parent rules were already applied to (`resolvePolicy`). */
export function hookPolicyOver(effective: PolicyView, facts: CommandSessionFacts): HookPolicy {
  const { gate, http } = hookDecision(effective);
  return {
    ...createCommandGates(gate, facts),
    runs: (origin) => gate.runs(origin),
    httpHook: (url, hookAllowedEnvVars) => http.check(url, hookAllowedEnvVars),
  };
}

export const createHookPolicy = (view: PolicyView, context: HookPolicyContext): HookPolicy =>
  hookPolicyOver(applyParentRules(view, context), context);
