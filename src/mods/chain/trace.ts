import type { DispatchTrace, HookStep } from '../trace-types.ts';
import type { Context } from './context.ts';
import type { ChainEntry } from './registry.ts';

/**
 * What a dispatch tells `DispatchOptions.trace` (judgment, spec/judgments.md): the hooks that handle
 * the event and the steps the function hooks and Claude Code's own behaviour took. The docs describe
 * the chain's answer and the debug line for a hook that answers without `next`, not a trace.
 */

/** Marks a promise that has not settled when it is asked about. */
const PENDING = Symbol('pending');

/** What `next` gave the hook, when it is already known: the hook's answer is `passed` when it is that value. */
async function beneath(entry: ChainEntry, latest: Promise<unknown> | undefined): Promise<unknown> {
  if (latest === undefined || entry.hook.isGenerator) return PENDING;
  return Promise.race([latest, Promise.resolve(PENDING)]).catch(() => PENDING);
}

/** The steps a dispatch took, when its caller asked for them. */
export interface Steps {
  readonly list: HookStep[];
}

/** The `steps` member of a context: present only when the dispatch is traced. */
export const stepsFor = (options: Pick<Context['options'], 'trace'>): { steps?: Steps } =>
  options.trace === undefined ? {} : { steps: { list: [] } };

/** A function hook answered `returned` for `received`; a generator hook has no single answer, so no step. */
export async function hookStep(
  ctx: Context,
  site: {
    readonly entry: ChainEntry;
    readonly index: number;
    readonly e: unknown;
    readonly latest: Promise<unknown> | undefined;
  },
  facts: { readonly started: number; readonly returned: unknown },
): Promise<void> {
  const { entry } = site;
  if (ctx.steps === undefined || entry.hook.isGenerator) return;
  const passed = (await beneath(entry, site.latest)) === facts.returned;
  ctx.steps.list.push({
    index: site.index,
    plugin: entry.plugin.name,
    tier: entry.tier,
    event: ctx.name,
    outcome: passed ? 'passed' : 'returned',
    ms: Math.max(0, ctx.clock.now() - facts.started),
    received: site.e,
    returned: facts.returned,
  });
}

/** Claude Code's own behaviour answered `returned` for `received`. */
export function coreStep(
  ctx: Context,
  facts: { readonly started: number; readonly received: unknown; readonly returned: unknown },
): void {
  ctx.steps?.list.push({
    index: ctx.chain.length,
    plugin: 'engine',
    tier: 'core',
    event: ctx.name,
    outcome: 'returned',
    ms: Math.max(0, ctx.clock.now() - facts.started),
    received: facts.received,
    returned: facts.returned,
  });
}

/** The trace of a settled dispatch: the steps in chain order. */
export const traceOf = (ctx: Context): DispatchTrace => ({
  chain: ctx.chain.map((entry) => entry.plugin.name),
  steps: (ctx.steps?.list ?? []).toSorted((a, b) => a.index - b.index),
});
