import type { z } from 'zod';
import { MOD_EVENT_NAMES, type ApiEventName, type ModTier } from '../../protocol/mods-events.ts';
import type { HookReport, ModChain } from '../types.ts';
import type { ModHostPorts } from './ports.ts';
import type { ModRegistries } from './registries.ts';
import type { Scope } from './scope.ts';
import type { StateStore } from './state.ts';

/** What every namespace of one mod's `$` needs. */
export interface Deps {
  readonly plugin: string;
  readonly tier: ModTier;
  readonly chain: ModChain;
  readonly scope: Scope;
  readonly ports: ModHostPorts;
  /** What mods registered, shared by every mod. */
  readonly registries: ModRegistries;
  /** `$.state`, shared by every mod. */
  readonly state: StateStore;
  /** Aborts when the mod's module is unloaded: background work stops with it. */
  readonly signal: AbortSignal;
  readonly report: (report: HookReport) => void;
  /** The debug log (troubleshoot.md, "Read the debug log"). */
  readonly debug: (line: string) => void;
  /** The MCP servers the plugin's own manifest lists: the only ones `$.mcp.connect` connects. */
  readonly ownMcpServers: readonly string[];
  /** The working directory of the event the running hook handles, when it is a subagent's. */
  readonly eventCwd?: () => string | undefined;
}

export const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The mods API calls that answer with their event's own result, not `{ value }` (test.md, "Look up
 * what a stub returns": `$.command.run`, `$.tool.call`, `session.send`, `prompt.fill`; the same
 * for `prompt.submit` and, by analogy, `prompt.suggest`, `tool.check` and `agent.spawn`, whose
 * events have a result of their own). Every other call is a call, answered by `{ value }` or `{ deny }`.
 */
const EVENT_ANSWERED = [
  'tool.call',
  'tool.check',
  'command.run',
  'prompt.submit',
  'prompt.fill',
  'prompt.suggest',
  'session.send',
  'agent.spawn',
] as const satisfies readonly ApiEventName[];

const EVENT_ANSWERED_SET: ReadonlySet<string> = new Set(EVENT_ANSWERED);
export const isEventAnswered = (name: string): boolean => EVENT_ANSWERED_SET.has(name);

/** The first problem a zod check found, as one phrase: `path: Invalid input`. */
function describeIssue(error: z.ZodError): string {
  const [first] = error.issues;
  if (!first) return 'does not fit';
  const where = first.path.join('.');
  return where === '' ? first.message : `${where}: ${first.message}`;
}

/** `value` as the schema says, or an error that starts with `label`: a mods API call that is misused rejects. */
export function parse<T extends z.ZodType>(label: string, schema: T, value: unknown): z.infer<T> {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw new Error(`${label}: ${describeIssue(parsed.error)}`);
}

/** The text of something thrown. */
export const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

type Input = Readonly<Record<string, unknown>>;
type Core = (event: unknown) => Promise<unknown>;

/** The events Claude Code fires itself, some of which are also mods API calls (`config.set`, `session.compact`...). */
const ENGINE_EVENTS: ReadonlySet<string> = new Set(MOD_EVENT_NAMES);
export const isEngineEvent = (name: string): boolean => ENGINE_EVENTS.has(name);

function valueOf(deps: Deps, name: string, answer: unknown): unknown {
  if (isRecord(answer) && typeof answer.deny === 'string') {
    throw new Error(`${deps.plugin}: $.${name}: ${answer.deny}`);
  }
  if (isRecord(answer) && 'value' in answer) return answer.value;
  // Judgment: an event Claude Code fires itself has an answer of its own (`{ skip }`, `{ consumed }`); on a call it resolves as it is.
  if (isEngineEvent(name)) return answer;
  throw new Error(`$.${name}: a hook answered neither { value } nor { deny }`);
}

/**
 * One mods API call: it fires the event named for it through the chain, so a mod before this one
 * can observe, rewrite or refuse it, and `core` (the effect, through a port) runs after the last
 * hook (reference.md, "Mods API calls"). The mod's own hooks on the event are skipped: the call
 * is a re-entry. `core` takes the event as the hooks left it.
 */
export async function call(
  deps: Deps,
  name: ApiEventName,
  input: Input,
  core: Core,
): Promise<unknown> {
  const context = deps.scope.current();
  const answered = isEventAnswered(name);
  const answer = await deps.chain.dispatch(name, input, {
    origin: context.origin,
    signal: deps.signal,
    report: deps.report,
    reentry: context.reentry,
    core: answered ? core : async (event) => ({ value: await core(event) }),
  });
  return answered ? answer : valueOf(deps, name, answer);
}
