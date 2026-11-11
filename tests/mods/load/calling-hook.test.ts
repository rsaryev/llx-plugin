/**
 * Which of a mod's hooks its own call skips, with the host's async context. Declarations 2.1.321
 * (AGENTS.md, E2a; spec/judgments.md, "Who a mod's call reaches"): claude-code/index.d.ts:7298 "The
 * calling hook alone is skipped", :5014 "a plugin's call runs the same chain with the calling hook
 * alone skipped"; reference.md § The hook function, `next.error`: `re-entry` "when the hook was
 * skipped because the event came from inside a mods API call by that hook or by your mod's code
 * outside its hooks". And :1834, `CommandRunInput`: "one slash command about to run", so a host
 * whose command body calls `runCommand` for the same command does not fire `command.run` again.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { describe, expect, test } from 'bun:test';
import { fakePorts } from '../../../src/testing/mods/index.ts';
import type { ModsHost } from '../../../src/mods/index.ts';
import { flush } from '../../support/mods-chain.ts';
import { inline, modPlugin, registerOf, session } from '../../support/mods-load.ts';

const asyncContext = () => new AsyncLocalStorage();

/** `pair`: hook A on tool.call calls `$.command.run`; hook B answers /probe and holds /slow. */
function pairMod(gate: Promise<void>) {
  return registerOf((on) => {
    on('tool.call', async ($: { command: { run(e: unknown): Promise<unknown> } }) => ({
      value: await $.command.run({ command: 'probe' }),
    }));
    on(
      'command.run',
      async (_$: unknown, e: { command: string }, next: (e: unknown) => unknown) => {
        if (e.command === 'slow') {
          await gate;
          return { text: 'slow done' };
        }
        return e.command === 'probe' ? { text: 'B answered' } : next(e);
      },
    );
  });
}

async function hostWith(gate: Promise<void>, withContext: boolean) {
  const register = pairMod(gate);
  const ran: string[] = [];
  const live = session(
    { pair: register },
    {
      ports: fakePorts({
        commands: {
          builtIns: () => [],
          run: (command) => (ran.push(command.command), Promise.resolve({ text: 'core ran' })),
        },
      }).ports,
      firesSessionStart: false,
      ...(withContext ? { asyncContext } : {}),
    },
  );
  await live.host.load([modPlugin(inline('pair'), register)]);
  return { ...live, ran };
}

describe('a call skips the calling hook alone (claude-code/index.d.ts:7298)', () => {
  test("hook A's $.command.run reaches the mod's hook B while B is in flight elsewhere", async () => {
    const gate = Promise.withResolvers<void>();
    const { host, ran } = await hostWith(gate.promise, true);
    const slow = host.runCommand('slow', '');
    await flush();
    const answer = await host.fire('tool.call', { tool: 'Read', input: {} });
    expect(answer).toEqual({ value: { text: 'B answered' } });
    expect(ran).toEqual([]);
    gate.resolve();
    expect(await slow).toEqual({ text: 'slow done' });
  });

  test('without an async context the kit skips every running hook of the mod (judgment)', async () => {
    const gate = Promise.withResolvers<void>();
    const { host, ran } = await hostWith(gate.promise, false);
    const slow = host.runCommand('slow', '');
    await flush();
    expect(await host.fire('tool.call', { tool: 'Read', input: {} })).toEqual({
      value: { text: 'core ran' },
    });
    expect(ran).toEqual(['probe']);
    gate.resolve();
    await slow;
  });
});

describe('a runCommand from inside the body of the same command fires command.run once', () => {
  async function counting(withContext: boolean) {
    const fired: string[] = [];
    const register = registerOf((on) => {
      on('command.run', (_$: unknown, e: { command: string }, next: (e: unknown) => unknown) => {
        fired.push(e.command);
        return next(e);
      });
    });
    const holder: { host?: ModsHost } = {};
    const body = (command: { command: string; args: string }) =>
      holder.host?.runCommand(command.command, command.args, {
        core: () => Promise.resolve({ text: `ran ${command.command}` }),
      }) ?? Promise.reject(new Error('no host'));
    const caller = registerOf((on) => {
      on('tool.call', async ($: { command: { run(e: unknown): Promise<unknown> } }) => ({
        value: await $.command.run({ command: 'outer' }),
      }));
    });
    const live = session(
      { watch: register, caller },
      {
        ports: fakePorts({ commands: { builtIns: () => [], run: body } }).ports,
        firesSessionStart: false,
        ...(withContext ? { asyncContext } : {}),
      },
    );
    holder.host = live.host;
    await live.host.load([
      modPlugin(inline('watch'), register),
      modPlugin(inline('caller'), caller),
    ]);
    return { host: live.host, fired };
  }

  test("the user's /name whose body calls runCommand again: its core runs, no second fire", async () => {
    const { host, fired } = await counting(true);
    const result = await host.runCommand('review', 'x', {
      core: (e) =>
        host.runCommand('review', 'x', {
          core: () => Promise.resolve({ text: `inner ${String(Reflect.get(Object(e), 'args'))}` }),
        }),
    });
    expect(result).toEqual({ text: 'inner x' });
    expect(fired).toEqual(['review']);
  });

  test("a host's ModCommands.run that calls runCommand for the command: collapsed", async () => {
    const { host, fired } = await counting(true);
    const answer = await host.fire('tool.call', { tool: 'Read', input: {} });
    expect(answer).toEqual({ value: { text: 'ran outer' } });
    expect(fired).toEqual(['outer']);
  });

  test('a body that nests a third time is refused', async () => {
    const { host } = await counting(true);
    const again = (): Promise<unknown> => host.runCommand('loop', '', { core: again });
    const refusal = await host.runCommand('loop', '', { core: again }).then(
      () => 'resolved',
      (error: unknown) => (error instanceof Error ? error.message : error),
    );
    expect(refusal).toBe('/loop: its body ran runCommand for itself again; refused');
  });

  test('without an async context the nested call fires again (the documented host rule)', async () => {
    const { host, fired } = await counting(false);
    await host.runCommand('review', '', {
      core: () => host.runCommand('review', '', { core: () => Promise.resolve({}) }),
    });
    expect(fired).toEqual(['review', 'review']);
  });
});
