/**
 * The deterministic side of `bun run bench`: the same work as the timed pass, over the same corpus,
 * counted by the meter (`meter/`) instead of timed. One corpus checkout gives one set of counts on
 * every run and machine, so a change in a count is a change in the kit's work.
 */
import { createPluginHost, loadPlugin, type HostPlugin } from '../../src/index.ts';
import { fakeEnvironment, locations } from '../../src/testing/index.ts';
import type { CommandRunner, HostPorts } from '../../src/index.ts';
import { diskFiles } from '../corpus/disk-files.ts';
import type { CorpusTarget } from '../corpus/location.ts';
import { countCpu } from './meter/cpu.ts';
import { countedFiles, countedPorts } from './meter/ports.ts';
import { createTally, type Counts, type Tally } from './meter/tally.ts';

/** The counters the table shows; the JSON keeps every counter. */
export const SHOWN = [
  'files.readText',
  'files.bytes',
  'cpu.JSON.parse',
  'cpu.yaml.parse',
  'cpu.RegExp',
  'cpu.RegExp.exec',
] as const;

export interface CountedStage {
  readonly label: string;
  readonly counts: Counts;
}

const instantRunner: CommandRunner = {
  run: () => Promise.resolve({ exitCode: 0, stdout: '', stderr: '', timedOut: false }),
};

const sum = (all: readonly Counts[]): Counts => {
  const total = new Map<string, number>();
  for (const counts of all)
    for (const [name, count] of Object.entries(counts))
      total.set(name, (total.get(name) ?? 0) + count);
  return Object.fromEntries([...total].toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
};

/** Each plugin loaded from disk in the index order, one at a time (measurements never nest). */
async function loadCounted(targets: readonly CorpusTarget[], tally: Tally) {
  const loaded: HostPlugin[] = [];
  const counts: Counts[] = [];
  for (const target of targets) {
    const files = countedFiles(diskFiles(target.dir), tally, target.key);
    const load = await measured(tally, () => loadPlugin({ files, fallbackName: target.name }));
    counts.push(load.counts);
    const { plugin } = load.value;
    if (plugin !== undefined) loaded.push({ id: `${plugin.name}@corpus`, plugin });
  }
  return { loaded, counts: sum(counts) };
}

/** What `work` returns, with what it counted. */
async function measured<T>(tally: Tally, work: () => T | Promise<T>) {
  const box: { result?: { value: T } } = {};
  const counts = await tally.measure(async () => {
    box.result = { value: await work() };
  });
  if (box.result === undefined) throw new Error('the measured work returned nothing');
  return { value: box.result.value, counts };
}

async function sessionCounted(
  plugins: readonly HostPlugin[],
  label: string,
  tally: Tally,
): Promise<CountedStage[]> {
  const ports: HostPorts = countedPorts(
    { commands: instantRunner, locations: locations(), environment: fakeEnvironment() },
    tally,
  );
  const host = await measured(tally, () => createPluginHost({ plugins, ports }));
  const open = await measured(tally, () =>
    host.value.openSession({
      sessionId: 'bench',
      cwd: '/work/app',
      permissionMode: 'default',
      transcriptPath: '/work/app/.transcript.jsonl',
    }),
  );
  const session = open.value;
  const listing = await tally.measure(async () => session.skills());
  const dispatch = await tally.measure(async () => {
    for (let i = 0; i < 20; i++)
      await session.dispatch(
        'PreToolUse',
        { tool_name: 'Bash', tool_input: { command: 'git status' }, tool_use_id: `t${i}` },
        { signal: AbortSignal.timeout(30_000) },
      );
  });
  return [
    { label: `${label}: createPluginHost`, counts: host.counts },
    { label: `${label}: openSession`, counts: open.counts },
    { label: `${label}: session.skills()`, counts: listing },
    { label: `${label}: 20 x dispatch PreToolUse Bash`, counts: dispatch },
  ];
}

/** The counted stages over `targets`: every load summed, then the sessions over 20 and all plugins. */
export async function countCorpus(targets: readonly CorpusTarget[]): Promise<CountedStage[]> {
  const tally = createTally();
  const restore = countCpu(tally);
  try {
    const { loaded, counts } = await loadCounted(targets, tally);
    return [
      { label: `loadPlugin from disk (sum of ${targets.length})`, counts },
      ...(await sessionCounted(loaded.slice(0, 20), '20 plugins', tally)),
      ...(await sessionCounted(loaded, `all ${loaded.length} plugins`, tally)),
    ];
  } finally {
    restore();
  }
}

/** One table row of a stage: its label and the shown counters. */
export const countRow = (stage: CountedStage): Record<string, string | number> => ({
  label: stage.label,
  ...Object.fromEntries(SHOWN.map((name) => [name, stage.counts[name] ?? 0])),
});
