import type { ModTier } from '../../protocol/mods-events.ts';
import type { TraceEntry, TraceOutcome } from '../trace-types.ts';
import type { Context } from './context.ts';
import { isStreamEvent } from './wildcard.ts';

/**
 * `next.trace` (claude-code/index.d.ts:7039): what settled beneath a hook on its latest `next()`
 * call, an entry per link beneath, nearest first, the engine's last. Each run `next` starts has a
 * slot the link that runs there fills: its own entry once it settles, and a view of what settled
 * beneath it in turn, so a link still running joins in place later and nothing listed leaves.
 */
export interface Slot {
  /** The links a `next.to` went beneath, nearest first: they come before the link that ran. */
  readonly bypassed: TraceEntry[];
  /** The link that ran here, once it settled. */
  own?: TraceEntry;
  /** Its whole time, `next` included: what its caller's own time leaves out. */
  wallMs?: number;
  /** The chunks it yielded up so far, on a streaming event. */
  chunks: number;
  /** What settled beneath it, on its latest `next()` call. */
  beneath: () => readonly TraceEntry[];
}

export const createSlot = (): Slot => ({ bypassed: [], chunks: 0, beneath: () => [] });

/** The trace a hook reads from the slot of its latest `next()` call: frozen data. */
export function traceOfSlot(slot: Slot | undefined): readonly TraceEntry[] {
  if (slot === undefined) return Object.freeze([]);
  const own = slot.own === undefined ? [] : [slot.own];
  return Object.freeze([...slot.bypassed, ...own, ...slot.beneath()]);
}

/** A link of the chain, where it stands: what every entry of it repeats. */
export interface Link {
  readonly index: number;
  readonly plugin: string;
  readonly tier: ModTier;
  readonly received: unknown;
}

/** Fills the slot with the link's entry, once it settled. */
export function settle(
  ctx: Context,
  slot: Slot,
  link: Link,
  facts: {
    readonly outcome: TraceOutcome;
    readonly wallMs: number;
    readonly ownMs: number;
    readonly returned: unknown;
  },
): void {
  slot.wallMs = facts.wallMs;
  slot.own = Object.freeze({
    ...link,
    event: ctx.name,
    outcome: facts.outcome,
    ms: Math.max(0, facts.ownMs),
    ...(isStreamEvent(ctx.name) ? { chunks: slot.chunks } : {}),
    returned: facts.returned,
  });
}

/** The links between `from` and `to` that a `next.to` by `plugin` went beneath, nearest first. */
export function bypassedLinks(
  ctx: Context,
  range: { readonly from: number; readonly to: number; readonly plugin: string },
  received: unknown,
): TraceEntry[] {
  return ctx.chain.slice(range.from, range.to).map((entry, offset) =>
    Object.freeze({
      index: range.from + offset,
      plugin: entry.plugin.name,
      tier: entry.tier,
      event: ctx.name,
      outcome: 'skipped' as const,
      reason: `bypassed by ${range.plugin}`,
      ms: 0,
      received,
      returned: undefined,
    }),
  );
}

/** Counts the chunks a link yields up into its slot, passing them on. */
export async function* counted<T>(
  stream: AsyncGenerator<unknown, T>,
  slot: Slot,
): AsyncGenerator<unknown, T> {
  for (let step = await stream.next(); ; step = await stream.next()) {
    if (step.done) return step.value;
    slot.chunks += 1;
    yield step.value;
  }
}
