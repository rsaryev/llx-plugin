/**
 * `bun run bench`: how fast the kit does the work a host repeats, measured on the real plugins of
 * the corpus (`bun run corpus:fetch`). Effects are stubbed (a command "runs" in no time), so the
 * numbers are the kit's own cost: reading, host assembly, hook selection and verdicts, skill
 * expansion. Prints the times, then the same work counted by the meter (`corpus-counts.ts`), and
 * writes both to `.cache/bench.json`. Times are not a gate (they depend on the machine); the counts
 * are deterministic for one corpus checkout, and the gate over generated inputs is
 * `tests/bench/counts.test.ts` (docs/TESTING.md, "Benchmarks").
 */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createPluginHost, loadPlugin, type HostPlugin, type Plugin } from '../../src/index.ts';
import { fakeEnvironment, locations, memoryFiles } from '../../src/testing/index.ts';
import type { CommandRunner } from '../../src/index.ts';
import { diskFiles } from '../corpus/disk-files.ts';
import { readCorpusTargets, type CorpusTarget } from '../corpus/location.ts';
import { ROOT } from '../docs/location.ts';
import { pool } from '../corpus/pool.ts';
import { countCorpus, countRow } from './corpus-counts.ts';
import { snapshotOf } from './snapshot.ts';

/** Milliseconds of each call, summarized. */
interface Timing {
  readonly label: string;
  readonly count: number;
  readonly totalMs: number;
  readonly p50: number;
  readonly p95: number;
  readonly max: number;
}

const round = (n: number): number => Math.round(n * 100) / 100;

const summarize = (label: string, samples: readonly number[]): Timing => {
  const sorted = samples.toSorted((a, b) => a - b);
  const at = (q: number): number =>
    sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
  return {
    label,
    count: sorted.length,
    totalMs: round(sorted.reduce((sum, n) => sum + n, 0)),
    p50: round(at(0.5)),
    p95: round(at(0.95)),
    max: round(sorted.at(-1) ?? 0),
  };
};

const timed = async <T>(work: () => Promise<T>): Promise<{ value: T; ms: number }> => {
  const start = performance.now();
  const value = await work();
  return { value, ms: performance.now() - start };
};

/** A command that "runs" at once and allows the call: hook selection and verdicts are what is timed. */
const instantRunner: CommandRunner = {
  run: () => Promise.resolve({ exitCode: 0, stdout: '', stderr: '', timedOut: false }),
};

async function loadAll(targets: readonly CorpusTarget[]) {
  const disk: number[] = [];
  const memory: number[] = [];
  const results = await pool(targets, 8, async (entry) => {
    const fromDisk = await timed(() =>
      loadPlugin({ files: diskFiles(entry.dir), fallbackName: entry.name }),
    );
    disk.push(fromDisk.ms);
    const snapshot = await snapshotOf(entry.dir);
    const fromMemory = await timed(() =>
      loadPlugin({ files: memoryFiles(snapshot), fallbackName: entry.name }),
    );
    memory.push(fromMemory.ms);
    const plugin: Plugin | undefined = fromDisk.value.plugin;
    return plugin === undefined ? [] : [{ id: `${plugin.name}@corpus`, plugin }];
  });
  // The pool keeps the index order, so the sessions take the same plugins on every run.
  const loaded: HostPlugin[] = results.flat();
  return { loaded, disk, memory };
}

async function sessionWork(plugins: readonly HostPlugin[], label: string) {
  const ports = { commands: instantRunner, locations: locations(), environment: fakeEnvironment() };
  const host = await timed(() => Promise.resolve(createPluginHost({ plugins, ports })));
  const open = await timed(() =>
    Promise.resolve(
      host.value.openSession({
        sessionId: 'bench',
        cwd: '/work/app',
        permissionMode: 'default',
        transcriptPath: '/work/app/.transcript.jsonl',
      }),
    ),
  );
  const session = open.value;
  const listing = await timed(() => Promise.resolve(session.skills()));
  const dispatches: number[] = [];
  for (let i = 0; i < 20; i++) {
    const call = await timed(() =>
      session.dispatch(
        'PreToolUse',
        { tool_name: 'Bash', tool_input: { command: 'git status' }, tool_use_id: `t${i}` },
        { signal: AbortSignal.timeout(30_000) },
      ),
    );
    dispatches.push(call.ms);
  }
  return [
    summarize(`${label}: createPluginHost`, [host.ms]),
    summarize(`${label}: openSession`, [open.ms]),
    summarize(`${label}: session.skills()`, [listing.ms]),
    summarize(`${label}: dispatch PreToolUse Bash`, dispatches),
  ];
}

const targets = await readCorpusTargets();
const started = performance.now();
const { loaded, disk, memory } = await loadAll(targets);
const timings = [
  summarize('loadPlugin from disk (per plugin)', disk),
  summarize('loadPlugin from memory (per plugin, kit CPU only)', memory),
  ...(await sessionWork(loaded.slice(0, 20), '20 plugins')),
  ...(await sessionWork(loaded, `all ${loaded.length} plugins`)),
];
const wall = performance.now() - started;
console.log(
  `Bench over ${targets.length} corpus plugins (${loaded.length} loaded), wall ${Math.round(wall)} ms`,
);
console.table(timings);
const counted = await countCorpus(targets);
console.log('Deterministic counts of the same work (the meter, docs/TESTING.md "Benchmarks")');
console.table(counted.map(countRow));
await writeFile(
  join(ROOT, '.cache', 'bench.json'),
  `${JSON.stringify({ wallMs: wall, timings, counts: counted }, null, 2)}\n`,
);
