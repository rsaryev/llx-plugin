/**
 * Reading one plugin folder: `validatePlugin` and `loadPlugin` over a plugin of N skills, N commands,
 * N agents, N hooks and N MCP servers. Both read each file once, so every count grows linearly. And
 * the host over one skill with no `description` and a body of L lines: the fallback reads the first
 * non-empty line, so the host's work does not grow with the body.
 */
import { loadPlugin, validatePlugin } from '../../../src/index.ts';
import { pluginFiles, pluginName, undescribedSkill, type PluginShape } from '../inputs.ts';
import { hostOver, type Bench, type Scenario } from './context.ts';

const SIZES = [4, 8, 16];

const shapeOf = (bench: Bench, size: number): PluginShape => ({
  name: pluginName(bench.salt, 0),
  skills: size,
  commands: size,
  agents: size,
  hooks: size,
  mcpServers: size,
});

export const LOADING: readonly Scenario[] = [
  {
    id: 'validatePlugin',
    size: 'N of each component',
    sizes: SIZES,
    laws: { run: 'linear' },
    async run(size, bench) {
      const files = bench.files(pluginFiles(shapeOf(bench, size)), 'plugin');
      return { run: await bench.tally.measure(() => validatePlugin({ files })) };
    },
  },
  {
    id: 'loadPlugin',
    size: 'N of each component',
    sizes: SIZES,
    laws: { run: 'linear' },
    async run(size, bench) {
      const files = bench.files(pluginFiles(shapeOf(bench, size)), 'plugin');
      return { run: await bench.tally.measure(() => loadPlugin({ files })) };
    },
  },
  {
    id: 'createPluginHost.skillBody',
    size: 'L body lines',
    sizes: [64, 128, 256],
    laws: { create: 'constant' },
    async run(size, bench) {
      const name = pluginName(bench.salt, 0);
      const files = bench.files(undescribedSkill(name, size), 'plugin');
      const { plugin } = await loadPlugin({ files });
      if (plugin === undefined) throw new Error(`${name} does not load`);
      const plugins = [{ id: `${name}@bench`, plugin }];
      return { create: await bench.tally.measure(async () => hostOver(bench, plugins)) };
    },
  },
];
