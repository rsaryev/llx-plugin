/**
 * The deterministic benchmarks (docs/TESTING.md, "Benchmarks"): units of work the kit asks of its
 * ports and countable CPU proxies, for generated inputs at N, 2N and 4N. The counts are measured in a
 * process of their own (`scripts/bench/counts.ts --json`), so no memo another test warmed changes
 * them, and must equal the committed baseline exactly: a cost that grows or shrinks shows as a diff
 * of `tests/fixtures/bench/counts.json` (`bun run bench:update`). Each measurement also follows its
 * growth law. Not a spec test: the docs promise no cost.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { BASELINE_FILE } from '../../scripts/bench/counts.ts';
import { brokenLaws } from '../../scripts/bench/laws.ts';
import { SCENARIOS } from '../../scripts/bench/scenarios/index.ts';
import { ROOT } from '../../scripts/docs/location.ts';

function measured(): string {
  const run = Bun.spawnSync([process.execPath, 'scripts/bench/counts.ts', '--json'], { cwd: ROOT });
  if (run.exitCode !== 0) throw new Error(run.stderr.toString());
  return run.stdout.toString();
}

/** `AllCounts`, as the counts script writes it. */
const allCountsSchema = z.record(
  z.string(),
  z.object({
    size: z.string(),
    counts: z.record(z.string(), z.record(z.string(), z.record(z.string(), z.number()))),
  }),
);

const text = measured();
const counts = allCountsSchema.parse(JSON.parse(text));

describe('the work meter', () => {
  test('gives the same counts on a second run', () => {
    expect(measured()).toBe(text);
  });

  test('matches the committed baseline (bun run bench:update)', () => {
    expect(counts).toEqual(JSON.parse(readFileSync(BASELINE_FILE, 'utf8')));
  });

  test.each(SCENARIOS.map((scenario) => scenario.id))('%s follows its growth laws', (id) => {
    expect(brokenLaws(counts).filter((broken) => broken.startsWith(`${id} `))).toEqual([]);
  });
});
