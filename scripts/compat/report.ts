/**
 * The compatibility report (docs/SPEC.md): runs every test with a JUnit report, reads which
 * requirements the passing `spec(...)` blocks prove, and writes `docs/COMPATIBILITY.md` with the
 * share proven overall and per category. Only a passing test counts; nothing is claimed by hand.
 *
 *   bun run compat            run the tests and rewrite the report
 *   bun run compat --check    also fail when a test fails or the committed report is stale
 */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from '../docs/location.ts';
import { readRequirements } from '../spec/requirements.ts';
import { proofsOf } from './junit.ts';
import { renderReport } from './render.ts';

const check = process.argv.includes('--check');
const junit = join(ROOT, '.cache', 'junit.xml');
await mkdir(join(ROOT, '.cache'), { recursive: true });

const run = Bun.spawnSync(['bun', 'test', '--reporter=junit', `--reporter-outfile=${junit}`], {
  cwd: ROOT,
  stdout: 'inherit',
  stderr: 'inherit',
});

const file = await readRequirements();
const proofs = proofsOf(await Bun.file(junit).text());
const report = renderReport(file, proofs);
const target = join(ROOT, 'docs', 'COMPATIBILITY.md');
const committed = await Bun.file(target)
  .text()
  .catch(() => '');

if (check && committed !== report.markdown) {
  console.error('docs/COMPATIBILITY.md is stale: run `bun run compat` and commit it.');
  process.exit(1);
}
if (!check) await Bun.write(target, report.markdown);
console.log(report.summary);
process.exit(run.exitCode === 0 ? 0 : 1);
