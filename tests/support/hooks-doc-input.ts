/**
 * Builds an event's input from a JSON example of hooks.md: the common fields of the example become
 * the session, the rest become the event's facts, and the built input must come out as the example.
 */
import { buildHookInput, serializeHookInput } from '../../src/hooks/input/index.ts';
import type { EventFactsOf, HookSession } from '../../src/hooks/contracts.ts';
import type { HookEvent } from '../../src/protocol/official.ts';
import { session } from './hooks-select.ts';

type Json = Record<string, unknown>;

/** The fields the session supplies, as the docs' examples list them. */
const COMMON_FIELDS: readonly string[] = [
  'session_id',
  'prompt_id',
  'transcript_path',
  'cwd',
  'scratchpad_dir',
  'permission_mode',
  'effort',
  'hook_event_name',
  'agent_id',
  'agent_type',
];

const text = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

/** The session a hook of this example runs in: the example's own common fields. */
function sessionOf(event: HookEvent, example: Json): HookSession {
  const permissionMode = text(example['permission_mode']);
  const promptId = text(example['prompt_id']);
  const scratchpadDir = text(example['scratchpad_dir']);
  const agentId = AGENT_EVENTS.includes(event) ? undefined : text(example['agent_id']);
  const agentType = AGENT_EVENTS.includes(event) ? undefined : text(example['agent_type']);
  const agent = agentId === undefined && agentType === undefined ? undefined : {};
  return session({
    sessionId: text(example['session_id']) ?? 's',
    transcriptPath: text(example['transcript_path']) ?? '/t.jsonl',
    cwd: text(example['cwd']) ?? '/w',
    ...(permissionMode === undefined ? {} : { permissionMode }),
    ...(promptId === undefined ? {} : { promptId }),
    ...(scratchpadDir === undefined ? {} : { scratchpadDir }),
    ...(agent === undefined
      ? {}
      : {
          agent: {
            ...(agentId === undefined ? {} : { id: agentId }),
            ...(agentType === undefined ? {} : { type: agentType }),
          },
        }),
  });
}

/** The events whose own facts are `agent_id` and `agent_type`, not the session's agent. */
const AGENT_EVENTS: readonly HookEvent[] = ['SubagentStart', 'SubagentStop'];

/** The event's own fields of the example. */
const factsOfExample = (event: HookEvent, example: Json): Json =>
  Object.fromEntries(
    Object.entries(example).filter(
      ([key]) =>
        !COMMON_FIELDS.includes(key) ||
        (AGENT_EVENTS.includes(event) && (key === 'agent_id' || key === 'agent_type')),
    ),
  );

export interface Built {
  /** The JSON a hook reads, parsed back; `undefined` when the facts make no valid input. */
  readonly wire: Json | undefined;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

/** The input a hook of `event` receives for `facts` in `sessionOverrides`' session. */
export function builtInput(
  event: HookEvent,
  facts: Json,
  sessionOverrides: Partial<HookSession> = {},
): Built {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- facts deliberately carry values of the wrong type, to prove they are refused
  const typed = facts as EventFactsOf<typeof event>;
  const built = buildHookInput(event, typed, { ...session(), ...sessionOverrides });
  const parsed: unknown =
    built.input === undefined ? undefined : JSON.parse(serializeHookInput(built.input));
  return {
    wire:
      typeof parsed === 'object' && parsed !== null
        ? Object.fromEntries(Object.entries(parsed))
        : undefined,
    errors: built.issues.filter((issue) => issue.severity === 'error').map((issue) => issue.path),
    warnings: built.issues
      .filter((issue) => issue.severity === 'warning')
      .map((issue) => issue.path),
  };
}

/** The input built from the example's own facts, in the example's own session. */
export const builtFromExample = (event: HookEvent, example: Json): Built =>
  builtInput(event, factsOfExample(event, example), sessionOf(event, example));
