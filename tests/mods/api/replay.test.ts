/**
 * plugins/mods/troubleshoot.md § `its session.start ran again in a fresh copy` ("The line starts with
 * the mod's name and names a `$.prompt.submit`, `$.command.run`, or `$.agent.spawn` call ... Claude
 * Code loaded the mod's module again, for example after the hooks worker crashed and was replaced,
 * and the fresh copy's `session.start` hook ran. The call the line names resolved with the result of
 * its first run instead of running again, so your mod doesn't submit the prompt, run the command, or
 * start the subagent twice. The rest of the hook ran as usual").
 */
import { describe, expect, test } from 'bun:test';
import type { ModHostPorts } from '../../../src/mods/api/index.ts';
import type { ModsApi } from '../../../src/mods/types.ts';
import { fakePorts, type RegisterFunction } from '../../../src/testing/mods/index.ts';
import { crashSession } from '../../support/mods-crash.ts';
import { inline, modPlugin, registerOf } from '../../support/mods-load.ts';
import { spec } from '../../support/spec.ts';

const untraced = { reason: 'the worker stopped responding' };
const line = (kind: string): string =>
  `first-mod: its session.start ran again in a fresh copy; the $.${kind} call it had already made was not made again`;

/** Ports that count what reaches the host, answering each call with its own number. */
function counting() {
  const base = fakePorts().ports;
  const reached = { prompts: [] as string[], commands: [] as string[], agents: [] as string[] };
  const ports: Partial<ModHostPorts> = {
    prompts: {
      ...base.prompts,
      submit: (prompt) => {
        reached.prompts.push(prompt.text);
        return Promise.resolve({});
      },
    },
    commands: {
      builtIns: () => [],
      run: (command) => {
        reached.commands.push(command.command);
        return Promise.resolve({ text: `ran ${command.command} #${reached.commands.length}` });
      },
    },
    agents: {
      list: () => Promise.resolve([]),
      spawn: () => {
        reached.agents.push('spawned');
        return Promise.resolve({ agentId: `agent-${reached.agents.length}` });
      },
    },
  };
  return { ports, reached };
}

/** The mods of a test: `first-mod` runs `register`. The scan reads each hook where it is written, so every test writes its own. */
const only = (register: RegisterFunction): Record<string, RegisterFunction> => ({
  'first-mod': register,
});

const pluginsOf = (registers: Record<string, RegisterFunction>) =>
  Object.entries(registers).map(([name, register]) => modPlugin(inline(name), register));

async function crashed(registers: Record<string, RegisterFunction>, ports: Partial<ModHostPorts>) {
  const s = crashSession(registers, ports);
  await s.host.load(pluginsOf(registers));
  await s.worker.crash(untraced);
  return s;
}

spec('mods.troubleshoot.its session.start ran again in a fresh copy', () => {
  test("$.prompt.submit: the fresh copy does not submit the prompt again, and resolves with the first run's result", async () => {
    const { ports, reached } = counting();
    const results: unknown[] = [];
    const s = await crashed(
      only(
        registerOf((on) => {
          on('session.start', async ($: ModsApi, e: unknown) => {
            results.push(await $.prompt.submit({ text: 'checks failed' }));
            return e;
          });
        }),
      ),
      ports,
    );
    expect(reached.prompts).toEqual(['checks failed']);
    expect(results).toEqual([{}, {}]);
    expect(s.worker.loads.get('first-mod')).toBe(2);
  });

  test('$.command.run: the fresh copy does not run the command again', async () => {
    const { ports, reached } = counting();
    const results: unknown[] = [];
    await crashed(
      only(
        registerOf((on) => {
          on('session.start', async ($: ModsApi, e: unknown) => {
            results.push(await $.command.run({ command: 'tally', args: '' }));
            return e;
          });
        }),
      ),
      ports,
    );
    expect(reached.commands).toEqual(['tally']);
    expect(results).toEqual([{ text: 'ran tally #1' }, { text: 'ran tally #1' }]);
  });

  test('$.agent.spawn: the fresh copy does not start the subagent again', async () => {
    const { ports, reached } = counting();
    const results: unknown[] = [];
    await crashed(
      only(
        registerOf((on) => {
          on('session.start', async ($: ModsApi, e: unknown) => {
            results.push(await $.agent.spawn({ type: 'reviewer', prompt: 'look' }));
            return e;
          });
        }),
      ),
      ports,
    );
    expect(reached.agents).toEqual(['spawned']);
    expect(results).toEqual([{ agentId: 'agent-1' }, { agentId: 'agent-1' }]);
  });

  test('the line names the mod and the call, as the page words it, once for a call, and reaches the debug log', async () => {
    const { ports } = counting();
    const s = await crashed(
      only(
        registerOf((on) => {
          on('session.start', async ($: ModsApi, e: unknown) => {
            await $.prompt.submit({ text: 'a' });
            await $.prompt.submit({ text: 'b' });
            return e;
          });
        }),
      ),
      ports,
    );
    expect(s.notices.map((notice) => notice.line)).toEqual([line('prompt.submit')]);
    expect(s.debug).toContain(line('prompt.submit'));
  });

  test('a mod that makes two kinds of call gets a line for each', async () => {
    const { ports } = counting();
    const s = await crashed(
      only(
        registerOf((on) => {
          on('session.start', async ($: ModsApi, e: unknown) => {
            await $.prompt.submit({ text: 'a' });
            await $.command.run({ command: 'tally', args: '' });
            return e;
          });
        }),
      ),
      ports,
    );
    expect(s.notices.map((notice) => notice.line)).toEqual([
      line('prompt.submit'),
      line('command.run'),
    ]);
  });

  test('the rest of the hook runs as usual in the fresh copy', async () => {
    const { ports } = counting();
    const after: string[] = [];
    await crashed(
      only(
        registerOf((on) => {
          on('session.start', async ($: ModsApi, e: unknown) => {
            await $.prompt.submit({ text: 'a' });
            after.push('rest of the hook');
            return e;
          });
        }),
      ),
      ports,
    );
    expect(after).toEqual(['rest of the hook', 'rest of the hook']);
  });

  test('a mod before this one sees the first call only: the repeated call is not fired through the chain again', async () => {
    const { ports } = counting();
    const watched: string[] = [];
    const first = registerOf((on) => {
      on('session.start', async ($: ModsApi, e: unknown) => {
        await $.prompt.submit({ text: 'a' });
        return e;
      });
    });
    const watcher = registerOf((on) => {
      on('prompt.submit', (_$: unknown, e: { text: string }, next: (e: unknown) => unknown) => {
        watched.push(e.text);
        return next(e);
      });
    });
    const s = crashSession({ 'first-mod': first, watcher }, ports);
    await s.host.load([
      modPlugin(inline('watcher'), watcher),
      modPlugin(inline('first-mod'), first),
    ]);
    await s.worker.crash(untraced);
    expect(watched).toEqual(['a']);
  });

  test('a call made outside session.start is made every time', async () => {
    const { ports, reached } = counting();
    const registers = {
      'first-mod': registerOf((on) => {
        on('tool.call', async ($: ModsApi, e: unknown) => {
          await $.prompt.submit({ text: 'from a tool call' });
          return e;
        });
      }),
    };
    const s = await crashed(registers, ports);
    await s.host.fire('tool.call', { tool: 'Bash' });
    await s.worker.crash(untraced);
    await s.host.fire('tool.call', { tool: 'Bash' });
    expect(reached.prompts).toEqual(['from a tool call', 'from a tool call']);
    expect(s.notices).toEqual([]);
  });

  test('a call the first copy did not make is made by the fresh copy', async () => {
    const { ports, reached } = counting();
    let runs = 0;
    await crashed(
      only(
        registerOf((on) => {
          on('session.start', async ($: ModsApi, e: unknown) => {
            runs += 1;
            await $.prompt.submit({ text: 'always' });
            if (runs > 1) await $.prompt.submit({ text: 'only the fresh copy' });
            return e;
          });
        }),
      ),
      ports,
    );
    expect(reached.prompts).toEqual(['always', 'only the fresh copy']);
  });
});

describe('a fresh copy: judgments (spec/judgments.md)', () => {
  test('a call that failed was not made: the fresh copy makes it for real', async () => {
    const base = counting();
    let attempts = 0;
    const ports: Partial<ModHostPorts> = {
      ...base.ports,
      commands: {
        builtIns: () => [],
        run: () => (++attempts === 1 ? Promise.reject(new Error('boom')) : Promise.resolve('ok')),
      },
    };
    const seen: string[] = [];
    const s = await crashed(
      only(
        registerOf((on) => {
          on('session.start', async ($: ModsApi, e: unknown) => {
            const outcome = await $.command.run({ command: 'x', args: '' }).then(
              (value) => String(value),
              (error: Error) => `rejected: ${error.message.includes('boom')}`,
            );
            seen.push(outcome);
            return e;
          });
        }),
      ),
      ports,
    );
    expect(seen).toEqual(['rejected: true', 'ok']);
    expect(attempts).toBe(2);
    expect(s.notices).toEqual([]);
  });

  test("/reload-plugins starts the ledger over: a reloaded mod's session.start makes its calls", async () => {
    const { ports, reached } = counting();
    const registers = only(
      registerOf((on) => {
        on('session.start', async ($: ModsApi, e: unknown) => {
          await $.prompt.submit({ text: 'hello' });
          return e;
        });
      }),
    );
    const s = crashSession(registers, ports);
    await s.host.load(pluginsOf(registers));
    await s.host.reload();
    expect(reached.prompts).toEqual(['hello', 'hello']);
    expect(s.notices).toEqual([]);
  });
});
