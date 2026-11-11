import type { JsonObject } from '../../foundation/index.ts';
import type { PluginFiles } from '../../ports/index.ts';
import type { ModsApiHandle, ModPluginRef } from '../api/index.ts';
import type { GuestModule, ModCompiler, ModRuntime } from '../ports.ts';
import { evaluate } from './loader-io.ts';
import type { HookReport, ModChain, RegisterTier } from '../types.ts';
import { registeredFrom } from './guest.ts';
import type { OrderedMod } from './order.ts';
import { askToLoad, tagRefusals, type RefusalBook } from './register-call.ts';
import { combineScans } from './scan/index.ts';
import {
  didNotLoad,
  isPrepared,
  messages,
  prepare,
  type LoadOutcome,
  type Prepared,
} from './prepare.ts';
import { forgetMod, once, withApproval, type ApprovalLedger } from './guard.ts';
import type { ModUses, ScannedHook } from './scan/uses.ts';

/**
 * Loading one hooks module (plugins/mods/create.md, "Check what Claude Code reads from your mod";
 * troubleshoot.md, "The mod doesn't load"): read `hooks/hooks.json`, compile the module, scan it,
 * fit the options to `userConfig`, ask the mods before it (`plugin.register`), evaluate it through the
 * host's runtime and register what it registered. Every way it can fail is a line, never a throw.
 */

/** A plugin the host found: what the policy decides on, and its folder. */
export interface ModPlugin {
  readonly candidate: OrderedMod['candidate'];
  readonly files: PluginFiles;
}

export interface LoadedMod {
  readonly id: string;
  readonly name: string;
  readonly tier: RegisterTier;
  /** Where it runs in its tier (`OrderedMod.position`): a reload or a fresh copy keeps it. */
  readonly position?: number;
  /** Built into Claude Code, not installed: `/plugin` does not count it. */
  readonly isBuiltin: boolean;
  readonly hooks: readonly ScannedHook[];
  readonly uses: ModUses;
  /** Unregisters the hooks, stops the module and the mod's background work. */
  unload(): Promise<void>;
}

export interface LoaderEnv {
  readonly chain: ModChain;
  readonly compiler: ModCompiler;
  readonly runtime: ModRuntime;
  readonly createApi: (ref: ModPluginRef) => Promise<ModsApiHandle>;
  readonly surface: string;
  /** `pluginConfigs[id].options` for a plugin id. */
  readonly savedOptions: (id: string) => JsonObject | undefined;
  readonly signal: AbortSignal;
  readonly report: (report: HookReport) => void;
  readonly debug: (line: string) => void;
  readonly book: RefusalBook;
  readonly ledger: ApprovalLedger;
  /** Called once the mod's hooks are registered (the interface part fires `ui.resolve`). */
  readonly onLoaded?: (name: string) => Promise<void>;
}

/** What each loaded module was made from, so a failed reload can put it back. */
const preparedOf = new WeakMap<LoadedMod, Prepared>();

/** Why the host's own step once the hooks are registered failed (`onLoaded`), or `undefined`. */
async function afterLoad(env: LoaderEnv, name: string): Promise<string | undefined> {
  try {
    await env.onLoaded?.(name);
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/** Registers the module's hooks; the mods before it have already answered `plugin.register`. */
async function start(env: LoaderEnv, mod: OrderedMod, prepared: Prepared): Promise<LoadOutcome> {
  const { name } = mod.candidate;
  const uses = combineScans([prepared.scan]);
  const refusal = await askToLoad(env, { plugin: name, tier: mod.tier, uses });
  if (refusal) {
    return { line: `${name}: refused by ${refusal.by}: ${refusal.reason}`, kind: 'refused-by-mod' };
  }
  const handle = await env.createApi({ name, tier: mod.tier, isBuiltin: mod.candidate.isBuiltin });
  const loaded = await evaluate(env, {
    plugin: name,
    entry: prepared.entry,
    code: prepared.run.code,
    format: prepared.run.format,
    options: prepared.options,
    surface: env.surface,
  });
  const guest = loaded.module;
  if (!guest) {
    handle.dispose();
    return didNotLoad(name, messages(loaded.issues) || 'the runtime loaded nothing');
  }
  return register(env, mod, { prepared, handle, guest, uses });
}

/** What `register` puts on the chain: the evaluated module, its `$` and what its scan found. */
interface Started {
  readonly prepared: Prepared;
  readonly handle: ModsApiHandle;
  readonly guest: GuestModule;
  readonly uses: ModUses;
}

/** Registers the evaluated module's hooks and says it is loaded, or why not; a failure leaves nothing behind. */
async function register(env: LoaderEnv, mod: OrderedMod, started: Started): Promise<LoadOutcome> {
  const { name, id } = mod.candidate;
  const { prepared, handle, guest, uses } = started;
  const hooks = guest.hooks.map((hook) =>
    tagRefusals(withApproval(registeredFrom(hook), name, mod.tier, env.ledger), name, env.book),
  );
  const at = mod.position === undefined ? {} : { position: mod.position };
  const issues = env.chain.register({ name, api: handle.api, ...at }, mod.tier, hooks);
  if (issues.length > 0) {
    handle.dispose();
    await guest.dispose();
    return didNotLoad(name, messages(issues));
  }
  // troubleshoot.md: `hooks module first-mod@inline loaded (worker, environment 2, tier user); events: ...`.
  // The worker and its environment belong to the host's runtime, so the line gives the tier and the events (judgment).
  env.debug(`hooks module ${id} loaded (tier ${mod.tier}); events: ${uses.events.join(',')}`);
  const unload = once(async (): Promise<void> => {
    env.chain.unregister(name);
    handle.dispose();
    forgetMod(env, name);
    await guest.dispose();
  });
  const after = await afterLoad(env, name);
  if (after !== undefined) {
    await unload();
    return didNotLoad(name, after);
  }
  const loadedMod: LoadedMod = {
    id,
    name,
    tier: mod.tier,
    ...at,
    isBuiltin: mod.candidate.isBuiltin,
    hooks: prepared.scan.hooks,
    uses,
    unload,
  };
  preparedOf.set(loadedMod, prepared);
  return { mod: loadedMod };
}

/** Loads one hooks module; the plugin's other parts are the host's. */
export async function loadMod(
  env: LoaderEnv,
  mod: OrderedMod,
  files: PluginFiles,
): Promise<LoadOutcome> {
  const prepared = await prepare(env, { candidate: mod.candidate, files });
  if (!isPrepared(prepared)) return prepared;
  return start(env, mod, prepared);
}

/**
 * A fresh copy of a loaded mod's module after the hooks worker was replaced (troubleshoot.md, "`its
 * session.start ran again in a fresh copy`"): the module it was loaded from is evaluated again, with
 * no new read of its files. `current` is unloaded first, by `unload`, whatever the outcome.
 */
export async function restartMod(
  env: LoaderEnv,
  current: LoadedMod,
  mod: OrderedMod,
  unload: (mod: LoadedMod) => Promise<void>,
): Promise<LoadOutcome> {
  const prepared = preparedOf.get(current);
  await unload(current);
  // Every mod the loader returns was prepared; a mod that is not stays off, and says so (judgment).
  if (!prepared)
    return didNotLoad(mod.candidate.name, 'the module it was loaded from is not known');
  return start(env, mod, prepared);
}

/** What reloading one mod came to. */
export interface ReloadOutcome {
  /** The mod now loaded: the new version, or the previous one when the reload failed. */
  readonly mod?: LoadedMod;
  /** The transcript line: the mod and its hooks, or `reload failed, the previous version stays loaded:` and the reason. */
  readonly line: string;
  /** Why the reload failed, and whether a version of the mod still runs: what `changeNotice` reads. */
  readonly failure?: { readonly reason: string; readonly earlierRuns: boolean };
}

/** The reason of a load outcome without the `<mod>: ` that starts its line. */
const reasonOf = (name: string, outcome: LoadOutcome): string =>
  (outcome.line ?? 'the module has no hooks').replace(`${name}: `, '');

/**
 * Reloads one mod after its files changed (reference.md, "Commands": `--plugin-dir` "reloads its
 * hooks module when you save"; troubleshoot.md, "Read the debug log"). A save that breaks the module
 * keeps the version loaded before running. The line wording after the colon is ours (judgment).
 */
export async function reloadMod(
  env: LoaderEnv,
  current: LoadedMod,
  mod: OrderedMod,
  files: PluginFiles,
): Promise<ReloadOutcome> {
  const name = mod.candidate.name;
  const failed = (reason: string): string =>
    `${name}: reload failed, the previous version stays loaded: ${reason}`;
  const next = await prepare(env, { candidate: mod.candidate, files });
  if (!isPrepared(next)) {
    const reason = reasonOf(name, next);
    return { mod: current, line: failed(reason), failure: { reason, earlierRuns: true } };
  }
  const previous = preparedOf.get(current);
  await current.unload();
  const started = await start(env, mod, next);
  if (started.mod) {
    return {
      mod: started.mod,
      line: `${name}: reloaded; hooks: ${started.mod.uses.events.join(',')}`,
    };
  }
  const restored = previous ? await start(env, mod, previous) : {};
  const reason = reasonOf(name, started);
  return {
    ...(restored.mod ? { mod: restored.mod } : {}),
    line: failed(reason),
    failure: { reason, earlierRuns: restored.mod !== undefined },
  };
}
