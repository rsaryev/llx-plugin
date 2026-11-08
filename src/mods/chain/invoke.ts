import { createBudget, deepFreeze } from '../../foundation/index.ts';
import { MOD_LIMITS } from '../../protocol/mods-limits.ts';
import type { ModsApi } from '../types.ts';
import { guardApi } from './api-guard.ts';
import { NESTING_EXEMPT, hookMs, type Context } from './context.ts';
import { createDownstream, finish, type Downstream, type Stream } from './downstream.ts';
import {
  REPORTED,
  groupTimedOut,
  refused,
  thrown,
  toHookFailure,
  type Failure,
} from './failure.ts';
import { guarded, isAsyncIterator, type Outcome } from './guarded.ts';
import { createCatchNext, createNext, type NextParts } from './next.ts';
import { nestingProblem } from './nesting.ts';
import { reentryFailure } from './reentry.ts';
import type { ChainEntry } from './registry.ts';
import { TIER_RANK } from './tiers.ts';

/** A hook of the chain where it is about to run, with what it needs. */
interface Site {
  readonly ctx: Context;
  readonly entry: ChainEntry;
  readonly index: number;
  readonly e: unknown;
  readonly downstream: Downstream;
}

/** What to run for a hook or for its handler, and how long it has. */
interface Run {
  readonly ms: number;
  readonly start: (api: ModsApi, e: unknown, parts: NextParts) => unknown;
}

async function* runCore(ctx: Context, e: unknown): Stream {
  const out = ctx.options.core(e);
  if (isAsyncIterator(out)) return yield* out;
  return await out;
}

/** Runs the chain from the first hook at or after `from` whose matcher accepts `e`, then Claude Code's own behaviour. */
export async function* runFrom(ctx: Context, from: number, e: unknown): Stream {
  for (let index = from; index < ctx.chain.length; index += 1) {
    const entry = ctx.chain[index];
    if (entry?.matcher.test(e))
      return yield* invoke({ ctx, entry, index, e, downstream: createDownstream() });
  }
  return yield* runCore(ctx, e);
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
    runAt: (index, e) => runFrom(ctx, index, e),
    after: site.index + 1,
    tierStart: (tier) => tierStart(ctx, tier),
    downstream: site.downstream,
  };
}

/** Why a hook's result is refused: nested too deep, or the wrong shape for the event. */
function resultProblem(site: Site, value: unknown): string | undefined {
  const { ctx, entry } = site;
  const exempt = NESTING_EXEMPT.has(ctx.name) || entry.hook.isGenerator;
  const tooDeep = exempt ? null : nestingProblem(value);
  return tooDeep ?? ctx.shapeProblem(ctx.name, value);
}

/** One run of a hook or of its handler, under its time limit, until it returns or fails. */
async function* attempt(site: Site, run: Run): AsyncGenerator<unknown, Outcome> {
  const { ctx, entry } = site;
  if (ctx.group?.budget.isExpired())
    return { failed: groupTimedOut(ctx.group.event, ctx.group.budget.ms) };
  const budget = createBudget(ctx.clock, run.ms, ctx.group ? { parent: ctx.group.budget } : {});
  const abandon = new AbortController();
  const signal = AbortSignal.any([ctx.options.signal, abandon.signal]);
  let out: unknown;
  try {
    out = run.start(
      guardApi(entry.plugin.api, budget),
      deepFreeze(site.e),
      partsOf(site, budget, signal),
    );
  } catch (error) {
    budget.dispose();
    return { failed: thrown(error) };
  }
  const ended = yield* guarded(out, { budget, ...(ctx.group ? { group: ctx.group } : {}) });
  budget.dispose();
  if ('failed' in ended) {
    abandon.abort(new Error(ended.failed.message)); // judgment: a hook that failed has its background work stopped
    return ended;
  }
  const problem = resultProblem(site, ended.value);
  return problem === undefined ? ended : { failed: refused(problem) };
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
      handler(api, e, createCatchNext(parts, toHookFailure(failure), earlier)),
  };
}

function report(site: Site, reason: string): void {
  const { entry, ctx } = site;
  const plugin = entry.plugin.name;
  ctx.options.report({
    plugin,
    event: ctx.name,
    reason,
    line: `${plugin}: ${ctx.name} hook skipped: ${reason}`,
  });
}

/**
 * A hook failed (events.md, "Handle a hook that fails"): its `.catch` handler answers in its
 * place; with none, or when the handler fails too, the hook is skipped as if it had no handler. A hook that had called
 * `next` keeps that result and nothing runs a second time; one that had not lets the next handler
 * run in its place.
 */
async function* recover(site: Site, failure: Failure): Stream {
  const groupSpent = site.ctx.group?.budget.isExpired() === true;
  const run = groupSpent ? undefined : catchRun(site, failure);
  const answered = run ? yield* attempt(site, run) : undefined;
  if (answered && 'value' in answered) return answered.value;
  // A handler that fails too leaves the hook skipped as if it had no handler: the hook's own reason is the line.
  if (REPORTED[failure.kind]) report(site, failure.reason);
  const latest = site.downstream.latest();
  return latest ? yield* finish(latest) : yield* runFrom(site.ctx, site.index + 1, site.e);
}

async function* invoke(site: Site): Stream {
  const skipped = reentryFailure(site.entry.plugin.name, site.ctx.options.reentry);
  const outcome: Outcome = skipped ? { failed: skipped } : yield* attempt(site, hookRun(site));
  return 'value' in outcome ? outcome.value : yield* recover(site, outcome.failed);
}
