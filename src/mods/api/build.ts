import type { HookReport, ModChain, ModsApi, ModsNamespaceApi, RegisterTier } from '../types.ts';
import { agentApi } from './agent.ts';
import { audioApi } from './audio.ts';
import type { Deps } from './call.ts';
import { clockApi } from './clock.ts';
import { commandApi } from './command.ts';
import { configApi } from './config.ts';
import { fireEngineCreate, type ScopeBook } from './engine-create.ts';
import { envApi } from './env.ts';
import { fsApi } from './fs.ts';
import { httpApi } from './http.ts';
import { mcpApi } from './mcp.ts';
import { modelApi } from './model.ts';
import { pluginApi } from './plugin.ts';
import type { ModHostPorts } from './ports.ts';
import { processApi } from './exec.ts';
import { promptApi } from './prompt.ts';
import type { ModRegistries } from './registries.ts';
import { createScope, type Scope } from './scope.ts';
import { sessionApi } from './session.ts';
import { settingsApi } from './settings.ts';
import { stateApi, type StateStore } from './state.ts';
import { storeApi } from './store.ts';
import { telemetryApi } from './telemetry.ts';
import { toolApi } from './tool.ts';
import { turnApi } from './turn.ts';

/** What every mod's `$` shares: the chain its calls fire events through, the ports they reach, what mods registered. */
export interface ModsApiOptions {
  readonly chain: ModChain;
  readonly ports: ModHostPorts;
  readonly registries: ModRegistries;
  readonly state: StateStore;
  /** The scopes of the loaded mods, one entry for each; `createModsApi` adds and removes its own. */
  readonly scopes: ScopeBook;
  readonly report: (report: HookReport) => void;
  readonly debug: (line: string) => void;
  /** `$.ui`, which the interface part of mods builds; without it every `$.ui` call rejects. */
  readonly ui?: (deps: Deps) => ModsNamespaceApi<'ui'>;
  /** The MCP servers a plugin's manifest lists. */
  readonly ownMcpServers?: (plugin: string) => readonly string[];
  /** The working directory of the event the running hook handles, when it is a subagent's. */
  readonly eventCwd?: () => string | undefined;
  /** True when a mod outside the `user` tier answers `engine.create`: it may withhold a namespace. */
  readonly canWithhold?: boolean;
}

export interface ModPluginRef {
  readonly name: string;
  readonly tier: RegisterTier;
}

export interface ModsApiHandle {
  /** The `$` the mod's hooks receive, after the hooks of other mods on `engine.create` changed it. */
  readonly api: ModsApi;
  readonly scope: Scope;
  /** Unloads the mod: its timers stop, what it registered goes, its scope leaves the book. */
  dispose(): void;
}

const rejecting = (method: string) => () =>
  Promise.reject(new Error(`$.ui.${method}: the interface is not available`));

/** Without the interface part of mods every `$.ui` call rejects, saying so. */
const missingUi = (): ModsNamespaceApi<'ui'> => ({
  resolve: () => {
    throw new Error('$.ui.resolve: the interface is not available');
  },
  invalidate: rejecting('invalidate'),
  open: rejecting('open'),
  close: rejecting('close'),
  panes: rejecting('panes'),
  focus: rejecting('focus'),
  scroll: rejecting('scroll'),
  toast: rejecting('toast'),
  notify: rejecting('notify'),
  status: rejecting('status'),
  log: rejecting('log'),
  notice: rejecting('notice'),
  ask: rejecting('ask'),
  copy: rejecting('copy'),
  selection: rejecting('selection'),
  blit: rejecting('blit'),
});

/**
 * `$` for one mod (reference.md, "Mods API methods"): every namespace of the table, each call an
 * event through the chain and then a port. `engine.create` fires once for the mod, and the hooks of
 * other mods may add a namespace to its API or withhold one.
 */
export async function createModsApi(
  options: ModsApiOptions,
  plugin: ModPluginRef,
): Promise<ModsApiHandle> {
  const { name, tier } = plugin;
  const own = { origin: { plugin: name, tier }, reentry: { plugin: name } };
  const scope = createScope(own);
  const background = new AbortController();
  const deps: Deps = {
    plugin: name,
    tier,
    chain: options.chain,
    scope,
    ports: options.ports,
    registries: options.registries,
    state: options.state,
    signal: background.signal,
    report: options.report,
    debug: options.debug,
    ownMcpServers: options.ownMcpServers?.(name) ?? [],
    ...(options.eventCwd ? { eventCwd: options.eventCwd } : {}),
  };
  options.scopes.set(name, scope);
  const built: ModsApi = Object.freeze({
    plugin: pluginApi(deps),
    ui: (options.ui ?? missingUi)(deps),
    command: commandApi(deps),
    tool: toolApi(deps),
    agent: agentApi(deps),
    model: modelApi(deps),
    prompt: promptApi(deps),
    turn: turnApi(deps),
    session: sessionApi(deps),
    config: configApi(deps),
    settings: settingsApi(deps),
    env: envApi(deps),
    fs: fsApi(deps),
    store: storeApi(deps),
    state: stateApi(deps),
    clock: clockApi(deps),
    http: httpApi(deps),
    process: processApi(deps),
    mcp: mcpApi(deps),
    audio: audioApi(deps),
    telemetry: telemetryApi(deps),
  });
  const api = await fireEngineCreate(deps, built, {
    book: options.scopes,
    canWithhold: options.canWithhold ?? false,
  });
  return {
    api,
    scope,
    dispose() {
      background.abort(new Error(`${name} was unloaded`));
      options.scopes.delete(name);
      for (const registry of [
        options.registries.commands,
        options.registries.tools,
        options.registries.agents,
      ]) {
        registry.removePlugin(name);
      }
    },
  };
}
