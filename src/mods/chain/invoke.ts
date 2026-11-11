import { createBudget, deepFreeze } from '../../foundation/index.ts';
import { MOD_LIMITS } from '../../protocol/mods-limits.ts';
import type { ModsApi, SkipKind } from '../types.ts';
import { guardApi } from './api-guard.ts';
import { hookMs, type Context } from './context.ts';
import { createDownstream, finish, type Stream } from './downstream.ts';
import {
  EXPIRED,
  groupTimedOut,
  passesThrough,
  uncaught,
  thrown,
  toHookFailure,
  type Failure,
} from './failure.ts';
import { guarded, type Outcome } from './guarded.ts';
import { watchLinger } from './linger.ts';
import { judged, passedOn, standing, type Site } from './judge.ts';
import type { TraceOutcome } from '../trace-types.ts';
import {
  bypassedLinks,
  counted,
  createSlot,
  settle,
  traceOfSlot,
  type Slot,
} from './link-trace.ts';
import { createCatchNext, createNext, type NextParts } from './next.ts';
import { reentrySkips } from './reentry.ts';
import { TIER_RANK } from './tiers.ts';
import { hookStep } from './trace.ts';
import { runCore } from './core.ts';

/** What to run for a hook or for its handler, and how long it has. */
interface Run {
  readonly ms: number;
  readonly start: (api: ModsApi, e: unknown, parts: NextParts) => unknown;
}

/**
 * Runs the chain from the first hook at or after `from` whose matcher accepts `e`, then Claude
 * Code's own behaviour. A hook whose matcher could not be tested (the engine refused a pattern or
 * did not answer in time) is skipped like one that failed, and the line says so.
 */
export async function* runFrom(
  ctx: Context,
  from: number,
  e: unknown,
  slot: Slot = createSlot(),
): Stream {
  const run = { clock: ctx.clock, signal: ctx.options.signal, ms: ctx.matcherMs };
  for (let index = from; index < ctx.chain.length; index += 1) {
    const entry = ctx.chain[index];
    if (!entry) continue;
    if (
      ctx.admit?.({
        event: ctx.name,
        tier: entry.tier,
        isBuiltin: entry.plugin.isBuiltin ?? false,
        input: ctx.fired,
      }) === false
    )
      continue;
    const verdict = await entry.matcher.test(e, run);
    if (verdict.matched)
      return yield* counted(
        invoke({ ctx, entry, index, e, downstream: createDownstream(), slot }),
        slot,
      );
    if (verdict.fault) skipReport({ ctx, entry }, verdict.fault.kind, verdict.fault.reason);
  }
  return yield* runCore(ctx, e, slot);
}

const tierStart = (ctx: Context, tier: keyof typeof TIER_RANK): number => {
  const found = ctx.chain.findIndex((entry) => entry.rank >= TIER_RANK[tier]);
  return found === -1 ? ctx.chain.length : found;
};

function partsOf(
  site: Site,
  budget: ReturnType<typeof createBudget>,
  signal: AbortSignal,
): NextParts {
  const { ctx, entry } = site;
  return {
    signal,
    origin: ctx.options.origin,
    budget,
    isGenerator: entry.hook.isGenerator,
    tier: entry.tier,
    event: ctx.name,
    runAt: (index, e, slot) => runFrom(ctx, index, e, slot),
    bypassed: (from, to, e) => bypassedLinks(ctx, { from, to, plugin: entry.plugin.name }, e),
    after: site.index + 1,
    tierStart: (tier) => tierStart(ctx, tier),
    changeProblem: (e) => ctx.rule.changeProblem?.(site.e, e),
    downstream: site.downstream,
    plugin: entry.plugin.name,
  };
}

/** One run of a hook or of its handler, under its time limit, until it returns or fails. */
async function* attempt(site: Site, run: Run): AsyncGenerator<unknown, Outcome> {
  const { ctx, entry } = site;
  if (ctx.group?.budget.isExpired())
    return { failed: groupTimedOut(ctx.group.event, ctx.group.budget.ms) };
  const budget = createBudget(ctx.clock, run.ms, ctx.group ? { parent: ctx.group.budget } : {});
  const abandon = new AbortController();
  const signal = AbortSignal.any([ctx.options.signal, abandon.signal]);
  // The hook's frame, for what its own calls skip, lasts until its run (its `next` included) ends.
  const leave = ctx.frames.enter(entry.plugin.name, entry.hook);
  // The hook's own code and every call through its `$` carry its frame (a guest's calls come back
  // through the `$` of this run, `HookCall.api` or `direct.$`, not along the hook's async path).
  const frame = { plugin: entry.plugin.name, hook: entry.hook };
  const within = <R>(call: () => R): R =>
    ctx.running === undefined ? call() : ctx.running.run(frame, call);
  let out: unknown;
  try {
    out = within(() =>
      run.start(
        guardApi(entry.plugin.api, budget, within),
        deepFreeze(site.e),
        partsOf(site, budget, signal),
      ),
    );
  } catch (error) {
    leave();
    budget.dispose();
    return { failed: thrown(error) };
  }
  let ended: Outcome;
  try {
    const watch = watchLinger(ctx.clock, signal, MOD_LIMITS.lingerMs, () => lingerReport(site));
    ended = yield* guarded(out, { budget, watch, ...(ctx.group ? { group: ctx.group } : {}) });
  } finally {
    leave();
  }
  budget.dispose();
  if ('failed' in ended) {
    abandon.abort(new Error(ended.failed.message)); // judgment: a hook that failed has its background work stopped
    return ended;
  }
  return judged(site, await standing(site, ended.value));
}

const hookRun = (site: Site): Run => ({
  ms: hookMs(site.ctx.name),
  start: (api, e, parts) => site.entry.hook.run(api, e, createNext(parts)),
});

function catchRun(site: Site, failure: Failure): Run | undefined {
  const handler = site.entry.hook.catchRun;
  if (!handler) return undefined;
  const earlier = site.downstream.latest();
  return {
    ms: MOD_LIMITS.catchMs,
    start: (api, e, parts) =>
      handler(api, e, createCatchNext(parts, toHookFailure(failure, earlier?.rejected()), earlier)),
  };
}

/** The line for a hook skipped: `my-mod: tool.call hook skipped: threw Error: boom`. */
function skipReport(site: Pick<Site, 'ctx' | 'entry'>, kind: SkipKind, reason: string): void {
  const { entry, ctx } = site;
  const plugin = entry.plugin.name;
  ctx.options.report({
    plugin,
    event: ctx.name,
    kind,
    reason,
    line: `${plugin}: ${ctx.name} hook skipped: ${reason}`,
  });
}

/** The line for a hook still running `lingerMs` after its signal aborted (the words are the kit's). */
function lingerReport(site: Pick<Site, 'ctx' | 'entry'>): void {
  const { entry, ctx } = site;
  const plugin = entry.plugin.name;
  const reason = `still running ${MOD_LIMITS.lingerMs} ms after next.signal aborted`;
  ctx.options.report({
    plugin,
    event: ctx.name,
    kind: 'linger',
    reason,
    line: `${plugin}: ${ctx.name} hook lingering: ${reason}`,
  });
}

/** What settles a link's `next.trace` entry: its outcome and what it settled on. */
type Done = (outcome: TraceOutcome, returned: unknown) => void;

/**
 * A hook failed (events.md, "Handle a hook that fails"): its `.catch` handler answers in its
 * place; with none, or when the handler fails too, the hook is skipped as if it had no handler. A hook that had called
 * `next` keeps that result and nothing runs a second time; one that had not lets the next handler
 * run in its place. A throw that is what its `next` rejected with, let through, is such a failure,
 * its line worded as `uncaught` says.
 */
async function* recover(site: Site, given: Failure, done: Done): Stream {
  const failure = passesThrough(given, site.downstream.latest()?.rejected())
    ? uncaught(given)
    : given;
  const groupSpent = site.ctx.group?.budget.isExpired() === true;
  const run = groupSpent ? undefined : catchRun(site, failure);
  const answered = run ? yield* attempt(site, run) : undefined;
  if (answered && 'value' in answered) {
    done('caught', answered.value);
    return answered.value;
  }
  // A handler that fails too leaves the hook skipped as if it had no handler: the hook's own reason is the line.
  skipReport(site, failure.skip, failure.reason);
  return yield* fallBack(site, EXPIRED[failure.kind], done);
}

/** What stands for a failed hook no handler answered for: its `next` run, or what follows it run in its place. */
async function* fallBack(site: Site, expired: boolean, done: Done): Stream {
  const latest = site.downstream.latest();
  if (latest) {
    const value = yield* finish(latest);
    done(expired ? 'expired' : 'kept', value);
    return value;
  }
  const inPlace = createSlot();
  site.slot.beneath = () => traceOfSlot(inPlace);
  done(expired ? 'expired' : 'skipped', undefined);
  const value = yield* runFrom(site.ctx, site.index + 1, site.e, inPlace);
  site.slot.wallMs = (site.slot.wallMs ?? 0) + (inPlace.wallMs ?? 0);
  return value;
}

/**
 * The debug line for a hook that returned without ever calling `next` (troubleshoot.md, "Another
 * mod's band shows and yours doesn't": `other-mod (user) answered ui.render without next()`). A hook
 * that called `next` and dropped the result gets none.
 */
function noteAnswer(site: Site): void {
  const { ctx, entry } = site;
  if (site.downstream.latest() !== undefined) return;
  ctx.options.debug?.(`${entry.plugin.name} (${entry.tier}) answered ${ctx.name} without next()`);
}

async function* invoke(site: Site): Stream {
  const { ctx, entry, slot, downstream } = site;
  const started = ctx.clock.now();
  slot.beneath = () => traceOfSlot(downstream.latest()?.slot);
  const link = { index: site.index, plugin: entry.plugin.name, tier: entry.tier, received: site.e };
  const done: Done = (outcome, returned) => {
    const wallMs = ctx.clock.now() - started;
    settle(ctx, slot, link, { outcome, wallMs, ownMs: wallMs - downstream.spentMs(), returned });
  };
  try {
    const caller = { plugin: entry.plugin.name, hook: entry.hook, calling: ctx.calling };
    if (reentrySkips(caller, ctx.options.reentry)) return yield* fallBack(site, false, done);
    const outcome: Outcome = yield* attempt(site, hookRun(site));
    if (!('value' in outcome)) return yield* recover(site, outcome.failed, done);
    noteAnswer(site);
    await hookStep(
      ctx,
      { ...site, latest: downstream.latest()?.result },
      { started, returned: outcome.value },
    );
    done(passedOn(site, outcome.value) ? 'passed' : 'returned', outcome.value);
    return outcome.value;
  } catch (error) {
    if (slot.own === undefined) done('rejected', undefined);
    throw error;
  }
}
