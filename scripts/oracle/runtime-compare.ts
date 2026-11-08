/**
 * `bun run oracle:runtime`: for each fixture of tests/fixtures/runtime, the kit's session
 * (`kit-registry.ts`) against what Claude Code's session registers (`runtime.ts`), per case and
 * field. With `claude` installed it first refreshes each fixture's `expected.json` from the oracle
 * (`--check` fails instead of writing); without it the committed expectations stand. Exits 1 on a
 * difference that is not recorded in `judgments.json`.
 */
import { readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { kitRegistry } from './kit-registry.ts';
import {
  compareRegistries,
  FIXTURES_DIR,
  readExpected,
  readJudgments,
  type FieldVerdict,
  type Judgments,
} from './registry-diff.ts';
import { EXPECTED_FILE, registryOf, runtimeOracle, type Registry } from './runtime.ts';

const CONCURRENCY = 4;
const check = process.argv.includes('--check');
const shown = (value: unknown): string => JSON.stringify(value);

async function inParallel<T, R>(items: readonly T[], work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let at = next++; at < items.length; at = next++) {
        const item = items[at];
        if (item !== undefined) results[at] = await work(item);
      }
    }),
  );
  return results;
}

interface Outcome {
  readonly name: string;
  readonly stale: boolean;
  readonly verdicts: FieldVerdict[];
}

async function runCase(name: string, judgments: Judgments): Promise<Outcome> {
  const dir = join(FIXTURES_DIR, name);
  const committed = await readExpected(dir);
  const init = await runtimeOracle(dir);
  let expected: Registry | undefined = committed;
  let stale = false;
  if (init !== undefined) {
    expected = registryOf(init, name);
    stale = shown(expected) !== shown(committed);
    if (stale && !check)
      await writeFile(join(dir, EXPECTED_FILE), `${JSON.stringify(expected, null, 2)}\n`);
  }
  const verdicts =
    expected === undefined
      ? []
      : compareRegistries(name, await kitRegistry(dir), expected, judgments);
  return { name, stale, verdicts };
}

const judgments = await readJudgments();
const names = (await readdir(FIXTURES_DIR, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .toSorted();
const outcomes = await inParallel(names, (name) => runCase(name, judgments));

let failures = 0;
for (const outcome of outcomes) {
  if (outcome.verdicts.length === 0) {
    failures++;
    console.log(`${outcome.name}: no expectation (run with claude installed)`);
    continue;
  }
  if (outcome.stale && check) failures++;
  const parts = outcome.verdicts.map((verdict) => {
    if (verdict.status === 'differs') failures++;
    return `${verdict.field}=${verdict.status === 'differs' ? 'DIFFERS' : verdict.status === 'judged' ? 'judged' : 'ok'}`;
  });
  const note = outcome.stale
    ? check
      ? '  [expected.json is stale]'
      : '  [expected.json refreshed]'
    : '';
  console.log(`${outcome.name}: ${parts.join(' ')}${note}`);
  for (const verdict of outcome.verdicts.filter((one) => one.status !== 'agrees')) {
    console.log(
      `    ${verdict.field}: oracle ${shown(verdict.expected)} kit ${shown(verdict.kit)}` +
        (verdict.row === undefined ? '' : `  (judgment: ${verdict.row})`),
    );
  }
}
const cells = outcomes.flatMap((outcome) => outcome.verdicts);
const count = (status: FieldVerdict['status']): number =>
  cells.filter((one) => one.status === status).length;
console.log(
  `\n${outcomes.length} cases, ${cells.length} fields: ${count('agrees')} agree, ${count('judged')} judged, ${count('differs')} differ`,
);
process.exit(failures > 0 ? 1 : 0);
