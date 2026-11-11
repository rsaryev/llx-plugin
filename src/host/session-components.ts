import { type CatalogAgent, type CatalogSource } from '../agents/catalog/index.ts';
import type { AgentExtras } from '../format/agent-record.ts';
import type { PluginIssue } from '../format/issues.ts';
import type { OutputStyle } from '../format/output-style.ts';
import {
  resolveLspServers,
  resolveMcpServers,
  resolveMonitors,
  substituteContent,
  type ResolvedLspServer,
  type ResolvedMcpServer,
  type ResolvedMonitor,
  type ResolvedKind,
  type SubstitutionScope,
} from '../loading/index.ts';
import { currentOf, type SessionCore } from './session-core.ts';
import type { AgentDefinition } from '../protocol/official.ts';
import { scopeOf, type ScopeUse } from './scope.ts';
import type { SessionOptions } from './session-types.ts';
import type { AgentOverrides, AgentPart } from './session-agents.ts';
import type { ActivePlugin } from './state.ts';
import type { Resolved } from './types.ts';
import { isBuiltinAgent } from '../agents/catalog/types.ts';

/** A subagent as a host registers it: the official definition under the name a call uses. */
export interface SessionAgent {
  /** `<plugin>:<name>` (with the folders of a nested file between them) for a plugin agent, else the name. */
  readonly name: string;
  readonly definition: AgentDefinition;
  /** What the file sets that the official definition has no key for: `color`, `isolation`, `cacheTtl`. */
  readonly extras: AgentExtras;
  /**
   * Where it comes from, in the shape of `SessionSkill.source`: a plugin agent's carries the plugin id;
   * a `builtin` has an empty prompt (Claude Code's own is not published).
   */
  readonly source: CatalogSource;
}

export interface ResolveOptions {
  readonly signal?: AbortSignal;
}

export interface AgentsOptions extends ResolveOptions {
  /**
   * Whether the built-in subagents (Explore, Plan, general-purpose...) are listed. Default true; pass
   * false to hand an SDK that has its own built-ins only the others.
   */
  readonly builtin?: boolean;
  /**
   * What this call reads instead of the session's options, as `agentCatalog(overrides)` takes them:
   * the agents a host registers at run time go in `flag` (the `--agents` flag and the SDK `agents`
   * option are one source, sub-agents.md "Choose the subagent scope").
   */
  readonly overrides?: AgentOverrides;
}

export interface ComponentPart {
  /**
   * Every subagent of the session, one definition per name: the built-ins, the `--agents` flag, the
   * agents folders as the last `reloadAgents` read them and the enabled plugins' agents, minus what a
   * deny rule switched off (sub-agents.md, "Choose the subagent scope").
   */
  agents(options?: AgentsOptions): Promise<Resolved<SessionAgent>>;
  mcpServers(options?: ResolveOptions): Promise<Resolved<ResolvedMcpServer>>;
  lspServers(options?: ResolveOptions): Promise<Resolved<ResolvedLspServer>>;
  monitors(options?: ResolveOptions): Promise<Resolved<ResolvedMonitor>>;
  outputStyles(): readonly OutputStyle[];
}

interface Piece<T> {
  readonly resolved: readonly T[];
  readonly issues: readonly PluginIssue[];
}

const joined = <T>(pieces: readonly Piece<T>[]): Resolved<T> => ({
  resolved: pieces.flatMap((piece) => piece.resolved),
  issues: pieces.flatMap((piece) => piece.issues),
});

/** One resolution per plugin, in the order the host was given, joined. */
async function perPlugin<T>(
  use: ScopeUse,
  each: (plugin: ActivePlugin, use: ScopeUse) => Promise<Piece<T>>,
): Promise<Resolved<T>> {
  return joined(await Promise.all(use.state.active.map((plugin) => each(plugin, use))));
}

/** A plugin agent's prompt has its `${...}` references resolved; any other agent's is left as written. */
async function sessionAgent(
  agent: CatalogAgent,
  use: ScopeUse,
  agents: AgentPart,
  signal?: AbortSignal,
): Promise<Piece<SessionAgent>> {
  const owner = agents.pluginOf(agent);
  const prompt: { readonly text: string; readonly issues: readonly PluginIssue[] } =
    owner === undefined
      ? { text: agent.definition.prompt, issues: [] }
      : await substituteContent(
          agent.definition.prompt,
          scopeOf(use, owner, signal),
          `agents.${agent.ownName || agent.name}`,
        );
  return {
    resolved: [
      {
        name: agent.name,
        definition: { ...agent.definition, prompt: prompt.text },
        extras: agent.extras,
        source: agent.source,
      },
    ],
    issues: prompt.issues,
  };
}

async function agentsOf(use: ScopeUse, agents: AgentPart, options: AgentsOptions) {
  const catalog = agents.agentCatalog(options.overrides);
  const listed = catalog.agents.filter(
    (agent) => options.builtin !== false || !isBuiltinAgent(agent),
  );
  const pieces = await Promise.all(
    listed.map((agent) => sessionAgent(agent, use, agents, options.signal)),
  );
  const joinedPieces = joined(pieces);
  return { ...joinedPieces, issues: [...catalog.issues, ...joinedPieces.issues] };
}

/** One kind of process of one plugin, resolved by `loading/resolve` against the plugin's scope. */
const processesOf =
  <R, T>(
    resolve: (plugin: ActivePlugin['plugin'], scope: SubstitutionScope) => Promise<ResolvedKind<R>>,
    listOf: (resolved: R) => readonly T[],
  ) =>
  (signal?: AbortSignal) =>
  async (plugin: ActivePlugin, use: ScopeUse): Promise<Piece<T>> => {
    const done = await resolve(plugin.plugin, scopeOf(use, plugin, signal));
    return { resolved: listOf(done.resolved), issues: done.issues };
  };

const mcpOf = processesOf(resolveMcpServers, (servers) => Object.values(servers));
const lspOf = processesOf(resolveLspServers, (servers) => Object.values(servers));
const monitorsOf = processesOf(resolveMonitors, (monitors) => monitors);

/**
 * The components of the current state's plugins, resolved at each call against the view's ports: the
 * state is read from the core then, so a plugin an update added or dropped is the one resolved.
 */
export function createComponentPart(
  core: SessionCore,
  optionsOf: () => SessionOptions,
  agents: AgentPart,
): ComponentPart {
  const useOf = (): ScopeUse => ({ state: currentOf(core).state, options: optionsOf() });
  return {
    agents: (options = {}) => agentsOf(useOf(), agents, options),
    mcpServers: (options = {}) => perPlugin(useOf(), mcpOf(options.signal)),
    lspServers: (options = {}) => perPlugin(useOf(), lspOf(options.signal)),
    monitors: (options = {}) => perPlugin(useOf(), monitorsOf(options.signal)),
    outputStyles: () =>
      currentOf(core).state.active.flatMap((plugin) => plugin.catalog.outputStyles),
  };
}
