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
import type { AgentDefinition } from '../protocol/official.ts';
import { scopeOf } from './scope.ts';
import type { ActivePlugin, HostState } from './state.ts';
import type { Resolved } from './types.ts';

/** A plugin agent as a host registers it: the official definition under the namespaced name. */
export interface SessionAgent {
  /** `<plugin>:<name>`, with the folders of a nested file between them. */
  readonly name: string;
  readonly definition: AgentDefinition;
  /** What the file sets that the official definition has no key for: `color`, `isolation`, `cacheTtl`. */
  readonly extras: AgentExtras;
}

export interface ResolveOptions {
  readonly signal?: AbortSignal;
}

export interface ComponentPart {
  agents(options?: ResolveOptions): Promise<Resolved<SessionAgent>>;
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

async function agentsOf(plugin: ActivePlugin, state: HostState, signal?: AbortSignal) {
  const scope = scopeOf(state, plugin, signal);
  const pieces = await Promise.all(
    plugin.catalog.agents.map(async (record, at) => {
      const prompt = await substituteContent(
        record.definition.prompt,
        scope,
        `agents.${record.name || at}`,
      );
      return {
        resolved: [
          {
            name: record.scopedName,
            definition: { ...record.definition, prompt: prompt.text },
            extras: record.extras,
          },
        ],
        issues: prompt.issues,
      };
    }),
  );
  return joined(pieces);
}

export function createComponentPart(state: HostState): ComponentPart {
  return {
    agents: (options = {}) => perPlugin(state, (plugin) => agentsOf(plugin, state, options.signal)),
    mcpServers: (options = {}) =>
      perPlugin(state, async (plugin) => {
        const scope = scopeOf(state, plugin, options.signal);
        const results = await Promise.all(
          Object.entries(plugin.plugin.mcpServers).map(([name, server]) =>
            resolveMcpServer(name, server, scope),
          ),
        );
        return {
          resolved: results.flatMap((result) => present(result.resolved)),
          issues: results.flatMap((result) => result.issues),
        };
      }),
    lspServers: (options = {}) =>
      perPlugin(state, async (plugin) => {
        const scope = scopeOf(state, plugin, options.signal);
        const results = await Promise.all(
          Object.entries(plugin.plugin.lspServers).map(([name, server]) =>
            resolveLspServer(name, server, scope),
          ),
        );
        return {
          resolved: results.map((result) => result.resolved),
          issues: results.flatMap((result) => result.issues),
        };
      }),
    monitors: (options = {}) =>
      perPlugin(state, async (plugin) => {
        const scope = scopeOf(state, plugin, options.signal);
        const results = await Promise.all(
          plugin.plugin.monitors.map((monitor) => resolveMonitor(monitor, scope)),
        );
        return {
          resolved: results.flatMap((result) => present(result.resolved)),
          issues: results.flatMap((result) => result.issues),
        };
      }),
    outputStyles: () => state.active.flatMap((plugin) => plugin.catalog.outputStyles),
  };
}
