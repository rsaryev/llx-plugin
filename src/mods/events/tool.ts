import { z } from 'zod';
import { PERMISSION_BEHAVIORS } from '../../protocol/permission-modes.ts';
import type { MOD_EVENT_GROUPS } from '../../protocol/mods-events.ts';
import { answer, fields, flag, text, type EventSpec } from './spec.ts';

/**
 * The tool events (reference.md, "Tools"; events.md, "Guard or change a tool call" and "Approve or
 * refuse a tool call before the user is asked").
 */
type ToolEvent = (typeof MOD_EVENT_GROUPS.tools)[number];

export const TOOL_SPECS: { readonly [N in ToolEvent]: EventSpec } = {
  // `e.tool` is the tool's name and its arguments are fields of `e`, such as `e.command` for Bash.
  // A hook answers `{ deny }` or `{ result }`; what `next` resolves to is the tool's own result,
  // where "a refused call comes back as { deny }, and a failed one has isError set".
  'tool.call': {
    input: fields({ tool: text }),
    result: answer({ deny: text.optional(), isError: flag.optional() }),
  },
  // `e.input` holds the arguments. `e.isReadOnly` is `true` or absent, "not `false`". The decision
  // `next(e)` resolves to is an object whose `decision` is allow, ask or deny.
  'tool.check': {
    input: fields({
      tool: text,
      input: z.record(z.string(), z.unknown()),
      agentId: text.optional(),
      ceiling: z.literal('ask').optional(),
      isReadOnly: z.literal(true).optional(),
    }),
    result: answer({ decision: z.enum(PERMISSION_BEHAVIORS), reason: text.optional() }),
  },
  // `e.description` is the text Claude reads; a hook answers `{ description }` and may set
  // `isDeferred`, and `breakPromptCache: true` to send a changed description on the next turn.
  'tool.describe': {
    input: fields({ description: text }),
    result: answer({
      description: text,
      isDeferred: flag.optional(),
      breakPromptCache: flag.optional(),
    }),
  },
};
