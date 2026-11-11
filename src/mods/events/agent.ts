import type { MOD_EVENT_GROUPS } from '../../protocol/mods-events.ts';
import { z } from 'zod';
import { answer, fields, flag, noFields, text, type EventSpec } from './spec.ts';
import { isRecord } from '../../protocol/is-record.ts';

/** The subagent events (reference.md, "Subagents"). */
type AgentEvent = (typeof MOD_EVENT_GROUPS.subagents)[number];

/**
 * A resumed run (`e.resume` is `{ agentId }`) ignores a changed event: "If you pass a changed
 * event to `next` for a resumed run, such as a different `model`, Claude Code ignores the change".
 * Judgment: the hooks after it still see what was passed; only Claude Code's own behaviour
 * receives the event as fired.
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
