import { z } from 'zod';
import { error, warning, type PluginIssue } from '../../../format/issues.ts';
import type { AgentOutput } from '../../../protocol/official-tools.ts';
import { list, num, text } from '../inputs/field-schemas.ts';
import { issuesOf, objectOf, RESPONSE_ROOT } from './shape.ts';
import { isRecord } from '../../../protocol/is-record.ts';

/**
 * The two members of a foreground or background Agent call's `tool_response` that hooks.md ("Agent")
 * documents. Each type is a `Pick` of the SDK's `AgentOutput` member, so a field the SDK renames or
 * retypes breaks the typecheck here and not in a hook. Fields the table does not list (`agentType`,
 * `toolStats`, a block's `citations`, the SDK's remote launch) are left out (spec/judgments.md).
 */
type Completed = Extract<AgentOutput, { status: 'completed' }>;
type Launched = Extract<AgentOutput, { status: 'async_launched' }>;

/** A final text block of the subagent, or the note that stands in for a `SubagentHandback` report. */
export type AgentTextBlock = Readonly<Pick<Completed['content'][number], 'type' | 'text'>>;

/** "Per-type token breakdown of the final API request": the four keys the table names. */
export type AgentUsage = Readonly<
  Pick<
    Completed['usage'],
    'input_tokens' | 'output_tokens' | 'cache_creation_input_tokens' | 'cache_read_input_tokens'
  >
>;

/** `status: "completed"`: a foreground subagent, with its run telemetry. */
export type CompletedAgentResponse = Readonly<
  Pick<
    Completed,
    | 'status'
    | 'agentId'
    | 'resolvedModel'
    | 'modelsUsed'
    | 'totalTokens'
    | 'totalDurationMs'
    | 'totalToolUseCount'
  >
> & {
  readonly content: readonly AgentTextBlock[];
  readonly usage: AgentUsage;
};

/** `status: "async_launched"`: a background subagent. It has no usage fields. */
export type LaunchedAgentResponse = Readonly<
  Pick<
    Launched,
    'status' | 'agentId' | 'description' | 'prompt' | 'outputFile' | 'resolvedModel' | 'modelsUsed'
  >
>;

export type AgentResponse = CompletedAgentResponse | LaunchedAgentResponse;

export interface AgentResponseParse {
  /** `undefined` when the response could not be read as either member. */
  readonly response: AgentResponse | undefined;
  /** Each problem, at `tool_response.<field>`. */
  readonly issues: readonly PluginIssue[];
}

/**
 * `resolvedModel` and `modelsUsed` of either member, kept as received: the docs describe what
 * Claude Code emits ("consecutive repeats collapsed; set only when the model was swapped"), not a
 * rule for the reader.
 */
function modelFields(
  resolvedModel: string | undefined,
  modelsUsed: string[] | undefined,
): Pick<Completed, 'resolvedModel' | 'modelsUsed'> {
  return {
    ...(resolvedModel === undefined ? {} : { resolvedModel }),
    ...(modelsUsed === undefined ? {} : { modelsUsed }),
  };
}

const models = {
  resolvedModel: text.optional(),
  modelsUsed: list(text).optional(),
};

const COMPLETED = objectOf({
  status: z.literal('completed'),
  agentId: text,
  content: list(objectOf({ type: z.literal('text', { error: 'expected "text"' }), text })),
  ...models,
  totalTokens: num,
  totalDurationMs: num,
  totalToolUseCount: num,
  usage: objectOf({
    input_tokens: num,
    output_tokens: num,
    cache_creation_input_tokens: num.nullable(),
    cache_read_input_tokens: num.nullable(),
  }),
});

const LAUNCHED = objectOf({
  status: z.literal('async_launched'),
  agentId: text,
  description: text,
  prompt: text,
  outputFile: text,
  ...models,
});

type Reader = (raw: Record<string, unknown>) => AgentResponseParse;

const failed = (issues: readonly PluginIssue[]): AgentResponseParse => ({
  response: undefined,
  issues,
});

const readCompleted: Reader = (raw) => {
  const parsed = COMPLETED.safeParse(raw);
  if (!parsed.success) return failed(issuesOf(RESPONSE_ROOT, parsed.error));
  const { data } = parsed;
  return {
    response: {
      status: data.status,
      agentId: data.agentId,
      content: data.content,
      ...modelFields(data.resolvedModel, data.modelsUsed),
      totalTokens: data.totalTokens,
      totalDurationMs: data.totalDurationMs,
      totalToolUseCount: data.totalToolUseCount,
      usage: data.usage,
    },
    issues: [],
  };
};

/** "A background launch ... `tool_response` carries no usage fields": these are not read there. */
const USAGE_FIELDS = ['totalTokens', 'totalDurationMs', 'totalToolUseCount', 'usage'] as const;

const readLaunched: Reader = (raw) => {
  const unexpected = USAGE_FIELDS.filter((field) => field in raw).map((field) =>
    warning(
      `${RESPONSE_ROOT}.${field}`,
      'a background launch carries no usage fields, so this one is ignored',
    ),
  );
  const parsed = LAUNCHED.safeParse(raw);
  if (!parsed.success) return failed([...issuesOf(RESPONSE_ROOT, parsed.error), ...unexpected]);
  const { data } = parsed;
  return {
    response: {
      status: data.status,
      agentId: data.agentId,
      description: data.description,
      prompt: data.prompt,
      outputFile: data.outputFile,
      ...modelFields(data.resolvedModel, data.modelsUsed),
    },
    issues: unexpected,
  };
};

/** One reader per member of the union: a status is read by the reader of that name. */
const READERS: { readonly [S in AgentResponse['status']]: Reader } = {
  completed: readCompleted,
  async_launched: readLaunched,
};

const READER_OF: ReadonlyMap<unknown, Reader> = new Map(Object.entries(READERS));

/**
 * Reads the `tool_response` a PostToolUse hook receives for an Agent call (hooks.md, "Agent"): the
 * `completed` response of a foreground subagent or the `async_launched` response of a background
 * one. A wrong type or a missing field is an issue and nothing throws; `resolvedModel` is accepted
 * whatever the request's `model` said ("which may differ from the requested model").
 */
export function parseAgentResponse(raw: unknown): AgentResponseParse {
  if (!isRecord(raw)) return failed([error(RESPONSE_ROOT, 'expected an object')]);
  const reader = READER_OF.get(raw.status);
  if (reader !== undefined) return reader(raw);
  const message =
    raw.status === undefined
      ? 'is required'
      : `expected one of ${[...READER_OF.keys()].join(', ')}`;
  return failed([error(`${RESPONSE_ROOT}.status`, message)]);
}
