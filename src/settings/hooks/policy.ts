import type { PolicyView } from '../view.ts';
import {
  createCommandGates,
  type CommandGates,
  type CommandSessionFacts,
} from './custom-commands.ts';
import { createHookGate, type HookLocks } from './hook-gate.ts';
import { createHttpHookPolicy, type HttpHookPolicy } from './http-policy.ts';
import type { HookSource, HookVerdict } from './origins.ts';
import { applyParentRules, type ParentSettingsContext } from './parent-settings.ts';

/** What the host tells the hook policy besides the layers. */
export type HookPolicyContext = ParentSettingsContext & CommandSessionFacts;

/**
 * The keys that decide which hooks run, as one object over a view (docs/API.md, "Settings"): the
 * hooks engine asks `runs(origin)` before it runs any hook and `httpHook(url, allowedEnvVars)` before
 * it sends an HTTP request.
 */
export interface HookPolicy extends CommandGates {
  runs(origin: HookSource): HookVerdict;
  httpHook: HttpHookPolicy['check'];
}

export function createHookPolicy(
  view: PolicyView,
  locks: HookLocks,
  context: HookPolicyContext,
): HookPolicy {
  const effective = applyParentRules(view, context);
  const gate = createHookGate(effective, locks);
  const http = createHttpHookPolicy(effective);
  return {
    ...createCommandGates(gate, context),
    runs: (origin) => gate.runs(origin),
    httpHook: (url, hookAllowedEnvVars) => http.check(url, hookAllowedEnvVars),
  };
}
