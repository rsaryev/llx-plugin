import { isBuiltinAgent, type CatalogAgent, type CatalogSource } from '../agents/catalog/index.ts';
import type { AgentExtras } from '../format/agent-record.ts';
import type { PluginIssue } from '../format/issues.ts';
import type { OutputStyle } from '../format/output-style.ts';
import {
  resolveLspServer,
  resolveMcpServer,
  resolveMonitor,
  substituteContent,
  type ResolvedLspServer,
  type ResolvedMcpServer,
  type ResolvedMonitor,
} from '../loading/index.ts';
import { currentOf, type SessionCore } from './session-core.ts';
import type { AgentDefinition } from '../protocol/official.ts';
import { scopeOf } from './scope.ts';
import type { AgentPart } from './session-agents.ts';
import type { ActivePlugin, HostState } from './state.ts';
import type { Resolved } from './types.ts';

/** A subagent as a host registers it: the official definition under the name a call uses. */
export interface SessionAgent {
  /** `<plugin>:<name>` (with the folders of a nested file between them) for a plugin agent, else the name. */
  readonly name: string;
  readonly definition: AgentDefinition;
  /** What the file sets that the official definition has no key for: `color`, `isolation`, `cacheTtl`. */
  readonly extras: AgentExtras;
  /** Where it comes from; a `builtin` has an empty prompt (Claude Code's own is not published). */
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
  state: HostState,
  each: (plugin: ActivePlugin) => Promise<Piece<T>>,
): Promise<Resolved<T>> {
  return joined(await Promise.all(state.active.map(each)));
}

const present = <T>(value: T | undefined): readonly T[] => (value === undefined ? [] : [value]);

/** A plugin agent's prompt has its `${...}` references resolved; any other agent's is left as written. */
async function sessionAgent(
  agent: CatalogAgent,
  state: HostState,
  agents: AgentPart,
  signal?: AbortSignal,
): Promise<Piece<SessionAgent>> {
  const owner = agents.pluginOf(agent);
  const prompt: { readonly text: string; readonly issues: readonly PluginIssue[] } =
    owner === undefined
      ? { text: agent.definition.prompt, issues: [] }
      : await substituteContent(
          agent.definition.prompt,
          scopeOf(state, owner, signal),
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

async function agentsOf(state: HostState, agents: AgentPart, options: AgentsOptions) {
  const catalog = agents.agentCatalog();
  const listed = catalog.agents.filter(
    (agent) => options.builtin !== false || !isBuiltinAgent(agent),
  );
  const pieces = await Promise.all(
    listed.map((agent) => sessionAgent(agent, state, agents, options.signal)),
  );
  const joinedPieces = joined(pieces);
  return { ...joinedPieces, issues: [...catalog.issues, ...joinedPieces.issues] };
}

async function mcpOf(plugin: ActivePlugin, state: HostState, signal?: AbortSignal) {
  const scope = scopeOf(state, plugin, signal);
  const results = await Promise.all(
    Object.entries(plugin.plugin.mcpServers).map(([name, server]) =>
      resolveMcpServer(name, server, scope),
    ),
  );
  return {
    resolved: results.flatMap((result) => present(result.resolved)),
    issues: results.flatMap((result) => result.issues),
  };
}

async function lspOf(plugin: ActivePlugin, state: HostState, signal?: AbortSignal) {
  const scope = scopeOf(state, plugin, signal);
  const results = await Promise.all(
    Object.entries(plugin.plugin.lspServers).map(([name, server]) =>
      resolveLspServer(name, server, scope),
    ),
  );
  return {
    resolved: results.map((result) => result.resolved),
    issues: results.flatMap((result) => result.issues),
  };
}

async function monitorsOf(plugin: ActivePlugin, state: HostState, signal?: AbortSignal) {
  const scope = scopeOf(state, plugin, signal);
  const results = await Promise.all(
    plugin.plugin.monitors.map((monitor) => resolveMonitor(monitor, scope)),
  );
  return {
    resolved: results.flatMap((result) => present(result.resolved)),
    issues: results.flatMap((result) => result.issues),
  };
}

/**
 * The components of the current state's plugins, resolved at each call: the state is read from the
 * core then, so a plugin an update added or dropped is the one resolved.
 */
export function createComponentPart(core: SessionCore, agents: AgentPart): ComponentPart {
  const stateOf = (): HostState => currentOf(core).state;
  return {
    agents: (options = {}) => {
      const state = stateOf();
      return agentsOf(state, agents, options);
    },
    mcpServers: (options = {}) => {
      const state = stateOf();
      return perPlugin(state, (plugin) => mcpOf(plugin, state, options.signal));
    },
    lspServers: (options = {}) => {
      const state = stateOf();
      return perPlugin(state, (plugin) => lspOf(plugin, state, options.signal));
    },
    monitors: (options = {}) => {
      const state = stateOf();
      return perPlugin(state, (plugin) => monitorsOf(plugin, state, options.signal));
    },
    outputStyles: () => stateOf().active.flatMap((plugin) => plugin.catalog.outputStyles),
  };
}
