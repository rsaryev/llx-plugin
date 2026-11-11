/**
 * `ModsHost.registered`: what mods registered with `$.command.register`, `$.tool.register` and
 * `$.agent.register` (plugins/mods/api.md, "Add a command", "Add a tool", "Add a subagent"), as a
 * host reads it to list, run and offer them, and to be told when it changes. A read surface: the
 * host never writes the kit's registries.
 */
import { expect, test } from 'bun:test';
import { inline, modPlugin, registerOf, session } from '../../support/mods-load.ts';

type Api = {
  command: { register(def: unknown): Promise<unknown> };
  tool: { register(def: unknown): Promise<unknown> };
  agent: { register(def: unknown): Promise<unknown> };
};

const registering = registerOf((on) => {
  on('session.start', async ($: Api, e: unknown, next: (e: unknown) => Promise<unknown>) => {
    await $.command.register({ name: 'tally', description: 'Count the tool calls' });
    await $.tool.register({ name: 'lookup', description: 'Look a word up' });
    await $.agent.register({ name: 'scout', description: 'Reads the code', prompt: 'Read.' });
    return next(e);
  });
});

const loaded = async () => {
  const s = session({ counter: registering });
  await s.host.load([modPlugin(inline('counter'), registering)]);
  return s;
};

test('lists what the mods registered: commands, tools by the name Claude sees, agents', async () => {
  const s = session({ counter: registering });
  const changes: string[] = [];
  const stop = s.host.registered.onChange((kind) => changes.push(kind));
  expect(s.host.registered.commands()).toEqual([]);
  await s.host.load([modPlugin(inline('counter'), registering)]);
  const { host } = s;
  expect(host.registered.commands().map((one) => [one.plugin, one.name])).toEqual([
    ['counter', 'tally'],
  ]);
  expect(host.registered.tools().map((one) => one.fullName)).toEqual(['mcp__counter__lookup']);
  expect(host.registered.tool('mcp__counter__lookup')?.description).toBe('Look a word up');
  expect(host.registered.command('tally')?.description).toBe('Count the tool calls');
  expect(host.registered.agents().map((one) => [one.plugin, one.name])).toEqual([
    ['counter', 'scout'],
  ]);
  expect(changes).toEqual(['commands', 'tools', 'agents']);
  stop();
});

test('says when a mod that is turned off takes its registrations with it', async () => {
  const { host } = await loaded();
  const changes: string[] = [];
  host.registered.onChange((kind) => changes.push(kind));
  expect(await host.unloadMod('counter')).toBe(true);
  expect(host.registered.commands()).toEqual([]);
  expect(host.registered.tools()).toEqual([]);
  expect(host.registered.agents()).toEqual([]);
  expect(changes.toSorted()).toEqual(['agents', 'commands', 'tools']);
});

test('a listener that stopped is not told; the lists are copies the host cannot change', async () => {
  const s = session({ counter: registering });
  const changes: string[] = [];
  s.host.registered.onChange((kind) => changes.push(kind))();
  await s.host.load([modPlugin(inline('counter'), registering)]);
  expect(changes).toEqual([]);
  const listed = s.host.registered.commands();
  expect(listed).toHaveLength(1);
  expect(Object.isFrozen(listed)).toBe(true);
  expect(Object.isFrozen(listed[0])).toBe(true);
  expect(s.host.registered).not.toHaveProperty('set');
});
