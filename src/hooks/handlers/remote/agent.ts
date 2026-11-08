import { withoutPort } from './failure-run.ts';
import type { HandlerEntry, HandlerResult, RunContext } from '../context.ts';
import { runModelHook } from './model-run.ts';

/**
 * An `agent` hook (hooks.md, "Agent-based hooks"): "like prompt-based hooks but with multi-turn
 * tool access": a subagent that "can use tools like Read, Grep, and Glob to investigate" and returns
 * `{ "ok": true/false }`. It has no `continueOnBlock` and no `impossible` ("don't support the
 * prompt-hook `impossible` field"). Skipping it on `PermissionRequest` is the select stage's.
 */

/** "Tools like Read, Grep, and Glob": the read-only investigation tools the docs name (judgment). */
export const AGENT_HOOK_TOOLS: readonly string[] = ['Read', 'Grep', 'Glob'];

export function runAgent(
  entry: HandlerEntry<'agent'>,
  context: RunContext,
): Promise<HandlerResult> {
  const models = context.ports.models;
  if (models === undefined) return Promise.resolve(withoutPort(entry, 'agent', 'ModelRunner'));
  return runModelHook(entry, context, {
    impossible: false,
    call: (request) => models.runAgent({ ...request, tools: AGENT_HOOK_TOOLS }),
  });
}
