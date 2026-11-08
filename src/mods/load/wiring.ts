import {
  createModsApi,
  createRegistries,
  createStateStore,
  withApiRules,
  type ModHostPorts,
  type ModsApiOptions,
  type ScopeBook,
} from '../api/index.ts';
import { createModChain } from '../chain/index.ts';
import { createEventRules } from '../events/index.ts';
import type { DenyRuleChecker, ModCompiler, ModRuntime } from '../ports.ts';
import type { HookReport, ModChain, RegisteredHook, RegisterTier } from '../types.ts';
import { createModsUi, withUiRules, type ModInterface, type ModsUi } from '../ui/index.ts';
import { guardHooks, type ApprovalLedger } from './guard.ts';
import type { LoaderEnv, LoadedMod } from './loader.ts';
import type { ModsPolicyInput } from './policy-input.ts';
import { tagRefusals, withRegisterRules, type RefusalBook } from './register-call.ts';
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
}

export interface Wired {
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
  const user = policy.user.pluginConfigs?.[id]?.options;
  const managed = policy.managed?.pluginConfigs?.[id]?.options;
  return user === undefined && managed === undefined ? undefined : { ...user, ...managed };
};

/** The chain, the interface and the API of the mods runtime, wired over the ports the host gave. */
export function wire(given: Wires): Wired {
  const { ports, policy, debug, report, signal } = given;
  const rules = withRegisterRules(withUiRules(withApiRules(createEventRules())));
  const chain = createModChain({ clock: ports.clock, rules });
  const state = createStateStore();
  const scopes: ScopeBook = new Map();
  const ui = createModsUi({
    chain,
    clock: ports.clock,
    iface: given.iface,
    state,
    signal,
    report,
    debug,
  });
  const shared: Omit<ModsApiOptions, 'canWithhold'> = {
    chain,
    ports,
    registries: createRegistries(),
    state,
    scopes,
    report,
    debug,
    ui: ui.api,
  };
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
      unload: () => {
        chain.unregister(name);
        handle.dispose();
        return Promise.resolve();
      },
    };
  }
  return {
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
