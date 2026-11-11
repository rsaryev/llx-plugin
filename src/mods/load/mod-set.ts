import { GUARD_NAME } from '../../protocol/mods-settings.ts';
import { TIER_RANK } from '../chain/tiers.ts';
import { loadOne, reloadOne } from './host-support.ts';
import {
  modLineChannel,
  type ModLineChannel,
  type ModLineKind,
  type ModLineSession,
} from './line-channel.ts';
import type { LoadedMod, ModPlugin, ReloadOutcome } from './loader.ts';
import type { LoadLineKind } from './prepare.ts';
import type { ModCandidate } from './policy.ts';
import { GUARD_CANDIDATE, orderMods, orderOne, type OrderedMod } from './order.ts';
import { guardLoads } from './policy.ts';
import type { ModsPolicyInput } from './policy-input.ts';
import { sideloadRefusal } from './plugin-dirs.ts';
import type { Wired } from './wiring.ts';
import { recoverFromCrash } from './crash-recovery.ts';
import { createWorkerHealth, type WorkerHealth } from './health.ts';
import type { ReplayMode } from '../api/replay.ts';
import type { WorkerCrash } from '../ports.ts';

/**
 * The mods a host holds: which plugins it was given, which of them are loaded, and how they come and
 * go (`load`, `loadMod`, `unloadMod`, `reload`, `reloadMod`). A mod is keyed by its name, as the chain
 * is: a plugin loaded again replaces its earlier copy and never adds a second one.
 */

/** A line for people (not the debug log) and where it is read (troubleshoot.md, "Find out why a mod does nothing"). */
export interface ModNotice {
  readonly line: string;
  readonly channel: ModLineChannel;
}

export interface ModLoadReport {
  /** Every mod loaded after the call, in the order they run. */
  readonly loaded: readonly LoadedMod[];
  /** Why a hooks module is not loaded, one line each: `hooks module <id> not loaded: <reason>`, `<mod>: refused by <mod>: <reason>`. */
  readonly lines: readonly string[];
  /** The lines of `lines` a person reads, with the place each is read: `<mod>: hooks module not loaded: <reason>`. */
  readonly notices: readonly ModNotice[];
  /** The message startup exits with when managed settings reject `--plugin-dir` (`disableSideloadFlags`). */
  readonly startupRefusal?: string;
}

export interface ModSetDeps {
  readonly wired: Wired;
  readonly policy: ModsPolicyInput;
  readonly debug: (line: string) => void;
  /** `session.start` for the mods just loaded, or nothing where the host does not fire it. */
  readonly announce: (mods: readonly LoadedMod[], mode: ReplayMode) => Promise<void>;
  /** Forgets what the replay ledger kept of a mod that is gone (`ReplayLedger.forget`). */
  readonly forget: (name: string) => void;
  /** A line for people that comes outside a call to the set: the worker stopped, a call was not made again. */
  readonly notify: (notice: ModNotice) => void;
  /** The session as it is now: read for every line, as hot reloading can be turned on in the middle of it. */
  readonly session: () => ModLineSession;
}

export interface ModSet {
  loaded(): readonly LoadedMod[];
  load(given: readonly ModPlugin[]): Promise<ModLoadReport>;
  loadMod(plugin: ModPlugin): Promise<ModLoadReport>;
  unloadMod(name: string): Promise<boolean>;
  reload(): Promise<ModLoadReport>;
  reloadMod(name: string): Promise<ReloadOutcome | undefined>;
  /** The hooks worker stopped and was replaced (`ModRuntime.onCrash`). */
  crashed(crash: WorkerCrash): Promise<void>;
  /** Unloads every mod and forgets the plugins, so `reload` loads none again. */
  unloadAll(): Promise<void>;
}

/** troubleshoot.md ties the suffix to `hooks module did not load`, not to a refusal by another mod. */
const UNLOADED = '; the version loaded before is unloaded';
const SAYS_UNLOADED: { readonly [K in LoadLineKind]: boolean } = {
  'did-not-load': true,
  'refused-by-mod': false,
};

/** What the set holds, and what it is given. */
interface Ctx extends ModSetDeps {
  loaded: LoadedMod[];
  /** The plugins the host holds: `load` and `loadMod` add to them, `unloadMod` takes one away, `reload` loads them again. */
  known: ModPlugin[];
  /** The stops of the hooks worker; `/reload-plugins` starts the count over. */
  readonly health: WorkerHealth;
}

/** What one call collects. */
interface Out {
  readonly lines: string[];
  readonly notices: ModNotice[];
  /** The mods this call loaded, for `session.start`. */
  readonly mods: LoadedMod[];
}

const newOut = (lines: string[] = [], notices: ModNotice[] = []): Out => ({
  lines,
  notices,
  mods: [],
});

const isGuard = (mod: LoadedMod): boolean => mod.name === GUARD_NAME;

/** The chain's order: tier, then position (a mod with none after those with one); `toSorted` is stable. */
const byRunningOrder = (mods: readonly LoadedMod[]): LoadedMod[] =>
  mods.toSorted(
    (a, b) =>
      TIER_RANK[a.tier] - TIER_RANK[b.tier] ||
      (a.position ?? Number.POSITIVE_INFINITY) - (b.position ?? Number.POSITIVE_INFINITY) ||
      0,
  );

const channelOf = (ctx: Ctx, kind: ModLineKind): ModLineChannel =>
  modLineChannel(ctx.session(), kind);

function skipped(ctx: Ctx, out: Out, candidate: ModCandidate, reason: string): void {
  out.lines.push(`hooks module ${candidate.id} not loaded: ${reason}`);
  out.notices.push({
    line: `${candidate.name}: hooks module not loaded: ${reason}`,
    channel: channelOf(ctx, 'not-loaded'),
  });
}

function without(ctx: Ctx, names: ReadonlySet<string>): ModPlugin[] {
  return ctx.known.filter((plugin) => !names.has(plugin.candidate.name));
}

/** Unloads the mods called `names` (never the guard) and returns the names that were loaded. */
async function unloadNamed(ctx: Ctx, names: ReadonlySet<string>): Promise<ReadonlySet<string>> {
  const gone = ctx.loaded.filter((mod) => names.has(mod.name) && !isGuard(mod));
  for (const mod of gone.toReversed()) await mod.unload();
  ctx.loaded = ctx.loaded.filter((mod) => !gone.includes(mod));
  return new Set(gone.map((mod) => mod.name));
}

/** Unloads every mod, the guard too, and returns their names. */
async function unloadEverything(ctx: Ctx): Promise<ReadonlySet<string>> {
  const names = new Set(ctx.loaded.map((mod) => mod.name));
  for (const mod of ctx.loaded.toReversed()) await mod.unload();
  ctx.loaded = [];
  return names;
}

/** One mod to load: where it goes, its folder, and the names of the mods this call unloaded before it. */
interface Target {
  readonly mod: OrderedMod;
  readonly plugin?: ModPlugin | undefined;
  readonly before: ReadonlySet<string>;
}

/** Loads one ordered mod into the set; its line, if any, goes to `out`. */
async function loadInto(ctx: Ctx, out: Out, target: Target): Promise<void> {
  const { mod, plugin, before } = target;
  const outcome = await loadOne(ctx.wired, mod, plugin?.files);
  if (outcome.mod) {
    ctx.loaded = byRunningOrder([...ctx.loaded, outcome.mod]);
    out.mods.push(outcome.mod);
  }
  if (outcome.line === undefined) return;
  const kind = outcome.kind ?? 'did-not-load';
  const replaced = before.has(mod.candidate.name) && SAYS_UNLOADED[kind];
  const line = replaced ? `${outcome.line}${UNLOADED}` : outcome.line;
  out.lines.push(line);
  out.notices.push({ line, channel: channelOf(ctx, kind) });
}

async function finish(ctx: Ctx, out: Out): Promise<ModLoadReport> {
  for (const line of out.lines) ctx.debug(line);
  await ctx.announce(out.mods, 'first');
  return { loaded: [...ctx.loaded], lines: out.lines, notices: out.notices };
}

const refused = (ctx: Ctx, startupRefusal: string): ModLoadReport => ({
  loaded: [...ctx.loaded],
  lines: [],
  notices: [],
  startupRefusal,
});

/** Loads `given` in the order policy gives; the guard only when it is not loaded already. */
async function loadAll(
  ctx: Ctx,
  given: readonly ModPlugin[],
  before: ReadonlySet<string>,
): Promise<ModLoadReport> {
  const refusal = sideloadRefusal(ctx.policy);
  if (refusal !== undefined) return refused(ctx, refusal);
  const order = orderMods(
    ctx.policy,
    given.map((plugin) => plugin.candidate),
  );
  const out = newOut([...order.notes]);
  for (const skip of order.skipped) skipped(ctx, out, skip.candidate, skip.reason);
  const files = new Map(given.map((plugin) => [plugin.candidate.id, plugin]));
  for (const [position, mod] of order.ordered.entries()) {
    if (mod.candidate.name === GUARD_NAME && ctx.loaded.some(isGuard)) continue;
    const placed = { ...mod, position };
    await loadInto(ctx, out, { mod: placed, plugin: files.get(mod.candidate.id), before });
  }
  return finish(ctx, out);
}

async function startGuard(ctx: Ctx, out: Out): Promise<void> {
  if (!guardLoads(ctx.policy) || ctx.loaded.some(isGuard)) return;
  await loadInto(ctx, out, {
    mod: { candidate: GUARD_CANDIDATE, tier: 'prepend' },
    before: new Set(),
  });
}

async function load(ctx: Ctx, given: readonly ModPlugin[]): Promise<ModLoadReport> {
  const names = new Set(given.map((plugin) => plugin.candidate.name));
  const replaced = await unloadNamed(ctx, names);
  ctx.known = [...without(ctx, names), ...given];
  return loadAll(ctx, given, replaced);
}

async function loadMod(ctx: Ctx, plugin: ModPlugin): Promise<ModLoadReport> {
  const { candidate } = plugin;
  const refusal = sideloadRefusal(ctx.policy);
  if (refusal !== undefined) return refused(ctx, refusal);
  const peers = ctx.known.filter((other) =>
    ctx.loaded.some((mod) => mod.name === other.candidate.name),
  );
  const one = orderOne(
    ctx.policy,
    peers.map((other) => other.candidate),
    candidate,
  );
  const out = newOut();
  if (!one.mod) {
    skipped(ctx, out, candidate, one.skipped?.reason ?? 'not loaded');
    return finish(ctx, out);
  }
  const names = new Set([candidate.name]);
  for (const other of peers)
    if (one.replaces.includes(other.candidate.id)) names.add(other.candidate.name);
  const replaced = await unloadNamed(ctx, names);
  ctx.known = [...without(ctx, names), plugin];
  await startGuard(ctx, out);
  if (one.note !== undefined) out.lines.push(one.note);
  await loadInto(ctx, out, { mod: one.mod, plugin, before: replaced });
  return finish(ctx, out);
}

async function reloadModNamed(ctx: Ctx, name: string): Promise<ReloadOutcome | undefined> {
  const done = await reloadOne(ctx.wired.env, ctx.known, ctx.loaded, name);
  if (!done) return undefined;
  ctx.loaded = byRunningOrder(done.loaded);
  ctx.debug(done.outcome.line);
  if (done.replaced) await ctx.announce([done.replaced], 'first');
  return done.outcome;
}

async function unloadOne(ctx: Ctx, name: string): Promise<boolean> {
  const names = new Set([name]);
  ctx.known = without(ctx, names);
  const gone = (await unloadNamed(ctx, names)).has(name);
  ctx.forget(name);
  return gone;
}

/**
 * Every change to the set runs after the one before it ends (judgment): a stop of the worker that
 * comes in the middle of `reload`, or a second stop in a row, would otherwise both rewrite `loaded`.
 */
const inTurn = (): (<T>(run: () => Promise<T>) => Promise<T>) => {
  let tail: Promise<unknown> = Promise.resolve();
  return (run) => {
    const next = tail.then(run);
    tail = next.catch(() => undefined);
    return next;
  };
};

export function createModSet(deps: ModSetDeps): ModSet {
  const ctx: Ctx = { ...deps, loaded: [], known: [], health: createWorkerHealth() };
  const serial = inTurn();
  return {
    loaded: () => ctx.loaded,
    load: (given) => serial(() => load(ctx, given)),
    loadMod: (plugin) => serial(() => loadMod(ctx, plugin)),
    unloadMod: (name) => serial(() => unloadOne(ctx, name)),
    reload: () =>
      serial(async () => {
        ctx.health.reset();
        return loadAll(ctx, ctx.known, await unloadEverything(ctx));
      }),
    reloadMod: (name) => serial(() => reloadModNamed(ctx, name)),
    crashed: (crash) => serial(() => recoverFromCrash(ctx, crash)),
    // `dispose()`: the plugins are forgotten too, so a disposed host holds none of their files.
    unloadAll: () =>
      serial(async () => {
        await unloadEverything(ctx);
        ctx.known = [];
      }),
  };
}
