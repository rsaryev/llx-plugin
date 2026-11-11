/**
 * The deterministic work meter (docs/TESTING.md, "Benchmarks"): units of work counted instead of
 * time, so one input gives one number on every run and machine. Counters are named
 * `<area>.<what>` (`files.readText`, `files.bytes`, `cpu.JSON.parse`); only what happens inside
 * `measure` counts, and a counter that stayed at zero is left out of the result. CPU proxies count
 * through `work`, which is silent while a port runs (`inPort`): what a fake port does to answer is
 * the host's cost, not the kit's.
 */

/** Counts of one measurement, by counter name, sorted, zeros left out. */
export type Counts = Readonly<Record<string, number>>;

export interface Tally {
  /** Adds `amount` to `name` while a measurement runs; nothing otherwise. */
  add(name: string, amount?: number): void;
  /**
   * Marks one more use of `key` for `name` (`files.reread`, `files.relist`): the first use of a key
   * in a measurement is free, every next one counts.
   */
  again(name: string, key: string): void;
  /** Counts one unit of the kit's own CPU work, unless a port is answering. */
  work(name: string): void;
  /** Runs `answer`, a port's synchronous part, with `work` silent. */
  inPort<T>(answer: () => T): T;
  /** Runs `work` and returns what it counted. Measurements never nest. */
  measure(work: () => Promise<unknown>): Promise<Counts>;
}

const sorted = (counts: ReadonlyMap<string, number>): Counts =>
  Object.fromEntries(
    [...counts]
      .filter(([, count]) => count !== 0)
      .toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );

export function createTally(): Tally {
  let counts: Map<string, number> | undefined;
  let seen = new Set<string>();
  let ports = 0;
  const add = (name: string, amount = 1): void => {
    if (counts !== undefined) counts.set(name, (counts.get(name) ?? 0) + amount);
  };
  return {
    add,
    work: (name) => {
      if (ports === 0) add(name);
    },
    inPort: (answer) => {
      ports += 1;
      try {
        return answer();
      } finally {
        ports -= 1;
      }
    },
    again: (name, key) => {
      if (counts === undefined) return;
      const id = `${name}\u0000${key}`;
      if (seen.has(id)) add(name);
      else seen.add(id);
    },
    measure: async (work) => {
      if (counts !== undefined) throw new Error('measurements never nest');
      counts = new Map();
      seen = new Set();
      try {
        await work();
        return sorted(counts);
      } finally {
        counts = undefined;
      }
    },
  };
}
