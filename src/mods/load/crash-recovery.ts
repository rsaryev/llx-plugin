import type { WorkerCrash } from '../ports.ts';
import type { ModNotice } from './mod-set.ts';
import { modLineChannel, type ModLineSession } from './line-channel.ts';
import type { WorkerHealth } from './health.ts';
import { restartMod, type LoadedMod, type LoaderEnv, type ModPlugin } from './loader.ts';
import type { ReplayMode } from '../api/replay.ts';

/**
 * What the host does when the hooks worker stopped (plugins/mods/troubleshoot.md, "`it crashed the
 * hooks worker`", "`its session.start ran again in a fresh copy`", "`mods that run in the hooks
 * worker are off for this session`"): the ledger (`health.ts`) says which mods go and which get a
 * fresh copy of their module, and this carries it out and tells people.
 */
export interface CrashCtx {
  loaded: LoadedMod[];
  readonly known: readonly ModPlugin[];
  readonly wired: { readonly env: LoaderEnv };
  readonly health: WorkerHealth;
  readonly debug: (line: string) => void;
  readonly notify: (notice: ModNotice) => void;
  readonly session: () => ModLineSession;
  /** `session.start` for the mods just given a fresh copy, whose repeated calls are not made again. */
  readonly announce: (mods: readonly LoadedMod[], mode: ReplayMode) => Promise<void>;
}

/** A module in a worker that stopped may not answer its disposal; the mod goes all the same (judgment). */
const unloaded = (mod: LoadedMod): Promise<void> => mod.unload().catch(() => undefined);

function tell(ctx: CrashCtx, line: string): void {
  ctx.debug(line);
  ctx.notify({ line, channel: modLineChannel(ctx.session(), 'worker-crash') });
}

async function unloadAll(ctx: CrashCtx, names: ReadonlySet<string>): Promise<void> {
  const gone = ctx.loaded.filter((mod) => names.has(mod.name));
  for (const mod of gone.toReversed()) await unloaded(mod);
  ctx.loaded = ctx.loaded.filter((mod) => !gone.includes(mod));
}

/** A fresh copy of `current`: in its place in the running order, or gone when the module no longer loads. */
async function freshCopy(ctx: CrashCtx, current: LoadedMod): Promise<LoadedMod | undefined> {
  const plugin = ctx.known.find((candidate) => candidate.candidate.name === current.name);
  if (!plugin) return undefined;
  const outcome = await restartMod(
    ctx.wired.env,
    current,
    { candidate: plugin.candidate, tier: current.tier },
    (mod) => unloaded(mod),
  );
  if (outcome.line !== undefined) {
    ctx.debug(outcome.line);
    ctx.notify({ line: outcome.line, channel: modLineChannel(ctx.session(), 'did-not-load') });
  }
  return outcome.mod;
}

async function restartAll(ctx: CrashCtx, names: readonly string[]): Promise<LoadedMod[]> {
  const fresh: LoadedMod[] = [];
  for (const name of names) {
    const current = ctx.loaded.find((mod) => mod.name === name);
    if (!current) continue;
    const next = await freshCopy(ctx, current);
    ctx.loaded = next
      ? ctx.loaded.map((mod) => (mod === current ? next : mod))
      : ctx.loaded.filter((mod) => mod !== current);
    if (next) fresh.push(next);
  }
  return fresh;
}

/** Carries out what one stop of the worker comes to. */
export async function recoverFromCrash(ctx: CrashCtx, crash: WorkerCrash): Promise<void> {
  const mods = ctx.loaded.filter((mod) => !mod.isBuiltin);
  const plan = ctx.health.plan(
    crash,
    mods.map((mod) => mod.name),
  );
  ctx.debug(`hooks worker stopped: ${crash.reason}`);
  await unloadAll(ctx, new Set(plan.unload));
  for (const line of plan.lines) tell(ctx, line);
  await ctx.announce(await restartAll(ctx, plan.restart), 'again');
}
