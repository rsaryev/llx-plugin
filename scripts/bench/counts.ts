/**
 * `bun run bench:update`: measures the deterministic counts (`measure.ts`) and writes them to the
 * committed baseline, `tests/fixtures/bench/counts.json`; `--check` fails instead when the baseline
 * differs, and `--json` prints the counts (what `tests/bench/counts.test.ts` reads). A broken growth
 * law is printed either way (docs/TESTING.md, "Benchmarks").
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { ROOT } from '../docs/location.ts';
import { brokenLaws } from './laws.ts';
import { measureAll } from './measure.ts';

export const BASELINE_FILE = join(ROOT, 'tests', 'fixtures', 'bench', 'counts.json');

const render = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

if (import.meta.main) {
  const all = await measureAll();
  const text = render(all);
  if (process.argv.includes('--json')) {
    process.stdout.write(text);
  } else {
    for (const broken of brokenLaws(all)) console.error(`law: ${broken}`);
    const current = await readFile(BASELINE_FILE, 'utf8').catch(() => '');
    if (process.argv.includes('--check')) {
      if (current !== text) {
        console.error(`${BASELINE_FILE} is stale: run \`bun run bench:update\``);
        process.exit(1);
      }
    } else if (current !== text) {
      await mkdir(dirname(BASELINE_FILE), { recursive: true });
      await writeFile(BASELINE_FILE, text);
      console.log(`wrote ${BASELINE_FILE}`);
    } else {
      console.log(`${BASELINE_FILE} is current`);
    }
  }
}
