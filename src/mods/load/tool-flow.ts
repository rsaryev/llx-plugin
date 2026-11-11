import { z } from 'zod';
import type { PermissionMode } from '../../protocol/official.ts';
import { toolNamesOf, type HostToolNames } from '../../rules/index.ts';
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
  /** Only an unresolved ask reaches this callback, after every tool.check hook returned. */
  readonly afterCheck: (decision: ToolDecision, call: ModToolFlow['call']) => Promise<ToolDecision>;
  readonly execute: (call: ModToolFlow['call']) => Promise<unknown>;
  /**
   * How the host's tool names correspond to Claude Code's (`SessionOptions.toolNames`): `call.tool`
   * is then the host's name, `tool.call` and `tool.check` see the Claude Code name of the call, and
   * the callbacks above get the host's name back. Judgment (spec/judgments.md).
   */
  readonly names?: HostToolNames;
  readonly review?: {
    readonly mode: PermissionMode;
    readonly by: InputReview;
    readonly repeat?: boolean;
    /** The frame the model originally wrote, before a turn.step hook changed it. */
    readonly written?: ModToolFlow['call'];
  };
}

const CALL = z.looseObject({ tool: z.string() });
const DECISION = z.looseObject({
  decision: z.enum(['allow', 'ask', 'deny']),
  reason: z.string().optional(),
});
const ANSWER = z.looseObject({ deny: z.string() });
const FAILED = z.looseObject({ isError: z.literal(true) });
const ALLOWED = { allow: true, ask: false, deny: false } as const;
const NEEDS_REVIEW = { allow: false, ask: true, deny: false } as const;
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
    written: review.written ?? flow.call,
    passed: call,
  });
  return { call, ...(refusal === undefined ? {} : { deny: refusal.reason }) };
}

type Call = ModToolFlow['call'];

/** A call in Claude Code's names, and back: the host's tool for any name it stands for. */
function namingOf(flow: ModToolFlow) {
  const names = toolNamesOf(flow.names);
  const hostTool = flow.call.tool;
  return {
    claude: ({ tool, ...input }: Call): Call => ({ ...input, tool: names.claudeName(tool, input) }),
    host: (call: Call): Call =>
      names.claudeNames(hostTool).includes(call.tool) ? { ...call, tool: hostTool } : call,
  };
}

/** The managed hooks get the call in the host's names too. */
const managedOf =
  (managed: NonNullable<ModToolFlow['managed']>, host: (call: Call) => Call) =>
  (event: unknown): Promise<unknown> =>
    managed(host(CALL.parse(event)));

async function checked(flow: ModToolFlow, call: Call): Promise<ToolDecision> {
  const { tool, ...input } = namingOf(flow).claude(call);
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
  const resolved: ToolDecision = {
    decision: decision.decision,
    ...(decision.reason === undefined ? {} : { reason: decision.reason }),
  };
  return NEEDS_REVIEW[resolved.decision] ? flow.afterCheck(resolved, call) : resolved;
}

/** Managed PreToolUse → tool.call → other PreToolUse → tool.check → review/prompt → execution. */
export async function runModToolCall(flow: ModToolFlow): Promise<ModToolFlowResult> {
  let succeeded = false;
  const naming = namingOf(flow);
  const result = await flow.host.fire('tool.call', naming.claude(flow.call), {
    ...(flow.managed === undefined ? {} : { before: managedOf(flow.managed, naming.host) }),
    core: async (event) => {
      const pre = await flow.preToolUse(naming.host(CALL.parse(event)));
      if (pre.deny !== undefined) return { deny: pre.deny };
      const pass = reviewed(flow, pre.call);
      if (pass.deny !== undefined) return { deny: pass.deny };
      const decision = await checked(flow, pass.call);
      if (!ALLOWED[decision.decision])
        return { deny: decision.reason ?? 'Permission was not granted' };
      const output = await flow.execute(pass.call);
      succeeded = !FAILED.safeParse(output).success;
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
