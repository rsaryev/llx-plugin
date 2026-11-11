/**
 * Runs every scenario at each of its sizes and returns the exact counts (docs/TESTING.md,
 * "Benchmarks"). Each scenario first runs once at its smallest size, unmeasured, so what the kit does
 * once per process (a lazily built table) is never counted; every measurement then has a salt of
 * its own, so no memo is warm from another. Run it in a process of its own: the result is then the
 * same on every run and every machine.
 */
import { countCpu } from './meter/cpu.ts';
import { createTally, type Counts } from './meter/tally.ts';
import { createBench } from './scenarios/context.ts';
import { SCENARIOS } from './scenarios/index.ts';

/** One scenario's counts: by size, then by measurement. */
export interface ScenarioCounts {
  readonly size: string;
  readonly counts: Readonly<Record<string, Readonly<Record<string, Counts>>>>;
}

export type AllCounts = Readonly<Record<string, ScenarioCounts>>;

const pad = (index: number): string => String(index).padStart(2, '0');

export async function measureAll(): Promise<AllCounts> {
  const tally = createTally();
  const restore = countCpu(tally);
  try {
    for (const [index, scenario] of SCENARIOS.entries()) {
      await scenario.run(scenario.sizes[0] ?? 1, createBench(tally, `w${pad(index)}`));
    }
    const all: Record<string, ScenarioCounts> = {};
    for (const [index, scenario] of SCENARIOS.entries()) {
      const counts: Record<string, Readonly<Record<string, Counts>>> = {};
      for (const [step, size] of scenario.sizes.entries()) {
        counts[String(size)] = await scenario.run(size, createBench(tally, `${pad(index)}${step}`));
      }
      all[scenario.id] = { size: scenario.size, counts };
    }
    return all;
  } finally {
    restore();
  }
}
