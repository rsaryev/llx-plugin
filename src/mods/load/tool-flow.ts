import { z } from 'zod';
import type { PermissionMode } from '../../protocol/official.ts';
import {
  inputChangedDenial,
  toolReadOnlyReport,
  withheldResultText,
  type InputReview,
  type ReadOnlyChecks,
  type ToolDecision,
} from '../events/index.ts';
import type { ModsHost } from './host.ts';

/** Host-supplied effects of one tool call, in the ordering of mods/events.md, "When tool.check fires". */
export interface ModToolFlow {
  readonly host: Pick<ModsHost, 'fire'>;
  readonly call: Readonly<Record<string, unknown>> & { readonly tool: string };
  /** Managed settings hooks run before the first mod. A refusal stops the whole chain. */
  readonly managed?: (call: unknown) => Promise<unknown>;
  /** Other PreToolUse hooks run after the last tool.call mod. */
  readonly preToolUse: (
    call: ModToolFlow['call'],
  ) => Promise<{ readonly call: ModToolFlow['call']; readonly deny?: string }>;
  readonly readOnly: ReadOnlyChecks;
  /** Rules and permission mode only: no classifier, PermissionRequest hook or prompt here. */
  readonly decide: (call: ModToolFlow['call']) => Promise<ToolDecision>;
  /** Called after every tool.check hook returned: the classifier, PermissionRequest or prompt. */
  readonly afterCheck: (decision: ToolDecision, call: ModToolFlow['call']) => Promise<ToolDecision>;
  readonly execute: (call: ModToolFlow['call']) => Promise<unknown>;
  readonly review?: {
    readonly mode: PermissionMode;
    readonly by: InputReview;
    readonly repeat?: boolean;
  };
}

const CALL = z.looseObject({ tool: z.string() });
const DECISION = z.looseObject({
  decision: z.enum(['allow', 'ask', 'deny']),
  reason: z.string().optional(),
});
const ANSWER = z.looseObject({ deny: z.string() });
const ALLOWED = { allow: true, ask: false, deny: false } as const;
const REPEAT = { server: false, session: true } as const;

/** What the host presents to the model; presentation is separate from the tool's raw result. */
export interface ModToolFlowResult {
  readonly result: unknown;
  readonly modelText?: string;
}

function reviewed(flow: ModToolFlow, call: ModToolFlow['call']) {
  const review = flow.review;
  if (review === undefined) return { call };
  // The repeated session-reviewed call carries the first change; further hook changes are dropped.
  if (review.repeat === true && REPEAT[review.by]) return { call: flow.call };
  const refusal = inputChangedDenial({
    mode: review.mode,
    review: review.by,
    written: flow.call,
    passed: call,
  });
  return { call, ...(refusal === undefined ? {} : { deny: refusal.reason }) };
}

async function checked(flow: ModToolFlow, call: ModToolFlow['call']): Promise<ToolDecision> {
  const { tool, ...input } = call;
  const isReadOnly = toolReadOnlyReport({ tool, input }, flow.readOnly);
  const answer = await flow.host.fire(
    'tool.check',
    {
      tool,
      input,
      ...(isReadOnly === undefined ? {} : { isReadOnly }),
    },
    { core: () => flow.decide(call) },
  );
  const decision = DECISION.parse(answer);
  return flow.afterCheck(
    {
      decision: decision.decision,
      ...(decision.reason === undefined ? {} : { reason: decision.reason }),
    },
    call,
  );
}

/** Managed PreToolUse → tool.call → other PreToolUse → tool.check → review/prompt → execution. */
export async function runModToolCall(flow: ModToolFlow): Promise<ModToolFlowResult> {
  let succeeded = false;
  const result = await flow.host.fire('tool.call', flow.call, {
    ...(flow.managed === undefined ? {} : { before: flow.managed }),
    core: async (event) => {
      const pre = await flow.preToolUse(CALL.parse(event));
      if (pre.deny !== undefined) return { deny: pre.deny };
      const pass = reviewed(flow, pre.call);
      if (pass.deny !== undefined) return { deny: pass.deny };
      const decision = await checked(flow, pass.call);
      if (!ALLOWED[decision.decision])
        return { deny: decision.reason ?? 'Permission was not granted' };
      const output = await flow.execute(pass.call);
      succeeded = true;
      return output;
    },
  });
  const denied = ANSWER.safeParse(result);
  return denied.success
    ? {
        result,
        modelText: withheldResultText({
          tool: flow.call.tool,
          reason: denied.data.deny,
          ran: succeeded ? 'succeeded' : 'not-run',
        }),
      }
    : { result };
}
