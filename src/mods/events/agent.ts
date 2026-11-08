import type { MOD_EVENT_GROUPS } from '../../protocol/mods-events.ts';
import { z } from 'zod';
import { answer, fields, flag, isRecord, noFields, text, type EventSpec } from './spec.ts';

/** The subagent events (reference.md, "Subagents"). */
type AgentEvent = (typeof MOD_EVENT_GROUPS.subagents)[number];

/**
 * A resumed run (`e.resume` is `{ agentId }`) ignores a changed event: "If you pass a changed
 * event to `next` for a resumed run, such as a different `model`, Claude Code ignores the change".
 * The hooks after it still see what was passed.
 */
function spawnedAs(original: unknown, passed: unknown): unknown {
  return isRecord(original) && original.resume !== undefined ? original : passed;
}

export const AGENT_SPECS: { readonly [N in AgentEvent]: EventSpec } = {
  // A hook answers `{ isOffered: false }` to withhold the subagent type.
  'agent.offer': { input: noFields, result: answer({ isOffered: flag.optional() }) },
  // `e.isTeammate` is `true` for a teammate, `e.resume` is `{ agentId }` for a resumed run. A hook
  // passes `{ ...e, model }` to choose the model of one that is starting, or answers `{ deny }`.
  'agent.spawn': {
    input: fields({
      isTeammate: flag.optional(),
      resume: z.looseObject({ agentId: text }).optional(),
      model: text.optional(),
    }),
    result: answer({ deny: text.optional() }),
    coreInput: spawnedAs,
  },
};
