import {
  createModsApi,
  createRegistries,
  createRunGate,
  createStateStore,
  withApiRules,
  type ModHostPorts,
  type ModsApiOptions,
  type RunGate,
  type RunLimits,
  type ScopeBook,
} from '../api/index.ts';
import { createModChain } from '../chain/index.ts';
import { createEventRules } from '../events/index.ts';
import type { DenyRuleChecker, MatcherEngine, ModCompiler, ModRuntime } from '../ports.ts';
import type { HookReport, ModChain, RegisteredHook, RegisterTier } from '../types.ts';
import { createModsUi, withUiRules, type ModInterface, type ModsUi } from '../ui/index.ts';
import type { ReplayLedger } from '../api/replay.ts';
import { forgetMod, guardHooks, once, type ApprovalLedger } from './guard.ts';
import type { LoaderEnv, LoadedMod } from './loader.ts';
import { pluginOptions, type ModsPolicyInput } from './policy-input.ts';
import { tagRefusals, withRegisterRules, type RefusalBook } from './register-call.ts';
import { forgettingChain, skipReports, type SkipReports } from './skip-reports.ts';
import { withUnanswered } from './unanswered.ts';
import { GUARD_ID, GUARD_NAME } from '../../protocol/mods-settings.ts';

/** What the host is given (see `ModsHostOptions`, which adds nothing to it). */
export interface Wires {
  readonly ports: ModHostPorts;
  readonly iface: ModInterface;
  readonly runtime: ModRuntime;
  readonly compiler: ModCompiler;
  readonly policy: ModsPolicyInput;
  readonly deny: DenyRuleChecker;
  readonly debug: (line: string) => void;
  readonly report: (report: HookReport) => void;
  readonly signal: AbortSignal;
  readonly unanswered?: (name: string) => string | undefined;
  /** Where the regular expressions of matchers run (`createModChain`); in this thread without one. */
  readonly matcherEngine?: MatcherEngine;
  readonly matcherMs?: number;
  /** The calls a fresh copy of a mod does not make again (`ReplayLedger`). */
  readonly replay?: ReplayLedger;
  /** The run's limits: `--max-turns` and `--max-budget-usd`, or the Agent SDK's turn and spend limits. */
  readonly limits?: RunLimits;
}

export interface Wired {
  /** What the session says about new work: the host tells it of interruptions and the end of input. */
  readonly gate: RunGate;
  readonly chain: ModChain;
  readonly ui: ModsUi;
  /** What the loader needs to load one module. */
  readonly env: LoaderEnv;
  /** A mod the host itself provides, built in: its hooks are registered as given, and `$` is built for it. */
  registerNative(
    name: string,
    tier: RegisterTier,
    hooks: readonly RegisteredHook[],
  ): Promise<LoadedMod>;
  /** Registers the built-in guard as the first `prepend` mod and says it is loaded. */
  registerGuard(): Promise<LoadedMod>;
}

/** The settings of a plugin: the user's `pluginConfigs` entry, with the managed one over it (judgment: the docs do not say which wins). */
const savedOptions = (policy: ModsPolicyInput) => (id: string) => {
  const user = pluginOptions(policy.user, id);
  const managed = pluginOptions(policy.managed, id);
  return user === undefined && managed === undefined ? undefined : { ...user, ...managed };
};

/** The chain of the mods runtime, over the ports the host gave: the skipped-hook lines it reports go through `reports`. */
function chainOf(given: Wires, reports: SkipReports): ModChain {
  const rules = withRegisterRules(withUiRules(withApiRules(createEventRules())));
  const chain = forgettingChain(
    createModChain({
      clock: given.ports.clock,
      rules,
      ...(given.matcherEngine ? { matcherEngine: given.matcherEngine } : {}),
      ...(given.matcherMs === undefined ? {} : { matcherMs: given.matcherMs }),
    }),
    reports,
  );
  return chain;
}

/** What every mod's API shares: the chain it calls through, the state, the registries and the session's gate. */
function sharedOptions(
  given: Wires,
  own: Pick<ModsApiOptions, 'chain' | 'state' | 'gate' | 'report' | 'ui'>,
): Omit<ModsApiOptions, 'canWithhold'> {
  const scopes: ScopeBook = new Map();
  return {
    ...own,
    ports: given.ports,
    registries: createRegistries(),
    scopes,
    ...(given.replay ? { replay: given.replay } : {}),
    debug: given.debug,
  };
}

/** The chain, the interface and the API of the mods runtime, wired over the ports the host gave. */
export function wire(given: Wires): Wired {
  const { ports, policy, debug, signal } = given;
  const reports = skipReports(debug, given.report);
  const { report } = reports;
  const chain = chainOf(given, reports);
  const calls = given.unanswered ? withUnanswered(chain, given.unanswered) : chain;
  const state = createStateStore();
  const gate = createRunGate(ports.session, given.limits);
  const ui = createModsUi({
    chain: calls,
    clock: ports.clock,
    iface: given.iface,
    state,
    signal,
    report,
    debug,
  });
  const shared = sharedOptions(given, { chain: calls, state, gate, report, ui: ui.api });
  const book: RefusalBook = { refusers: new Map() };
  const ledger: ApprovalLedger = { approvers: [] };
  const createApi: LoaderEnv['createApi'] = (ref) =>
    createModsApi({ ...shared, canWithhold: ref.tier !== 'user' }, ref);
  const env: LoaderEnv = {
    chain,
    compiler: given.compiler,
    runtime: given.runtime,
    createApi,
    surface: given.iface.surface(),
    savedOptions: savedOptions(policy),
    signal,
    report,
    debug,
    book,
    ledger,
    onLoaded: (name) => ui.loadMod(name),
  };
  async function registerNative(
    name: string,
    tier: RegisterTier,
    hooks: readonly RegisteredHook[],
  ): Promise<LoadedMod> {
    const handle = await createApi({ name, tier });
    chain.register({ name, api: handle.api }, tier, hooks);
    return {
      id: `${name}@builtin`,
      name,
      tier,
      isBuiltin: true,
      hooks: [],
      uses: { events: [], calls: [], envReads: [], envWrites: [], stateReads: [], stateWrites: [] },
      unload: once(() => {
        chain.unregister(name);
        handle.dispose();
        forgetMod(env, name);
        return Promise.resolve();
      }),
    };
  }
  return {
    gate,
    chain,
    ui,
    env,
    registerNative,
    registerGuard: async () => {
      const hooks = guardHooks({ policy, deny: given.deny, ledger, debug }).map((hook) =>
        tagRefusals(hook, GUARD_NAME, book),
      );
      return { ...(await registerNative(GUARD_NAME, 'prepend', hooks)), id: GUARD_ID };
    },
  };
}
