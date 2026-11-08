import type { PluginIssue } from '../../format/issues.ts';
import { readHooksJsonModules, resolveTypesPath } from '../../format/mod-files.ts';
import { readManifest } from '../../format/manifest.ts';
import type { PluginManifest } from '../../format/manifest-schema.ts';
import type { JsonObject } from '../../foundation/index.ts';
import type { PluginFiles } from '../../ports/index.ts';
import type { ModsApiHandle, ModPluginRef } from '../api/index.ts';
import type { ModCompiler, ModRuntime } from '../ports.ts';
import type { HookReport, ModChain, RegisterTier } from '../types.ts';
import { registeredFrom } from './guest.ts';
import { modOptions } from './options.ts';
import type { OrderedMod } from './order.ts';
import { askToLoad, tagRefusals, type RefusalBook } from './register-call.ts';
import { combineScans, scanHooksModule, type ModScan } from './scan/index.ts';
import { declaredState, missingTypes } from './types-decl.ts';
import { withApproval, type ApprovalLedger } from './guard.ts';
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

/** What loading a plugin came to: the mod, or the line that says why not; neither for a plugin with no hooks module. */
export interface LoadOutcome {
  readonly mod?: LoadedMod;
  readonly line?: string;
}

interface Prepared {
  readonly manifest: PluginManifest;
  readonly entry: string;
  readonly code: string;
  readonly scan: ModScan;
  readonly options: JsonObject;
}

const messages = (issues: readonly PluginIssue[]): string =>
  issues.map((issue) => issue.message).join('; ');

const firstError = (issues: readonly PluginIssue[]): PluginIssue[] =>
  issues.filter((issue) => issue.severity === 'error');

const didNotLoad = (name: string, reason: string): LoadOutcome => ({
  line: `${name}: hooks module did not load: ${reason}`,
});

async function readJson(files: PluginFiles, path: string, signal: AbortSignal): Promise<unknown> {
  const text = await files.readText(path, signal);
  if (text === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch {
    return undefined;
  }
}

/**
 * The static scan of the compiled module, with the types file it needs. The rules are the ones
 * `claude plugin validate` checks: the loader runs "the same static analysis".
 */
async function scanned(
  env: LoaderEnv,
  files: PluginFiles,
  manifest: PluginManifest,
  module: { readonly entry: string; readonly code: string },
): Promise<{ readonly scan: ModScan } | { readonly problem: string }> {
  const typesPath = resolveTypesPath(manifest);
  const types = await files.readText(typesPath, env.signal);
  const scan = scanHooksModule(module.code, module.entry, {
    isEntry: true,
    directory: module.entry.slice(0, Math.max(module.entry.lastIndexOf('/'), 0)),
    ...(types === undefined ? {} : { declaredState: declaredState(types) }),
  });
  const errors = firstError(scan.issues);
  if (errors.length > 0) return { problem: messages(errors) };
  const needed = types === undefined ? missingTypes(scan, module.entry, typesPath) : undefined;
  return needed === undefined ? { scan } : { problem: needed };
}

/** The manifest, the module the plugin names, its compiled code, its scan and its options; or why not. */
async function prepare(env: LoaderEnv, plugin: ModPlugin): Promise<Prepared | LoadOutcome> {
  const { candidate, files } = plugin;
  const manifestRead = readManifest(
    await readJson(files, '.claude-plugin/plugin.json', env.signal),
  );
  if (!manifestRead.manifest) return didNotLoad(candidate.name, messages(manifestRead.issues));
  const modules = readHooksJsonModules(await readJson(files, 'hooks/hooks.json', env.signal));
  const bad = firstError(modules.issues);
  if (bad.length > 0) return didNotLoad(candidate.name, messages(bad));
  if (modules.entry === undefined) return {};
  const compiled = await env.compiler.compile({ files, entry: modules.entry }, env.signal);
  if (compiled.code === undefined) {
    return didNotLoad(candidate.name, messages(compiled.issues) || 'the compiler gave no code');
  }
  const checked = await scanned(env, files, manifestRead.manifest, {
    entry: modules.entry,
    code: compiled.code,
  });
  if ('problem' in checked) return didNotLoad(candidate.name, checked.problem);
  const { scan } = checked;
  const fitted = modOptions(
    candidate.id,
    manifestRead.manifest.userConfig ?? {},
    env.savedOptions(candidate.id),
  );
  if (fitted.issues.length > 0) return didNotLoad(candidate.name, messages(fitted.issues));
  return {
    manifest: manifestRead.manifest,
    entry: modules.entry,
    code: compiled.code,
    scan,
    options: fitted.options,
  };
}

/** What each loaded module was made from, so a failed reload can put it back. */
const preparedOf = new WeakMap<LoadedMod, Prepared>();

const isPrepared = (value: Prepared | LoadOutcome): value is Prepared => 'code' in value;

/** Registers the module's hooks; the mods before it have already answered `plugin.register`. */
async function start(env: LoaderEnv, mod: OrderedMod, prepared: Prepared): Promise<LoadOutcome> {
  const { name, id } = mod.candidate;
  const uses = combineScans([prepared.scan]);
  const refusal = await askToLoad(env, { plugin: name, tier: mod.tier, uses });
  if (refusal) {
    return { line: `${name}: refused by ${refusal.by}: ${refusal.reason}` };
  }
  const handle = await env.createApi({ name, tier: mod.tier });
  const loaded = await env.runtime.load(
    {
      plugin: name,
      entry: prepared.entry,
      code: prepared.code,
      options: prepared.options,
      surface: env.surface,
    },
    env.signal,
  );
  if (!loaded.module) {
    handle.dispose();
    return didNotLoad(name, messages(loaded.issues) || 'the runtime loaded nothing');
  }
  const guest = loaded.module;
  const hooks = guest.hooks.map((hook) => {
    const registered = registeredFrom(hook);
    return tagRefusals(withApproval(registered, name, mod.tier, env.ledger), name, env.book);
  });
  const issues = env.chain.register({ name, api: handle.api }, mod.tier, hooks);
  if (issues.length > 0) {
    handle.dispose();
    await guest.dispose();
    return didNotLoad(name, messages(issues));
  }
  // troubleshoot.md: `hooks module first-mod@inline loaded (worker, environment 2, tier user); events: ...`.
  // The worker and its environment belong to the host's runtime, so the line gives the tier and the events (judgment).
  env.debug(`hooks module ${id} loaded (tier ${mod.tier}); events: ${uses.events.join(',')}`);
  const unload = async (): Promise<void> => {
    env.chain.unregister(name);
    handle.dispose();
    await guest.dispose();
  };
  await env.onLoaded?.(name);
  const loadedMod: LoadedMod = {
    id,
    name,
    tier: mod.tier,
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

/** What reloading one mod came to. */
export interface ReloadOutcome {
  /** The mod now loaded: the new version, or the previous one when the reload failed. */
  readonly mod?: LoadedMod;
  /** The transcript line: the mod and its hooks, or `reload failed, the previous version stays loaded:` and the reason. */
  readonly line: string;
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
  if (!isPrepared(next)) return { mod: current, line: failed(reasonOf(name, next)) };
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
  return { ...(restored.mod ? { mod: restored.mod } : {}), line: failed(reasonOf(name, started)) };
}
