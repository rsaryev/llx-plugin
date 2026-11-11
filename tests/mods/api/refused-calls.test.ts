/**
 * plugins/mods/api.md § Calls and background work after the user interrupts a turn ("After that
 * interruption, calls that start new work in the session are refused until the user's next input"),
 * § What refused calls return (the table: `$.prompt.submit` resolves with `{ drop }`, `$.command.run`
 * rejects, `$.agent.spawn` resolves with `{ deny }`, `$.tool.call` of Bash with `run_in_background:
 * true`, Monitor or CronCreate resolves with `{ deny: '<tool> was not run: it starts background work,
 * a schedule or a goal, and <reason>' }`, and `$.session.send` to a subagent that finished or to a
 * teammate resolves with `{ isDelivered: false, reason }`); plugins/mods/troubleshoot.md § `$.agent.register refused:
 * the hooks module that made the call is no longer loaded`.
 */
import { expect, test } from 'bun:test';
import { createRunGate, unsentReason, type ModHostPorts } from '../../../src/mods/api/index.ts';
import { fakePorts } from '../../../src/testing/mods/index.ts';
import { apiHarness } from '../../support/mods-api.ts';
import { flush, fn } from '../../support/mods-chain.ts';
import { interrupted, numbers, STOPPED } from '../../support/mods-refusal.ts';
import { inline, modPlugin, registerOf, session } from '../../support/mods-load.ts';
import { rejection } from '../../support/rejection.ts';
import { spec } from '../../support/spec.ts';
import type { ModsApi } from '../../../src/mods/types.ts';

spec('mods.apiGuide.What refused calls return.$.prompt.submit', () => {
  test('after an interruption $.prompt.submit resolves with { drop: reason } and queues no prompt', async () => {
    const { h, gate, reached } = await interrupted();
    gate.interrupt();
    expect(await h.api.prompt.submit({ text: 'checks failed' })).toEqual({ drop: STOPPED });
    expect(reached.prompts).toEqual([]);
  });

  test("until the user's next input: then the same call queues the prompt", async () => {
    const { h, gate, reached } = await interrupted();
    expect(await h.api.prompt.submit({ text: 'before' })).toEqual({ text: 'before' });
    gate.interrupt();
    expect(await h.api.prompt.submit({ text: 'during' })).toEqual({ drop: STOPPED });
    await gate.userInput();
    expect(await h.api.prompt.submit({ text: 'after' })).toEqual({ text: 'after' });
    expect(reached.prompts).toEqual(['before', 'after']);
  });

  test('a hook of a mod before this one still sees the call that is refused', async () => {
    const { h, gate } = await interrupted();
    const seen: unknown[] = [];
    await h.mod('spy', 'prepend', [fn('prompt.submit', (_$, e, next) => (seen.push(e), next(e)))]);
    gate.interrupt();
    expect(await h.api.prompt.submit({ text: 'again' })).toEqual({ drop: STOPPED });
    expect(seen).toEqual([
      { text: 'again', origin: { kind: 'plugin', name: 'my-mod' }, wait: false },
    ]);
  });
});

spec('mods.apiGuide.What refused calls return.$.command.run', () => {
  test('after an interruption $.command.run rejects with an error whose message ends with the reason, and runs nothing', async () => {
    const { h, gate, reached } = await interrupted();
    gate.interrupt();
    const message = await rejection(h.api.command.run({ command: 'tally' }));
    expect(message?.endsWith(STOPPED)).toBe(true);
    expect(reached.commands).toEqual([]);
  });

  test("after the user's next input the command runs", async () => {
    const { h, gate } = await interrupted();
    gate.interrupt();
    await gate.userInput();
    expect(await h.api.command.run({ command: 'tally' })).toEqual({ text: 'ran' });
  });
});

spec('mods.apiGuide.What refused calls return.$.agent.spawn', () => {
  test('after an interruption $.agent.spawn resolves with { deny: reason } and starts no subagent', async () => {
    const { h, gate, reached } = await interrupted();
    gate.interrupt();
    expect(await h.api.agent.spawn({ type: 'reviewer', prompt: 'look' })).toEqual({
      deny: STOPPED,
    });
    expect(reached.agents).toBe(0);
    await gate.userInput();
    expect(await h.api.agent.spawn({ type: 'reviewer', prompt: 'look' })).toEqual({
      agentId: 'a-1',
    });
  });
});

spec('mods.apiGuide.What refused calls return.$.tool.call', () => {
  const background = (tool: string) =>
    `${tool} was not run: it starts background work, a schedule or a goal, and ${STOPPED}`;

  test.each([
    ['Bash with run_in_background: true', 'Bash', { run_in_background: true, command: 'sleep 60' }],
    ['Monitor', 'Monitor', { command: 'tail -f log' }],
    ['CronCreate', 'CronCreate', { cron: '* * * * *', prompt: 'ping' }],
  ])(
    'after an interruption %s resolves with { deny } and the tool is not run',
    async (_label, tool, args) => {
      const { h, gate, reached } = await interrupted();
      gate.interrupt();
      expect(await h.api.tool.call({ tool, ...args })).toEqual({ deny: background(tool) });
      expect(reached.tools).toEqual([]);
    },
  );

  test('a call that starts no background work is not refused: a foreground Bash, a Read, Bash with run_in_background: false', async () => {
    const { h, gate, reached } = await interrupted();
    gate.interrupt();
    await h.api.tool.call({ tool: 'Bash', command: 'ls' });
    await h.api.tool.call({ tool: 'Bash', command: 'ls', run_in_background: false });
    await h.api.tool.call({ tool: 'Read', file_path: '/work/a.txt' });
    expect(reached.tools).toEqual(['Bash', 'Bash', 'Read']);
  });

  test('before any interruption Bash with run_in_background: true runs', async () => {
    const { h, reached } = await interrupted();
    await h.api.tool.call({ tool: 'Bash', command: 'sleep 60', run_in_background: true });
    expect(reached.tools).toEqual(['Bash']);
  });
});

spec('mods.apiGuide.What refused calls return.$.session.send', () => {
  /**
   * The host's roster: `done` is a subagent that finished, `busy` one that is running, `mate` a
   * teammate. The kit gives the port the reason; the port words what each target answers.
   */
  async function roster() {
    const delivered: string[] = [];
    const base = fakePorts().ports;
    const ports: Partial<ModHostPorts> = {
      session: {
        ...base.session,
        send: (to, _text, _signal, refusal) => {
          if (refusal !== undefined && to === 'done') {
            return Promise.resolve({
              isDelivered: false,
              reason: unsentReason.subagent(to, refusal),
            });
          }
          if (refusal !== undefined && to === 'mate') {
            return Promise.resolve({
              isDelivered: false,
              reason: unsentReason.teammate(to, refusal),
            });
          }
          delivered.push(to);
          return Promise.resolve({ isDelivered: true });
        },
      },
    };
    const gate = createRunGate(numbers().port);
    const h = await apiHarness({ ports, options: { gate } });
    return { h, gate, delivered };
  }

  test('after an interruption a send to a subagent that finished resolves with { isDelivered: false } and the reason of the page', async () => {
    const { h, gate, delivered } = await roster();
    gate.interrupt();
    expect(await h.api.session.send({ to: { agentId: 'done' }, text: 'continue' })).toEqual({
      isDelivered: false,
      reason: `Agent "done" was not resumed: ${STOPPED}.`,
    });
    expect(delivered).toEqual([]);
  });

  test('after an interruption a send to an agent team teammate resolves with { isDelivered: false } and the reason of the page', async () => {
    const { h, gate } = await roster();
    gate.interrupt();
    expect(await h.api.session.send({ to: { agentId: 'mate' }, text: 'status?' })).toEqual({
      isDelivered: false,
      reason: `Teammate "mate" was not messaged: ${STOPPED}.`,
    });
  });

  test('a subagent that is still running receives the message', async () => {
    const { h, gate, delivered } = await roster();
    gate.interrupt();
    expect(await h.api.session.send({ to: { agentId: 'busy' }, text: 'continue' })).toEqual({
      isDelivered: true,
    });
    expect(delivered).toEqual(['busy']);
  });

  test("before an interruption, and after the user's next input, the send to the finished subagent is delivered", async () => {
    const { h, gate, delivered } = await roster();
    await h.api.session.send({ to: { agentId: 'done' }, text: 'before' });
    gate.interrupt();
    await gate.userInput();
    await h.api.session.send({ to: { agentId: 'done' }, text: 'after' });
    expect(delivered).toEqual(['done', 'done']);
  });
});

spec(
  'mods.troubleshoot.$.agent.register refused: the hooks module that made the call is no longer loaded',
  () => {
    const agent = { name: 'reviewer', description: 'Reviews a diff', prompt: 'Review it.' };
    const refusal =
      'first-mod: $.agent.register refused: the hooks module that made the call is no longer loaded (it was reloaded or removed)';

    test('a call from a module that was unloaded rejects with the line of the page, and registers nothing', async () => {
      const h = await apiHarness({ plugin: 'first-mod' });
      h.handle.dispose();
      expect(await rejection(h.api.agent.register(agent))).toBe(refusal);
      expect(h.shared.registries.agents.get('reviewer')).toBeUndefined();
    });

    test('while the module is loaded the same call registers the agent', async () => {
      const h = await apiHarness({ plugin: 'first-mod' });
      await h.api.agent.register(agent);
      expect(h.shared.registries.agents.get('reviewer')).toMatchObject({ plugin: 'first-mod' });
    });

    test("a hook of the old copy that had not returned when /reload-plugins ran is refused, and the fresh copy's session.start registers the agent", async () => {
      const outcomes: string[] = [];
      let release: () => void = () => undefined;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const mod = registerOf((on) => {
        on('session.start', async ($: ModsApi, e: unknown) => {
          await $.agent.register({
            name: 'reviewer',
            description: 'Reviews a diff',
            prompt: 'Review it.',
          });
          outcomes.push('registered at session.start');
          return e;
        });
        on('tool.call', async ($: ModsApi, e: unknown) => {
          await held;
          try {
            await $.agent.register({ name: 'late', description: 'Late', prompt: 'Late.' });
            outcomes.push('registered late');
          } catch (error) {
            outcomes.push(error instanceof Error ? error.message : String(error));
          }
          return e;
        });
      });
      const s = session({ 'first-mod': mod });
      await s.host.load([modPlugin(inline('first-mod'), mod)]);
      const running = s.host.fire('tool.call', { tool: 'Bash' });
      await flush();
      await s.host.reload();
      release();
      await running;
      expect(outcomes).toEqual([
        'registered at session.start',
        'registered at session.start',
        refusal,
      ]);
    });

    test('a registration of a command or a tool is refused the same way (judgment)', async () => {
      const h = await apiHarness({ plugin: 'first-mod' });
      h.handle.dispose();
      expect(await rejection(h.api.command.register({ name: 'tally' }))).toContain(
        '$.command.register refused',
      );
      expect(
        await rejection(h.api.tool.register({ name: 'ticket', description: 'x', inputSchema: {} })),
      ).toContain('$.tool.register refused');
    });
  },
);
