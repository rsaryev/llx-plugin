import { createBudget, deepFreeze } from '../../foundation/index.ts';
import { MOD_LIMITS } from '../../protocol/mods-limits.ts';
import type { ModsApi, SkipKind } from '../types.ts';
import { guardApi } from './api-guard.ts';
import { NESTING_EXEMPT, hookMs, type Context } from './context.ts';
import { createDownstream, finish, type Downstream, type Stream } from './downstream.ts';
import {
  REPORTED,
  groupTimedOut,
  refused,
  thrown,
  wrongShape,
  toHookFailure,
  type Failure,
} from './failure.ts';
import { guarded, isAsyncIterator, type Outcome } from './guarded.ts';
import { createCatchNext, createNext, type NextParts } from './next.ts';
import { nestingProblem } from './nesting.ts';
import { reentryFailure } from './reentry.ts';
import type { ChainEntry } from './registry.ts';
import { TIER_RANK } from './tiers.ts';
import { coreStep, hookStep } from './trace.ts';

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
  const started = ctx.clock.now();
  const received = ctx.rules.coreInput(ctx.name, ctx.input, e);
  const out = ctx.options.core(received);
  if (isAsyncIterator(out)) return yield* out;
  const returned = await out;
  coreStep(ctx, { started, received, returned });
  return returned;
}

/**
 * Runs the chain from the first hook at or after `from` whose matcher accepts `e`, then Claude
 * Code's own behaviour. A hook whose matcher could not be tested (the engine refused a pattern or
 * did not answer in time) is skipped like one that failed, and the line says so.
 */
export async function* runFrom(ctx: Context, from: number, e: unknown): Stream {
  const run = { clock: ctx.clock, signal: ctx.options.signal, ms: ctx.matcherMs };
  for (let index = from; index < ctx.chain.length; index += 1) {
    const entry = ctx.chain[index];
    if (!entry) continue;
    if (
      ctx.admit?.({
        event: ctx.name,
        tier: entry.tier,
        isBuiltin: entry.plugin.isBuiltin ?? false,
        input: ctx.input,
      }) === false
    )
      continue;
    const verdict = await entry.matcher.test(e, run);
    if (verdict.matched)
      return yield* invoke({ ctx, entry, index, e, downstream: createDownstream() });
    if (verdict.fault) skipReport({ ctx, entry }, verdict.fault.kind, verdict.fault.reason);
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
    changeProblem: (e) => ctx.rules.changeProblem(ctx.name, site.e, e),
    downstream: site.downstream,
  };
}

/** Why a hook's result is refused: nested too deep, or the wrong shape for the event. */
function resultFailure(site: Site, value: unknown): Failure | undefined {
  const { ctx, entry } = site;
  const exempt = NESTING_EXEMPT.has(ctx.name) || entry.hook.isGenerator;
  const tooDeep = exempt ? null : nestingProblem(value);
  if (tooDeep !== null) return refused(tooDeep);
  const answered = site.downstream.latest() !== undefined;
  const shape = ctx.rules.shapeProblem(ctx.name, value, answered, ctx.input);
  return shape === undefined ? undefined : wrongShape(shape);
}

/** The outcome of a hook that returned `value`: refused when it does not fit, else the value as it counts. */
function judged(site: Site, value: unknown): Outcome {
  const failed = resultFailure(site, value);
  if (failed !== undefined) return { failed };
  const settled = site.ctx.rules.settle(site.ctx.name, value);
  site.ctx.options.observeResult?.(settled);
  return { value: settled };
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
  return judged(site, ended.value);
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
  if (REPORTED[failure.kind]) skipReport(site, failure.skip, failure.reason);
  const latest = site.downstream.latest();
  return latest ? yield* finish(latest) : yield* runFrom(site.ctx, site.index + 1, site.e);
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
  const started = site.ctx.clock.now();
  const skipped = reentryFailure(site.entry.plugin.name, site.ctx.options.reentry);
  const outcome: Outcome = skipped ? { failed: skipped } : yield* attempt(site, hookRun(site));
  if (!('value' in outcome)) return yield* recover(site, outcome.failed);
  noteAnswer(site);
  await hookStep(
    site.ctx,
    { ...site, latest: site.downstream.latest()?.result },
    { started, returned: outcome.value },
  );
  return outcome.value;
}
