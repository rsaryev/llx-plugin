import type { FetchPolicyFacts } from './fetch-policy.ts';
import type { z } from 'zod';
import { ENGINE_EVENT_NAMES, type ApiEventName, type ModTier } from '../../protocol/mods-events.ts';
import type { HookReport, ModChain } from '../types.ts';
import type { ModHostPorts } from './host-ports.ts';
import type { ModRegistries } from './registries.ts';
import type { RunGate } from './gate.ts';
import type { ReplayLedger } from './replay.ts';
import type { Scope } from './scope.ts';
import type { StateStore } from './state.ts';
import { zodProblem } from '../values.ts';
import { isRecord } from '../../protocol/is-record.ts';

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
  /** The calls a fresh copy of a mod does not make again (`ReplayLedger`), shared by every mod. */
  readonly replay: ReplayLedger;
  /** What the session says about new work: which calls it refuses now (`RunGate`), shared by every mod. */
  readonly gate: RunGate;
  /** Aborts when the mod's module is unloaded: background work stops with it. */
  readonly signal: AbortSignal;
  readonly report: (report: HookReport) => void;
  /** The debug log (troubleshoot.md, "Read the debug log"). */
  readonly debug: (line: string) => void;
  /** The MCP servers the plugin's own manifest lists: the only ones `$.mcp.connect` connects. */
  readonly ownMcpServers: readonly string[];
  /** The working directory of the event the running hook handles, when it is a subagent's. */
  readonly eventCwd?: () => string | undefined;
  /** Built into Claude Code, not installed (`ModPluginRef.isBuiltin`). */
  readonly isBuiltin?: boolean;
  /** What the host knows about a request `$.http.fetch` sends: network policy may stop it (admin.md). */
  readonly fetchPolicy?: FetchPolicyFacts;
  /** Where a command's answer shows now, which `command.run` carries (`CommandPresentation`). */
  readonly presentation?: () => { readonly isFullscreen: boolean; readonly columns: number };
}

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

/**
 * Who made a call, as the `origin` of the event it fires names a plugin: `{ kind: 'plugin', name }`
 * (`PromptOrigin` and the others, claude-code/index.d.ts): the mod whose context the call runs in.
 */
export const pluginOrigin = (deps: Deps): { readonly kind: 'plugin'; readonly name: string } => ({
  kind: 'plugin',
  name: deps.scope.current().origin.plugin,
});

/** `value` as the schema says, or an error that starts with `label`: a mods API call that is misused rejects. */
export function parse<T extends z.ZodType>(label: string, schema: T, value: unknown): z.infer<T> {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw new Error(`${label}: ${zodProblem(parsed.error)}`);
}

/**
 * A registration refuses once the module that made it is gone (troubleshoot.md, "`$.agent.register`
 * refused"): a reload loads a fresh copy of the module, and a call from code still running in the old
 * copy, such as a hook that had not returned yet, would register what no copy owns. The docs name
 * `$.agent.register`; `$.command.register` and `$.tool.register` are refused the same way (judgment).
 */
export function assertLoaded(deps: Deps, name: string): void {
  if (!deps.signal.aborted) return;
  throw new Error(
    `${deps.plugin}: $.${name} refused: the hooks module that made the call is no longer loaded (it was reloaded or removed)`,
  );
}

/** The text of something thrown. */
export const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

type Input = Readonly<Record<string, unknown>>;
type Core = (event: unknown) => Promise<unknown>;

/** The events Claude Code fires itself, some of which are also mods API calls (`config.set`, `session.compact`...). */
const ENGINE_EVENTS: ReadonlySet<string> = new Set(ENGINE_EVENT_NAMES);
export const isEngineEvent = (name: string): boolean => ENGINE_EVENTS.has(name);

/**
 * The calls a refusal resolves, as `{ deny: reason }`, instead of rejecting: `$.session.append`
 * ("`{ deny: reason }` when a plugin above refused it, nothing stored", claude-code/index.d.ts:3051),
 * `$.config.set` ("`{ value }` once written, or `{ deny }`", :3319) and `$.session.identity`
 * (`SessionIdentity` holds `{ deny }`, :12191).
 */
const DENY_RESOLVED: ReadonlySet<string> = new Set<ApiEventName>([
  'session.append',
  'config.set',
  'session.identity',
]);
export const isDenyResolved = (name: string): boolean => DENY_RESOLVED.has(name);

function valueOf(deps: Deps, name: string, answer: unknown): unknown {
  if (isRecord(answer) && typeof answer.deny === 'string' && DENY_RESOLVED.has(name)) {
    return { deny: answer.deny };
  }
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
    caller: context.origin,
    core: answered ? core : async (event) => ({ value: await core(event) }),
  });
  return answered ? answer : valueOf(deps, name, answer);
}

/**
 * A call declared to answer nothing (`FIRED_CALLS`): its event goes through the chain as `call`
 * sends it and the call returns at once. A refusal or a failure has no promise to reject, so it goes
 * to the debug log (troubleshoot.md, "Read the debug log").
 */
export function fire(deps: Deps, name: ApiEventName, input: Input, core: Core): void {
  call(deps, name, input, core).catch((error: unknown) => {
    deps.debug(`${deps.plugin}: $.${name} failed: ${messageOf(error)}`);
  });
}
