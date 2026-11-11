import type { SpawnTypes } from '../tool-resolution.ts';
import { FALLBACK_AGENT } from './builtin.ts';
import { resolveSubagentType, type AgentCatalog } from './resolve.ts';

/**
 * Who may spawn whom (sub-agents.md, "Restrict which subagents can be spawned", "Let subagents spawn
 * their own subagents" and "Subagent names"). The tool lists decide whether an agent has the Agent
 * tool and which types it may name (`resolveSubagentTools`); this applies that answer to the catalog,
 * counts the layers and decides what a `name` on the call does.
 */

/** Whether the allowlist lets the type through: exact, as an `Agent(Name)` rule compares (spec/judgments.md). */
const spawnAllows = (spawn: SpawnTypes, type: string): boolean =>
  spawn === 'any' || (spawn !== 'none' && spawn.includes(type));

/**
 * The catalog an agent sees through its Agent tool: "This is an allowlist: only the `worker` and
 * `researcher` subagents can be spawned. If the agent tries to spawn any other type, the request
 * fails and the agent sees only the allowed types in its prompt." A built-in outside the list is
 * outside it; a name nothing defines is just not spawnable.
 */
export function spawnableAgents(catalog: AgentCatalog, spawn: SpawnTypes): AgentCatalog {
  if (spawn === 'any') return catalog;
  return {
    ...catalog,
    agents: catalog.agents.filter((agent) => spawnAllows(spawn, agent.name)),
    delegation: catalog.delegation && spawn !== 'none',
  };
}

/**
 * Why an Agent call may not spawn `subagentType` under the caller's `spawnTypes`
 * (`resolveSubagentTools`), or `undefined` when the allowlist lets it through: "the request fails
 * and the agent sees only the allowed types", so the message is `resolveSubagentType`'s over
 * `spawnableAgents`. Whether the type exists is `resolveSubagentType`'s question, not this one's.
 * Judgment (spec/judgments.md): a call without `subagent_type` is `general-purpose` and a fork is
 * the type `fork` (the SDK's `AgentInput`), so a list that names neither refuses them.
 */
export function spawnRefusal(
  catalog: AgentCatalog,
  spawn: SpawnTypes,
  subagentType: string | undefined,
): string | undefined {
  if (spawnAllows(spawn, subagentType ?? FALLBACK_AGENT)) return undefined;
  const refused = resolveSubagentType(spawnableAgents(catalog, spawn), subagentType);
  return refused.ok ? undefined : refused.message;
}

/** "up to three layers below the main conversation". */
export const DEFAULT_SPAWN_DEPTH = 3;

/**
 * `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`: "the number of subagent layers you want below your main
 * conversation". Judgment (spec/judgments.md): the docs name no invalid value, so anything but a
 * positive whole number leaves the default.
 */
export function spawnDepthLimit(value: string | undefined): number {
  const text = value?.trim() ?? '';
  const number = /^\d+$/.test(text) ? Number(text) : 0;
  return number > 0 ? number : DEFAULT_SPAWN_DEPTH;
}

export interface Nesting {
  /** Whether `Agent` is among the agent's tools. */
  readonly agentToolListed: boolean;
  /** Whether a call of it spawns; a fork at the limit lists the tool, which "returns an error instead". */
  readonly spawns: boolean;
}

/**
 * What the depth limit does to an agent `layer` layers below the main conversation (0 is the main
 * conversation, 1 a subagent it spawned). "At the depth limit, Claude Code withholds the `Agent` tool
 * from every subagent except a fork"; "With this value [2], your subagents can delegate to a second
 * layer of their own, and that second layer can't delegate further. Set `1` to turn nesting off."
 */
export function nestingAt(input: {
  readonly layer: number;
  readonly limit: number;
  readonly fork: boolean;
}): Nesting {
  const atLimit = input.layer >= input.limit;
  return { agentToolListed: input.fork || !atLimit, spawns: !atLimit };
}

export interface NamedSubagentInput {
  /** The session started with agent teams enabled. */
  readonly agentTeams: boolean;
  readonly interactive: boolean;
  /** The `name` parameter of the Agent call. */
  readonly name: string | undefined;
  /** The call spawns a fork. */
  readonly fork: boolean;
  /** The call passes `isolation` itself; the subagent's frontmatter does not count. */
  readonly isolationOnCall: boolean;
  /** The main conversation makes the call, not another subagent. */
  readonly fromMainConversation: boolean;
}

export interface NamedSubagent {
  /** Claude can message or resume it by name after it finishes. */
  readonly addressable: boolean;
  readonly launchesAs: 'subagent' | 'teammate';
}

/**
 * What a `name` on the Agent call does (sub-agents.md, "Subagent names"): with agent teams enabled it
 * makes the subagent addressable, and "in an interactive session ... a subagent that Claude spawns
 * from the main conversation with a `name` launches as a teammate instead, unless the call is a fork
 * or passes `isolation` on the call itself". Judgment (spec/judgments.md): without agent teams the
 * `name` parameter is not part of the tool, so it names nothing.
 */
export function namedSubagent(input: NamedSubagentInput): NamedSubagent {
  const named = input.agentTeams && input.name !== undefined;
  const teammate =
    named &&
    input.interactive &&
    input.fromMainConversation &&
    !input.fork &&
    !input.isolationOnCall;
  return { addressable: named, launchesAs: teammate ? 'teammate' : 'subagent' };
}
