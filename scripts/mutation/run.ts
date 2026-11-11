/**
 * `bun run mutation <module>`: mutation testing of one `src/<module>` against its own tests only
 * (`tests/<module>`), with StrykerJS's command runner. A mutant the module's tests let live is a
 * behaviour the tests do not pin down. Heavy: run by hand, never in hooks or CI (docs/TESTING.md).
 * Writes `.cache/mutation/<module>.json` (the mutation-testing report schema) and prints the score.
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { ROOT } from '../docs/location.ts';

const MODULE = /^[a-z][a-z-]*$/;
const name = process.argv[2] ?? '';
if (!MODULE.test(name)) {
  console.error('Usage: bun run mutation <module>   (a folder of src/, e.g. rules)');
  process.exit(2);
}

const out = join(ROOT, '.cache', 'mutation');
await mkdir(out, { recursive: true });
const config = join(out, `${name}.config.json`);
await writeFile(
  config,
  `${JSON.stringify(
    {
      testRunner: 'command',
      commandRunner: { command: `bun test --bail tests/${name}` },
      mutate: [`src/${name}/**/*.ts`, `!src/${name}/**/index.ts`],
      ignorePatterns: ['.cache', 'dist', 'coverage', 'examples'],
      tempDirName: `.stryker-tmp-${name}`,
      concurrency: 8,
      timeoutMS: 10_000,
      reporters: ['json', 'clear-text'],
      jsonReporter: { fileName: join(out, `${name}.json`) },
      clearTextReporter: { reportMutants: false, reportScoreTable: true },
      disableTypeChecks: true,
      // TypeScript 7 has no JS API for Stryker's tsconfig rewrite, and bun needs no tsconfig change.
      tsconfigFile: 'no-tsconfig-rewrite.json',
      cleanTempDir: 'always',
    },
    null,
    2,
  )}\n`,
);

const run = Bun.spawn(['bunx', 'stryker', 'run', config], {
  cwd: ROOT,
  stdout: 'inherit',
  stderr: 'inherit',
});
const code = await run.exited;
await rm(config, { force: true });

const reportSchema = z.object({
  files: z.record(
    z.string(),
    z.object({ mutants: z.array(z.object({ status: z.string() }).loose()) }).loose(),
  ),
});
const raw: unknown = JSON.parse(await readFile(join(out, `${name}.json`), 'utf8'));
const statuses = Object.values(reportSchema.parse(raw).files).flatMap((file) =>
  file.mutants.map((mutant) => mutant.status),
);
const count = (status: string): number => statuses.filter((s) => s === status).length;
const killed = count('Killed') + count('Timeout');
const live = count('Survived') + count('NoCoverage');
const score = killed + live === 0 ? 100 : (100 * killed) / (killed + live);
console.log(
  `Mutation ${name}: ${score.toFixed(1)}% (${killed} killed, ${count('Survived')} survived, ${count('NoCoverage')} not covered)`,
);
process.exit(code);
