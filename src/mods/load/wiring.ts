import {
  createModsApi,
  createRegistries,
  createRunGate,
  createStateStore,
  withApiRules,
  type ModHostPorts,
  type ModRegistries,
  type ModsApiOptions,
  type RunGate,
  type RunLimits,
  type ScopeBook,
  type StateStore,
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
import { GUARD_NAME } from '../../protocol/mods-settings.ts';
import { MOD_LIMITS } from '../../protocol/mods-limits.ts';
import {
  createGuardProtection,
  type GuardProtection,
  type ManagedModData,
} from './guard-protection.ts';

/** Who owns a toast Claude Code raises itself (judgment: the docs name no owner; no mod's name fits). */
// A slash cannot occur in a mod name, so this UI owner cannot collide with a plugin.
const ENGINE_TOAST_OWNER = '/engine';

/** What the host is given (see `ModsHostOptions`, which adds nothing to it). */
export interface Wires extends ManagedModData {
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
  /** A line about a deny rule a mod tried to lift, for the transcript or the debug log (`guardHooks`). */
  readonly guardNotice?: (line: string) => void;
  /** The run's limits: `--max-turns` and `--max-budget-usd`, or the Agent SDK's turn and spend limits. */
  readonly limits?: RunLimits;
}

export interface Wired {
  /** What the session says about new work: the host tells it of interruptions and the end of input. */
  readonly gate: RunGate;
  /** `$.state`, shared by every mod: the host resets it as `/clear`, `/resume` and `/branch` do. */
  readonly state: StateStore;
  readonly chain: ModChain;
  readonly ui: ModsUi;
  /** What mods registered: a command a user runs is looked up here. */
  readonly registries: ModRegistries;
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
  readonly guardNotes: GuardProtection['notes'];
}

/** The settings of a plugin: the user's `pluginConfigs` entry, with the managed one over it (judgment: the docs do not say which wins). */
const savedOptions = (policy: ModsPolicyInput) => (id: string) => {
  const user = pluginOptions(policy.user, id);
  const managed = pluginOptions(policy.managed, id);
  return user === undefined && managed === undefined ? undefined : { ...user, ...managed };
};

/** The chain of the mods runtime, over the ports the host gave: the skipped-hook lines it reports go through `reports`. */
function chainOf(given: Wires, reports: SkipReports, protection: GuardProtection): ModChain {
  const rules = withRegisterRules(withUiRules(withApiRules(createEventRules())));
  const chain = forgettingChain(
    createModChain({
      clock: given.ports.clock,
      rules,
      admit: protection.admit,
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
  own: Pick<ModsApiOptions, 'chain' | 'state' | 'gate' | 'report' | 'ui' | 'registries'>,
): Omit<ModsApiOptions, 'canWithhold'> {
  const scopes: ScopeBook = new Map();
  return {
    ...own,
    ports: given.ports,
    scopes,
    ...(given.replay ? { replay: given.replay } : {}),
    debug: given.debug,
  };
}

/**
 * The session's gate. The toast of a stop is Claude Code's own, so it carries no mod's name (judgment);
 * `ui` exists by the time a call is refused.
 */
const runGateOf = (given: Wires, ui: ModsUi): RunGate =>
  createRunGate(given.ports.session, given.limits, {
    toast: (text) => ui.toasts.show(ENGINE_TOAST_OWNER, { text, timeoutMs: MOD_LIMITS.toastMs }),
  });

/** The hooks of the built-in guard, each tagged so a refusal names it. */
const guardHooksOf = (given: Wires, ledger: ApprovalLedger, book: RefusalBook) =>
  guardHooks({
    policy: given.policy,
    deny: given.deny,
    ledger,
    debug: given.debug,
    told: new Set(),
    ...(given.guardNotice ? { notice: given.guardNotice } : {}),
  }).map((hook) => tagRefusals(hook, GUARD_NAME, book));

/** The chain, the interface and the API of the mods runtime, wired over the ports the host gave. */
async function nativeMod(
  env: LoaderEnv,
  name: string,
  tier: RegisterTier,
  hooks: readonly RegisteredHook[],
): Promise<LoadedMod> {
  const handle = await env.createApi({ name, tier });
  env.chain.register({ name, api: handle.api, isBuiltin: true }, tier, hooks);
  return {
    id: `${name}@builtin`,
    name,
    tier,
    isBuiltin: true,
    hooks: [],
    uses: { events: [], calls: [], envReads: [], envWrites: [], stateReads: [], stateWrites: [] },
    unload: once(() => {
      env.chain.unregister(name);
      handle.dispose();
      forgetMod(env, name);
      return Promise.resolve();
    }),
  };
}

export function wire(given: Wires): Wired {
  const { ports, policy, debug, signal } = given;
  const reports = skipReports(debug, given.report);
  const { report } = reports;
  const protection = createGuardProtection(given);
  const chain = chainOf(given, reports, protection);
  const calls = given.unanswered ? withUnanswered(chain, given.unanswered) : chain;
  const state = createStateStore();
  const ui = createModsUi({
    chain: calls,
    clock: ports.clock,
    iface: given.iface,
    state,
    signal,
    report,
    debug,
  });
  const gate = runGateOf(given, ui);
  const registries = createRegistries();
  const shared = sharedOptions(given, {
    chain: calls,
    state,
    gate,
    report,
    ui: ui.api,
    registries,
  });
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
  const registerNative: Wired['registerNative'] = (name, tier, hooks) =>
    nativeMod(env, name, tier, hooks);
  return {
    gate,
    state,
    chain,
    ui,
    registries,
    env,
    registerNative,
    guardNotes: (mod) => protection.notes(mod),
    registerGuard: async () => {
      const hooks = guardHooksOf(given, ledger, book);
      return protection.bind(await registerNative(GUARD_NAME, 'prepend', hooks));
    },
  };
}
