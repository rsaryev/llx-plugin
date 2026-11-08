/**
 * `$.command`, `$.tool`, `$.agent` and the names they register.
 * plugins/mods/api.md § Add a command (`$.command.register` throws for a taken name, with a message
 * such as `"/focus" refused: it is the built-in /focus`; `argumentHint`; `immediate: true`), § Add a
 * tool ("Claude sees it under a longer name made of `mcp__`, your plugin's name, two underscores,
 * and the name you registered"; `isDeferred: false`), § What refused calls return (`$.agent.spawn`
 * resolves with `{ deny }`); plugins/mods/reference.md § Mods API methods (`$.agent`: `list()`
 * returns subagents and teammates, each with a `status`), § Limits ("Command, tool, subagent type,
 * and pane names: Letters, digits, `_`, and `-`, up to 64 characters"); plugins/mods/test.md §
 * Look up what a stub returns (`$.command.run({ command, args })`, `$.tool.call({ tool, ...args })`).
 */
import { describe, expect, test } from 'bun:test';
import { isValidModName, toolFullName } from '../../../src/mods/api/index.ts';
import { AGENT_STATUSES, MODS_API } from '../../../src/protocol/mods-api-names.ts';
import { MOD_LIMITS } from '../../../src/protocol/mods-limits.ts';
import { MODS_REFERENCE } from '../../support/mods-reference.ts';
import { fn } from '../../support/mods-chain.ts';
import { apiHarness, expectMethods } from '../../support/mods-api.ts';
import { rejection } from '../../support/rejection.ts';
import { spec } from '../../support/spec.ts';

spec('mods.api.$.command', () => {
  test('$.command has register, run and list', async () => {
    const { api } = await apiHarness();
    expectMethods(api.command, MODS_API.command);
  });

  test('register adds the command with its description and argument hint; list shows it', async () => {
    const h = await apiHarness();
    await h.api.command.register({
      name: 'standup',
      description: 'Summarize what changed today',
      argumentHint: '[days]',
    });
    expect(await h.api.command.list()).toEqual([
      { name: 'standup', description: 'Summarize what changed today', argumentHint: '[days]' },
    ]);
    expect(h.shared.registries.commands.get('standup')).toMatchObject({
      plugin: 'my-mod',
      name: 'standup',
    });
  });

  test('immediate: true is kept for a command that runs while Claude is working', async () => {
    const h = await apiHarness();
    await h.api.command.register({ name: 'peek', immediate: true });
    expect(h.shared.registries.commands.get('peek')).toMatchObject({ immediate: true });
  });

  test('a name a built-in command uses is refused with the documented message', async () => {
    const h = await apiHarness();
    expect(await rejection(h.api.command.register({ name: 'focus', description: 'x' }))).toContain(
      '"/focus" refused: it is the built-in /focus',
    );
  });

  test('run fires command.run with { command, args } and resolves to the answer, { text } or {}', async () => {
    const commands = {
      builtIns: () => [],
      run: (command: { command: string; args: string }) =>
        Promise.resolve({ text: `ran ${command.command} ${command.args}` }),
    };
    const seen: unknown[] = [];
    const h = await apiHarness({ ports: { commands } });
    await h.mod('spy', 'prepend', [fn('command.run', (_$, e, next) => (seen.push(e), next(e)))]);
    expect(await h.api.command.run({ command: 'grade', args: 'The cat sat on the mat.' })).toEqual({
      text: 'ran grade The cat sat on the mat.',
    });
    expect(seen).toEqual([{ command: 'grade', args: 'The cat sat on the mat.' }]);
  });

  test('a hook on command.run answers in place of the host, as the test kit stubs do', async () => {
    const h = await apiHarness();
    await h.mod('stub', 'prepend', [fn('command.run', () => ({ text: 'Passed' }))]);
    expect(await h.api.command.run({ command: 'grade' })).toEqual({ text: 'Passed' });
  });

  test('a refused run rejects with the reason the host gave', async () => {
    const commands = {
      builtIns: () => [],
      run: () => Promise.reject(new Error('the command was removed from the queue before it ran')),
    };
    const h = await apiHarness({ ports: { commands } });
    expect(await rejection(h.api.command.run({ command: 'x' }))).toContain(
      'was removed from the queue before it ran',
    );
  });
});

spec('mods.api.$.tool', () => {
  test('$.tool has register, call, check and list', async () => {
    const { api } = await apiHarness();
    expectMethods(api.tool, MODS_API.tool);
  });

  test('a tool registers under mcp__, the plugin name, two underscores and the registered name', async () => {
    const h = await apiHarness({ plugin: 'my-mod' });
    await h.api.tool.register({
      name: 'ticket',
      description: 'Look up a ticket by its id and return its title and status',
      inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    });
    expect(toolFullName('my-mod', 'ticket')).toBe('mcp__my-mod__ticket');
    expect(h.shared.registries.tools.get('mcp__my-mod__ticket')).toMatchObject({
      plugin: 'my-mod',
      name: 'ticket',
      fullName: 'mcp__my-mod__ticket',
    });
    expect(await h.api.tool.list()).toMatchObject([{ name: 'mcp__my-mod__ticket' }]);
  });

  test('isDeferred: false is kept so Claude Code loads the tool upfront', async () => {
    const h = await apiHarness();
    await h.api.tool.register({ name: 't', description: 'd', inputSchema: {}, isDeferred: false });
    expect(h.shared.registries.tools.get('mcp__my-mod__t')).toMatchObject({ isDeferred: false });
  });

  test('a tool with no description or schema is refused', async () => {
    const h = await apiHarness();
    expect(await rejection(h.api.tool.register({ name: 't' }))).toContain('$.tool.register');
  });

  test('call fires tool.call with the tool name and its arguments as fields', async () => {
    const calls: unknown[] = [];
    const tools = {
      call: (call: unknown) => (calls.push(call), Promise.resolve({ result: 'ok' })),
      check: () => Promise.resolve({ decision: 'allow' }),
    };
    const seen: unknown[] = [];
    const h = await apiHarness({ ports: { tools } });
    await h.mod('spy', 'prepend', [fn('tool.call', (_$, e, next) => (seen.push(e), next(e)))]);
    expect(await h.api.tool.call({ tool: 'Bash', command: 'ls' })).toEqual({ result: 'ok' });
    expect(seen).toEqual([{ tool: 'Bash', command: 'ls' }]);
    expect(calls).toEqual([{ tool: 'Bash', command: 'ls' }]);
  });

  test('a refused call resolves with { deny } and does not reject', async () => {
    const h = await apiHarness();
    await h.mod('guard', 'prepend', [fn('tool.call', () => ({ deny: 'Bash is off' }))]);
    expect(await h.api.tool.call({ tool: 'Bash', command: 'ls' })).toEqual({ deny: 'Bash is off' });
  });

  test('check answers the decision', async () => {
    const tools = {
      call: () => Promise.resolve({}),
      check: () => Promise.resolve({ decision: 'ask' }),
    };
    const h = await apiHarness({ ports: { tools } });
    expect(await h.api.tool.check({ tool: 'Bash', input: { command: 'ls' } })).toEqual({
      decision: 'ask',
    });
  });

  test('a call without a tool name rejects', async () => {
    const h = await apiHarness();
    expect(await rejection(h.api.tool.call({ command: 'ls' }))).toContain('$.tool.call');
  });
});

const statuses = (): readonly string[] => MODS_REFERENCE.agentStatuses;

spec('mods.api.$.agent', () => {
  test('$.agent has register, spawn and list', async () => {
    const { api } = await apiHarness();
    expectMethods(api.agent, MODS_API.agent);
  });

  test('the statuses of $.agent.list() are the ones the reference gives', () => {
    expect(statuses()).toEqual([...AGENT_STATUSES]);
  });

  test('list returns the rows the host knows, each with a status', async () => {
    const rows = AGENT_STATUSES.map((status, index) => ({ agentId: `a${index}`, status }));
    const agents = { spawn: () => Promise.resolve({}), list: () => Promise.resolve(rows) };
    const h = await apiHarness({ ports: { agents } });
    expect(await h.api.agent.list()).toEqual(rows);
  });

  test('a row whose status the reference does not list makes the call reject', async () => {
    const agents = {
      spawn: () => Promise.resolve({}),
      list: () => Promise.resolve([{ agentId: 'a1', status: 'napping' }]),
    };
    const h = await apiHarness({ ports: { agents } });
    expect(await rejection(h.api.agent.list())).toContain('$.agent.list');
  });

  test('register adds a subagent type with its definition', async () => {
    const h = await apiHarness();
    await h.api.agent.register({
      name: 'reviewer',
      description: 'Reviews a diff',
      prompt: 'You review diffs.',
    });
    expect(h.shared.registries.agents.get('reviewer')).toMatchObject({
      plugin: 'my-mod',
      definition: { description: 'Reviews a diff', prompt: 'You review diffs.' },
    });
  });

  test('spawn fires agent.spawn and resolves to { agentId }, or { deny } when a hook refuses', async () => {
    const agents = {
      spawn: () => Promise.resolve({ agentId: 'a1' }),
      list: () => Promise.resolve([]),
    };
    const h = await apiHarness({ ports: { agents } });
    expect(await h.api.agent.spawn({ type: 'reviewer', prompt: 'go' })).toEqual({ agentId: 'a1' });
    await h.mod('guard', 'prepend', [fn('agent.spawn', () => ({ deny: 'no subagents today' }))]);
    expect(await h.api.agent.spawn({ type: 'reviewer', prompt: 'go' })).toEqual({
      deny: 'no subagents today',
    });
  });
});

// Judgment territory until `$.ui.open` lands: the requirement also names pane names, which this stream cannot test, so the id is not credited.
describe('command, tool and subagent type names (pane names wait for $.ui)', () => {
  const longest = 'a'.repeat(MOD_LIMITS.nameChars);

  test('letters, digits, _ and -, up to 64 characters, are valid', () => {
    for (const name of ['standup', 'My_Tool-2', '0', longest, '_-_'])
      expect(isValidModName(name)).toBe(true);
  });

  test('65 characters, an empty name, a space, a dot, a slash and non-ASCII letters are not', () => {
    for (const name of [`${longest}a`, '', 'a b', 'a.b', 'a/b', 'é', 'a:b', 5, undefined]) {
      expect(isValidModName(name)).toBe(false);
    }
  });

  test('a command, a tool and a subagent type with a longer or odd name are refused', async () => {
    const h = await apiHarness();
    const bad = `${longest}a`;
    expect(await rejection(h.api.command.register({ name: bad }))).toContain('command name');
    expect(
      await rejection(h.api.tool.register({ name: 'a b', description: 'd', inputSchema: {} })),
    ).toContain('tool name');
    expect(
      await rejection(h.api.agent.register({ name: 'a.b', description: 'd', prompt: 'p' })),
    ).toContain('subagent type name');
    expect(h.shared.registries.commands.list()).toHaveLength(0);
  });

  test('a name of exactly 64 characters is accepted by all three', async () => {
    const h = await apiHarness();
    await h.api.command.register({ name: longest });
    await h.api.tool.register({ name: longest, description: 'd', inputSchema: {} });
    await h.api.agent.register({ name: longest, description: 'd', prompt: 'p' });
    expect(h.shared.registries.agents.get(longest)).toBeDefined();
  });
});
