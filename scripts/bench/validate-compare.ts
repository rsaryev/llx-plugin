/**
 * `bun run bench:validate`: `claude plugin validate <dir>` (the program `CLAUDE_ORACLE_BIN` names,
 * else `claude`) against the kit's `validatePlugin` on a fixed list of corpus plugins, the first 30
 * by `marketplace/name`. Each is run `REPS` times and the median is kept. Columns:
 *
 * - `claude`: one `claude plugin validate <dir>` process, start to exit;
 * - `kit process`: one `bun` process that imports the kit and validates the folder (this script with
 *   `--one <dir>`), the same unit of work as the `claude` column;
 * - `kit in process`: `validatePlugin` alone in a warm process, the cost a host pays per plugin.
 *
 * Both programs also validate an empty folder: the floor of every run, the cost of starting the
 * process with nothing to read (`claude --version` takes a shorter path and is no floor). The
 * plugins' findings are not compared here (that is `bun run corpus`). Nothing is sent anywhere but
 * what `claude plugin validate` does itself.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validatePlugin } from '../../src/index.ts';
import { diskFiles } from '../corpus/disk-files.ts';
import { readCorpusTargets } from '../corpus/location.ts';
import { CLAUDE_BIN, claudeVersion } from '../oracle/claude-bin.ts';

const PLUGINS = 30;
const REPS = 5;

const median = (samples: readonly number[]): number => {
  const sorted = samples.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const value =
    sorted.length % 2 === 1
      ? sorted[middle]
      : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
  return Math.round((value ?? 0) * 10) / 10;
};

const timeOf = async (work: () => Promise<unknown>): Promise<number> => {
  const start = performance.now();
  await work();
  return performance.now() - start;
};

async function spawned(command: readonly string[]): Promise<number> {
  return timeOf(async () => {
    const run = Bun.spawn([...command], { stdout: 'ignore', stderr: 'ignore' });
    await run.exited;
  });
}

async function medianOf(work: () => Promise<number>): Promise<number> {
  const samples: number[] = [];
  for (let rep = 0; rep < REPS; rep++) samples.push(await work());
  return median(samples);
}

/** The child of the `kit process` column: validate one folder and exit. */
async function one(dir: string): Promise<void> {
  const { issues } = await validatePlugin({ files: diskFiles(dir) });
  process.stdout.write(`${issues.length} issues\n`);
}

interface Row {
  readonly plugin: string;
  readonly claude: number;
  readonly 'kit process': number;
  readonly 'kit in process': number;
}

/** The medians of one folder in the three columns. */
const rowOf = async (plugin: string, dir: string): Promise<Row> => ({
  plugin,
  claude: await medianOf(() => spawned([CLAUDE_BIN, 'plugin', 'validate', dir])),
  'kit process': await medianOf(() => spawned([process.execPath, import.meta.path, '--one', dir])),
  'kit in process': await medianOf(() => timeOf(() => validatePlugin({ files: diskFiles(dir) }))),
});

async function compare(): Promise<void> {
  const version = await claudeVersion();
  if (version === undefined) throw new Error(`${CLAUDE_BIN} --version did not run`);
  const targets = (await readCorpusTargets())
    .toSorted((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .slice(0, PLUGINS);
  const empty = await mkdtemp(join(tmpdir(), 'bench-validate-'));
  let floor: Row;
  try {
    floor = await rowOf('(an empty folder: the floor)', empty);
  } finally {
    await rm(empty, { recursive: true });
  }
  const rows: Row[] = [];
  for (const target of targets) rows.push(await rowOf(target.key, target.dir));
  const total = (column: Exclude<keyof Row, 'plugin'>): number =>
    Math.round(rows.reduce((sum, row) => sum + row[column], 0));
  console.log(
    `claude plugin validate (Claude Code ${version}) vs validatePlugin, ${targets.length} plugins, median of ${REPS} runs, ms`,
  );
  console.table([floor, ...rows]);
  console.table([
    {
      plugins: targets.length,
      claude: total('claude'),
      'kit process': total('kit process'),
      'kit in process': total('kit in process'),
    },
  ]);
}

const dir = process.argv[process.argv.indexOf('--one') + 1];
if (process.argv.includes('--one') && dir !== undefined) await one(dir);
else await compare();
