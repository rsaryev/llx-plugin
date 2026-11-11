/**
 * What every scenario of the meter is built from: a tally, ports over in-memory fakes with every call
 * counted, plugins loaded before a measurement starts, and the session every host scenario opens.
 */
import {
  createPluginHost,
  loadPlugin,
  type CommandRunner,
  type FolderScan,
  type HostPlugin,
  type HostPorts,
  type Plugin,
  type PluginFiles,
  type PluginHost,
} from '../../../src/index.ts';
import { fakeEnvironment, locations, memoryFiles } from '../../../src/testing/index.ts';
import { pluginFiles, pluginName, type PluginShape } from '../inputs.ts';
import { countedFiles, countedPorts } from '../meter/ports.ts';
import type { Counts, Tally } from '../meter/tally.ts';

/** The growth a measurement's counts must follow over the scenario's sizes (docs/TESTING.md, "Benchmarks"). */
export type Law =
  /** The same counts at every size. */
  | 'constant'
  /** Counts affine in the size: equal steps from N to 2N and 2N to 4N, never faster. */
  | 'linear'
  /** Constant, and no file, folder, command, HTTP or model call at all. */
  | 'no-io'
  /** No count at all: no port call and no CPU proxy (a cached answer). */
  | 'nothing';

export interface Scenario {
  readonly id: string;
  /** What the size counts (`P plugins`, `R rules`). */
  readonly size: string;
  readonly sizes: readonly number[];
  /** The measurements taken at each size, by name, with the law each follows. */
  readonly laws: Readonly<Record<string, Law>>;
  /** The measurements that repeat an earlier call of the same run: they build no regular expression. */
  readonly repeats?: readonly string[];
  run(size: number, bench: Bench): Promise<Readonly<Record<string, Counts>>>;
}

export interface Bench {
  readonly tally: Tally;
  /** Unique to this measurement, so no memo of the kit is warm from another. */
  readonly salt: string;
  /** The files of a folder, counted under `scope`. */
  files(record: Readonly<Record<string, string>>, scope: string): PluginFiles;
  /** The host's ports, counted; `folders` when the scenario reads scope folders. */
  ports(folders?: FolderScan): HostPorts;
}

/** A command that "runs" at once and says nothing: what is counted is how often the kit asks. */
const instantRunner: CommandRunner = {
  run: () => Promise.resolve({ exitCode: 0, stdout: '', stderr: '', timedOut: false }),
};

export function createBench(tally: Tally, salt: string): Bench {
  return {
    tally,
    salt,
    files: (record, scope) => countedFiles(memoryFiles(record), tally, scope),
    ports: (folders) =>
      countedPorts(
        {
          commands: instantRunner,
          locations: locations(),
          environment: fakeEnvironment({ HOME: '/home/user', PATH: '/usr/bin' }),
          ...(folders && { folders }),
        },
        tally,
      ),
  };
}

export const SESSION = {
  sessionId: 'bench',
  cwd: '/work/app',
  permissionMode: 'default',
  transcriptPath: '/work/app/.transcript.jsonl',
} as const;

export const signal = (): AbortSignal => new AbortController().signal;

/** The plugin the files make, loaded before any measurement; a scenario never runs on one that fails. */
export async function loaded(bench: Bench, shape: PluginShape): Promise<Plugin> {
  const { plugin, issues } = await loadPlugin({
    files: bench.files(pluginFiles(shape), shape.name),
  });
  if (plugin === undefined)
    throw new Error(`${shape.name} does not load: ${JSON.stringify(issues)}`);
  return plugin;
}

/** The typical plugin of the host scenarios: two skills, a command, an agent, a hook and a server. */
export const typical = (name: string, matcher = 'Write'): PluginShape => ({
  name,
  skills: 2,
  commands: 1,
  agents: 1,
  hooks: 1,
  matcher,
  mcpServers: 1,
});

/** `count` plugins of the shape `shapeOf` gives for each index, loaded, with their host ids. */
export async function hostPlugins(
  bench: Bench,
  count: number,
  shapeOf: (name: string, index: number) => PluginShape = (name) => typical(name),
): Promise<HostPlugin[]> {
  const plugins: HostPlugin[] = [];
  for (let index = 0; index < count; index++) {
    const name = pluginName(bench.salt, index);
    plugins.push({ id: `${name}@bench`, plugin: await loaded(bench, shapeOf(name, index)) });
  }
  return plugins;
}

/** A host over `plugins` and the counted ports. */
export const hostOver = (
  bench: Bench,
  plugins: readonly HostPlugin[],
  folders?: FolderScan,
): PluginHost => createPluginHost({ plugins, ports: bench.ports(folders) });
