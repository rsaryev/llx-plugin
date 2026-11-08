/**
 * `bun run bench`: how fast the kit does the work a host repeats, measured on the real plugins of
 * the corpus (`bun run corpus:fetch`). Effects are stubbed (a command "runs" in no time), so the
 * numbers are the kit's own cost: reading, host assembly, hook selection and verdicts, skill
 * expansion. Prints a table and writes `.cache/bench.json`; compare runs by hand (timings are not
 * a gate: they depend on the machine).
 */
import { exists, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { createPluginHost, loadPlugin, type HostPlugin, type Plugin } from '../../src/index.ts';
import { fakeEnvironment, locations, memoryFiles } from '../../src/testing/index.ts';
import type { CommandRunner } from '../../src/index.ts';
import { diskFiles } from '../corpus/disk-files.ts';
import { CORPUS_DIR } from '../corpus/location.ts';
import { ROOT } from '../docs/location.ts';
import { pool } from '../corpus/pool.ts';
import { snapshotOf } from './snapshot.ts';

const indexSchema = z.array(
  z.object({ marketplace: z.string(), name: z.string(), dir: z.string().optional() }).loose(),
);

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

async function loadAll(dirs: readonly { id: string; name: string; dir: string }[]) {
  const disk: number[] = [];
  const memory: number[] = [];
  const loaded: HostPlugin[] = [];
  await pool(dirs, 8, async (entry) => {
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
    if (plugin !== undefined) loaded.push({ id: `${plugin.name}@corpus`, plugin });
  });
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

const raw: unknown = JSON.parse(await readFile(join(CORPUS_DIR, 'index.json'), 'utf8'));
const dirs = indexSchema
  .parse(raw)
  .flatMap((entry) =>
    entry.dir === undefined
      ? []
      : [{ id: `${entry.marketplace}/${entry.name}`, name: entry.name, dir: entry.dir }],
  );
const present = (
  await Promise.all(dirs.map(async (entry) => ((await exists(entry.dir)) ? entry : undefined)))
).filter((entry) => entry !== undefined);
const started = performance.now();
const { loaded, disk, memory } = await loadAll(present);
const typical = loaded.slice(0, 20);
const timings = [
  summarize('loadPlugin from disk (per plugin)', disk),
  summarize('loadPlugin from memory (per plugin, kit CPU only)', memory),
  ...(await sessionWork(typical, '20 plugins')),
  ...(await sessionWork(loaded, `all ${loaded.length} plugins`)),
];
const wall = performance.now() - started;
console.log(
  `Bench over ${present.length} corpus plugins (${loaded.length} loaded), wall ${Math.round(wall)} ms`,
);
console.table(timings);
await writeFile(
  join(ROOT, '.cache', 'bench.json'),
  `${JSON.stringify({ wallMs: wall, timings }, null, 2)}\n`,
);
