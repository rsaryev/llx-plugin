import { expect } from 'bun:test';
import type { CommandResult, McpToolResult } from '../../src/ports/index.ts';
import type { FetchRequest, FetchResponse } from '../../src/mods/api/index.ts';
import type { JsonObject } from '../../src/foundation/index.ts';
import { createModChain } from '../../src/mods/chain/index.ts';
import { EVENT_RULES } from '../../src/mods/events/index.ts';
import {
  createModsApi,
  createRegistries,
  createStateStore,
  API_RULES,
  type ModHostPorts,
  type ModsApiHandle,
  type ModsApiOptions,
  type ScopeBook,
  type StateStore,
} from '../../src/mods/api/index.ts';
import type {
  EventRuleBook,
  HookReport,
  ModChain,
  RegisterTier,
  RegisteredHook,
} from '../../src/mods/types.ts';
import type { ModsUi } from '../../src/mods/ui/index.ts';
import { fixedClock } from './ports.ts';

/** A port call nobody scripted: the test fails at once instead of passing by accident. */
const unscripted = (port: string) => (): never => {
  throw new Error(`unscripted ${port} call`);
};

const never = (name: string): (() => never) => unscripted(name);

/** Every port of the mods API, each failing until a test gives it behaviour; `overrides` replaces whole ports or members. */
function ports(
  clock: ReturnType<typeof fixedClock>,
  overrides: Partial<ModHostPorts>,
): ModHostPorts {
  const defaults: ModHostPorts = {
    clock,
    locations: {
      homeDir: () => '/home/user',
      projectDir: () => '/work',
      pluginRoot: (id) => `/plugins/${id}`,
      pluginData: (id) => Promise.resolve(`/data/${id}`),
      joinPath: (root, relative) => `${root}/${relative}`,
      existingDirectory: () => Promise.resolve(undefined),
    },
    fs: {
      read: never('fs.read'),
      write: never('fs.write'),
      list: never('fs.list'),
      stat: never('fs.stat'),
      exists: never('fs.exists'),
      ancestors: never('fs.ancestors'),
    },
    runner: { run: never('runner.run') },
    spawner: { spawn: never('spawner.spawn') },
    fetcher: { request: never('fetcher.request') },
    mcp: { ensureConnected: never('mcp.ensureConnected'), callTool: never('mcp.callTool') },
    env: { get: never('env.get'), set: never('env.set'), snapshot: () => ({}) },
    store: { read: never('store.read'), write: never('store.write') },
    models: {
      complete: never('models.complete'),
      fork: never('models.fork'),
      classify: never('models.classify'),
    },
    session: {
      messages: never('session.messages'),
      cwd: () => Promise.resolve('/work'),
      root: never('session.root'),
      model: never('session.model'),
      turns: never('session.turns'),
      id: never('session.id'),
      repo: never('session.repo'),
      surfaces: never('session.surfaces'),
      usage: never('session.usage'),
      version: never('session.version'),
      compact: never('session.compact'),
      send: never('session.send'),
      append: never('session.append'),
      authorize: never('session.authorize'),
    },
    prompts: {
      submit: never('prompts.submit'),
      read: never('prompts.read'),
      fill: never('prompts.fill'),
      suggest: never('prompts.suggest'),
      compose: never('prompts.compose'),
    },
    agents: { spawn: never('agents.spawn'), list: never('agents.list') },
    commands: { builtIns: () => ['focus', 'help'], run: never('commands.run') },
    tools: { call: never('tools.call'), check: never('tools.check') },
    turns: { abort: never('turns.abort') },
    config: { list: never('config.list'), set: never('config.set') },
    settings: { layers: never('settings.layers'), merged: never('settings.merged') },
    audio: { play: never('audio.play'), speak: never('audio.speak') },
    theme: { drawn: never('theme.drawn'), changed: never('theme.changed') },
    telemetry: { log: never('telemetry.log'), mark: never('telemetry.mark') },
    account: { identity: never('account.identity') },
    promptBox: { paint: never('promptBox.paint'), media: never('promptBox.media') },
    notifications: { cancel: never('notifications.cancel') },
  };
  return { ...defaults, ...overrides };
}

export interface ApiOptions {
  readonly ports?: Partial<ModHostPorts>;
  readonly plugin?: string;
  readonly tier?: RegisterTier;
  /** The mod is built into Claude Code. */
  readonly isBuiltin?: boolean;
  readonly options?: Partial<ModsApiOptions>;
  /** More rules for the chain (the interface rules `uiRules`, for a test that draws). */
  readonly rules?: () => EventRuleBook;
  /** Builds the interface part on the chain the harness made; its `api` becomes `$.ui`. */
  readonly ui?: (env: UiEnv) => ModsUi;
}

export interface UiEnv {
  readonly chain: ModChain;
  readonly clock: ReturnType<typeof fixedClock>;
  readonly report: (report: HookReport) => void;
  readonly debug: (line: string) => void;
  readonly state: StateStore;
}

/**
 * The mods API of one mod on a real chain, with fake ports. `mod` adds the hooks of another mod
 * (with a `$` of its own) so a test can see an API call through them.
 */
export async function apiHarness(given: ApiOptions = {}) {
  const clock = fixedClock();
  const rules = [EVENT_RULES, API_RULES, ...(given.rules ? [given.rules()] : [])];
  const chain = createModChain({ clock, rules });
  const reports: HookReport[] = [];
  const debug: string[] = [];
  const scopes: ScopeBook = new Map();
  const report = (line: HookReport) => reports.push(line);
  const debugLine = (line: string) => debug.push(line);
  const state = createStateStore();
  const ui = given.ui?.({ chain, clock, report, debug: debugLine, state });
  const shared = {
    ...(ui ? { ui: ui.api } : {}),
    chain,
    ports: ports(clock, given.ports ?? {}),
    registries: createRegistries(),
    state,
    scopes,
    report: (report: HookReport) => reports.push(report),
    debug: (line: string) => debug.push(line),
    ...given.options,
  };
  const build = (name: string, tier: RegisterTier, isBuiltin = false): Promise<ModsApiHandle> =>
    createModsApi(shared, { name, tier, isBuiltin });
  const mine = await build(given.plugin ?? 'my-mod', given.tier ?? 'user', given.isBuiltin);
  const mod = async (
    name: string,
    tier: RegisterTier,
    hooks: readonly RegisteredHook[],
  ): Promise<ModsApiHandle> => {
    const built = await build(name, tier);
    const issues = chain.register({ name, api: built.api }, tier, hooks);
    if (issues.length > 0) throw new Error(issues.map((issue) => issue.message).join('; '));
    return built;
  };
  return { clock, chain, api: mine.api, handle: mine, reports, debug, shared, mod, ui };
}

export const exited = (stdout = '', stderr = '', exitCode: number | null = 0): CommandResult => ({
  exitCode,
  stdout,
  stderr,
  timedOut: false,
});

export const toolResult = (text: string): McpToolResult => ({ isError: false, text });

/** A JSON store in memory, as the `ModStore` port. */
export function memoryStore(initial: JsonObject = {}) {
  let data: JsonObject = initial;
  return {
    writes: [] as JsonObject[],
    read: () => Promise.resolve(data),
    write(_plugin: string, next: JsonObject): Promise<void> {
      data = next;
      this.writes.push(next);
      return Promise.resolve();
    },
  };
}

/** Whether `value` is a stream: an async generator, as a hook on `process.spawn` or `turn.step` is. */
function isStream(value: unknown): value is AsyncGenerator<unknown, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Symbol.asyncIterator in value &&
    'next' in value &&
    typeof value.next === 'function' &&
    'return' in value &&
    typeof value.return === 'function' &&
    'throw' in value &&
    typeof value.throw === 'function'
  );
}

/** A stream a mods API call returned, or a failing test. */
export function streamOf(value: unknown): AsyncGenerator<unknown, unknown> {
  if (isStream(value)) return value;
  throw new Error('not a stream');
}

/** A namespace of `$` has exactly the methods the reference lists. */
export function expectMethods(namespace: unknown, methods: readonly string[]): void {
  if (typeof namespace !== 'object' || namespace === null) throw new Error('not a namespace');
  expect(Object.keys(namespace).toSorted()).toEqual(methods.toSorted());
}

/** One field of a value a call resolved to, which a test knows is an object. */
export function field(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null)
    throw new Error(`not an object: ${String(value)}`);
  return Reflect.get(value, key);
}

export const reply = (
  status: number,
  text = '',
  headers: Record<string, string> = {},
): FetchResponse => ({
  status,
  headers,
  text,
});

/** A fetcher that answers each request from the next scripted reply and records them. */
export function scripted(...replies: FetchResponse[]) {
  const requests: FetchRequest[] = [];
  return {
    requests,
    request: (request: FetchRequest) => {
      requests.push(request);
      const next = replies.shift();
      if (!next) throw new Error('script spent');
      return Promise.resolve(next);
    },
  };
}

/** The `usage` of a model answer: the token counts and cache fields the Claude API reports (api.md, "Cache"; test.md, "Stub what Claude Code would answer"). */
export const modelUsage: JsonObject = {
  input_tokens: 1200,
  output_tokens: 80,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
};
