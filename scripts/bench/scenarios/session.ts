/**
 * The host and a session over P typical plugins: building the host, opening a session, the skill
 * listing (first and again), expanding one skill, the MCP servers (first and again) and an update that
 * replaces one plugin. The docs say a session reads nothing from disk, and that an update reads only a
 * new `Plugin` object (docs/API.md, "Host and sessions", "Updating").
 */
import type { HostPlugin } from '../../../src/index.ts';
import { pluginName } from '../inputs.ts';
import {
  hostOver,
  hostPlugins,
  loaded,
  SESSION,
  signal,
  typical,
  type Scenario,
} from './context.ts';

const SIZES = [4, 8, 16];

export const SESSIONS: readonly Scenario[] = [
  {
    id: 'createPluginHost',
    size: 'P plugins',
    sizes: SIZES,
    laws: { create: 'linear' },
    async run(size, bench) {
      const plugins = await hostPlugins(bench, size);
      return { create: await bench.tally.measure(async () => hostOver(bench, plugins)) };
    },
  },
  {
    id: 'openSession',
    size: 'P plugins',
    sizes: SIZES,
    laws: { open: 'linear' },
    async run(size, bench) {
      const host = hostOver(bench, await hostPlugins(bench, size));
      return { open: await bench.tally.measure(async () => host.openSession(SESSION)) };
    },
  },
  {
    id: 'session.skills',
    size: 'P plugins',
    sizes: SIZES,
    laws: { first: 'linear', second: 'nothing', catalog: 'nothing', mentions: 'constant' },
    repeats: ['second', 'catalog'],
    async run(size, bench) {
      const session = hostOver(bench, await hostPlugins(bench, size)).openSession(SESSION);
      const first = await bench.tally.measure(async () => session.skills());
      const second = await bench.tally.measure(async () => session.skills());
      const catalog = await bench.tally.measure(async () => session.skillCatalog());
      const message = `/${pluginName(bench.salt, 0)}:skill-0000 src/`;
      const mentions = await bench.tally.measure(async () => session.messageMentions(message));
      return { first, second, catalog, mentions };
    },
  },
  {
    id: 'expandSkill',
    size: 'P plugins',
    sizes: SIZES,
    laws: { first: 'constant', second: 'constant' },
    repeats: ['second'],
    async run(size, bench) {
      const session = hostOver(bench, await hostPlugins(bench, size)).openSession(SESSION);
      session.skills();
      const skill = `${pluginName(bench.salt, 0)}:skill-0000`;
      const expand = () => session.expandSkill(skill, { arguments: 'src/', signal: signal() });
      const first = await bench.tally.measure(expand);
      const second = await bench.tally.measure(expand);
      return { first, second };
    },
  },
  {
    id: 'session.mcpServers',
    size: 'P plugins',
    sizes: SIZES,
    laws: { first: 'linear', second: 'linear' },
    repeats: ['second'],
    async run(size, bench) {
      const session = hostOver(bench, await hostPlugins(bench, size)).openSession(SESSION);
      const first = await bench.tally.measure(() => session.mcpServers());
      const second = await bench.tally.measure(() => session.mcpServers());
      return { first, second };
    },
  },
  {
    id: 'host.update',
    size: 'P plugins, one replaced',
    sizes: SIZES,
    laws: { update: 'constant', skills: 'linear', dispatch: 'linear' },
    repeats: ['dispatch'],
    async run(size, bench) {
      const plugins = await hostPlugins(bench, size);
      const host = hostOver(bench, plugins);
      const session = host.openSession(SESSION);
      session.skills();
      const dispatch = () =>
        session.dispatch(
          'PreToolUse',
          { tool_name: 'Bash', tool_input: { command: 'ls' }, tool_use_id: 't1' },
          { signal: signal() },
        );
      await dispatch();
      const [head, ...rest] = plugins;
      const name = pluginName(bench.salt, 0);
      const changed: HostPlugin = {
        id: head?.id ?? '',
        plugin: await loaded(bench, { ...typical(name), skills: 3 }),
      };
      const update = await bench.tally.measure(async () =>
        host.update({ plugins: [changed, ...rest] }),
      );
      const skills = await bench.tally.measure(async () => session.skills());
      return { update, skills, dispatch: await bench.tally.measure(dispatch) };
    },
  },
];
