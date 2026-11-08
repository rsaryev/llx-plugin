import type { Clock } from '../ports/clock.ts';
import type { PluginStateStore, StateStoreFailure } from '../ports/marketplace.ts';
import { classifyStoreEntry } from './store-layout.ts';

/**
 * The dated copies beside `installed_plugins.json` age out (plugins/loading.md, "Find plugins on
 * disk"; plugins/troubleshooting.md: "the copies age out on the `cleanupPeriodDays` schedule"). The
 * setting: "Claude Code deletes the files in the paths below once they're older than
 * `cleanupPeriodDays` ... The default is 30 days and the minimum is 1; setting `0` fails with a
 * validation error" (claude-directory.md, "Cleaned up automatically").
 *
 * Judgments (spec/judgments.md): a copy is removed once it is strictly older than the period, by
 * the time it was last written; a period that is not a whole number of at least 1 is the default,
 * since the setting would not have validated; only the two kinds of dated copy are ever removed.
 */

export const DEFAULT_CLEANUP_PERIOD_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

const periodMs = (days: number | undefined): number =>
  (days !== undefined && Number.isInteger(days) && days >= 1 ? days : DEFAULT_CLEANUP_PERIOD_DAYS) *
  DAY_MS;

const isDatedCopy = (name: string): boolean => {
  const kind = classifyStoreEntry(name);
  return kind === 'set-aside-copy' || kind === 'unreadable-copy';
};

/** A name directly under the plugins root and when it was last written, in Unix milliseconds. */
export interface AgedName {
  readonly name: string;
  readonly modifiedAtMs: number;
}

/** The dated copies among `entries` that are older than `cleanupPeriodDays` at `nowMs`. */
export function agedCopies(input: {
  readonly entries: readonly AgedName[];
  readonly nowMs: number;
  readonly cleanupPeriodDays?: number | undefined;
}): readonly string[] {
  const limit = periodMs(input.cleanupPeriodDays);
  return input.entries
    .filter((one) => isDatedCopy(one.name) && input.nowMs - one.modifiedAtMs > limit)
    .map((one) => one.name);
}

export interface CopySweep {
  readonly removed: readonly string[];
  /** The removals that failed; the copies stay and are tried again on the next sweep. */
  readonly failures: readonly StateStoreFailure[];
}

/** Lists the root, looks up the age of each dated copy, and removes those that aged out. */
export async function sweepAgedCopies(
  ports: { readonly store: PluginStateStore; readonly clock: Clock },
  options: { readonly cleanupPeriodDays?: number | undefined },
  signal: AbortSignal,
): Promise<CopySweep> {
  const { store, clock } = ports;
  const names = (await store.names(signal)).filter(isDatedCopy);
  const found = await Promise.all(
    names.map(async (name) => ({ name, modifiedAtMs: await store.modifiedAt(name, signal) })),
  );
  const entries = found.flatMap((one) =>
    one.modifiedAtMs === undefined ? [] : [{ name: one.name, modifiedAtMs: one.modifiedAtMs }],
  );
  const aged = agedCopies({
    entries,
    nowMs: clock.now(),
    cleanupPeriodDays: options.cleanupPeriodDays,
  });
  const outcomes = await Promise.all(
    aged.map(async (name) => ({ name, result: await store.remove(name, signal) })),
  );
  return {
    removed: outcomes.filter((one) => one.result === undefined).map((one) => one.name),
    failures: outcomes.flatMap((one) => (one.result === undefined ? [] : [one.result])),
  };
}
