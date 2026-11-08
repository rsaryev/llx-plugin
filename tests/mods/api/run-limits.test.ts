/**
 * plugins/mods/api.md § Calls refused in `claude -p` runs and Agent SDK sessions (a refused
 * `$.prompt.submit` resolves with `{ drop: '<reason>' }`; the four reasons and what each one does
 * to a retry), § A `claude -p` run with your mod never exits ("Once the run reaches that limit, the
 * mod's next prompt is refused instead of starting a turn, and the run ends").
 */
import { describe, expect, test } from 'bun:test';
import { createRunGate, type ModHostPorts, type RunLimits } from '../../../src/mods/api/index.ts';
import { fakePorts } from '../../../src/testing/mods/index.ts';
import { apiHarness } from '../../support/mods-api.ts';
import { inline, modPlugin, registerOf, session } from '../../support/mods-load.ts';
import { numbers, recording, STOPPED } from '../../support/mods-refusal.ts';
import { rejection } from '../../support/rejection.ts';
import { spec } from '../../support/spec.ts';
import type { ModsApi } from '../../../src/mods/types.ts';

/** Whether a prompt was refused: `$.prompt.submit` resolved with `{ drop }`. */
const isDrop = (answer: unknown): boolean =>
  typeof answer === 'object' && answer !== null && 'drop' in answer;

describe('the reasons of a run (api.md, "Calls refused in `claude -p` runs and Agent SDK sessions")', () => {
  const MAX_TURNS = 'the run reached its --max-turns limit';
  const BUDGET = 'the run is past its --max-budget-usd limit';
  const ENDED = 'the host has ended its input';

  async function run(limits: RunLimits, start = { turns: 0, cost: 0 }) {
    const world = numbers(start);
    const { reached, ports } = recording();
    const gate = createRunGate(world.port, limits);
    const h = await apiHarness({ ports, options: { gate } });
    return { h, gate, reached, world };
  }

  spec('mods.apiGuide.Calls refused in claude -p runs and Agent SDK sessions', () => {
    test('a refused $.prompt.submit resolves with { drop: reason }; $.command.run and $.agent.spawn give the results of the table with the reason', async () => {
      const { h, world } = await run({ maxTurns: 2 });
      world.state.turns = 2;
      expect(await h.api.prompt.submit({ text: 'again' })).toEqual({ drop: MAX_TURNS });
      expect((await rejection(h.api.command.run({ command: 'tally' })))?.endsWith(MAX_TURNS)).toBe(
        true,
      );
      expect(await h.api.agent.spawn({ type: 'reviewer', prompt: 'look' })).toEqual({
        deny: MAX_TURNS,
      });
    });

    test('the run reached its --max-turns limit: calls are accepted below it, refused at it, and the turn count starts over with the next prompt of the user', async () => {
      const { h, gate, world } = await run({ maxTurns: 3 }, { turns: 1, cost: 0 });
      expect(await h.api.prompt.submit({ text: 'a' })).toEqual({});
      world.state.turns = 3;
      expect(await h.api.prompt.submit({ text: 'b' })).toEqual({ drop: MAX_TURNS });
      await gate.userInput();
      expect(await h.api.prompt.submit({ text: 'c' })).toEqual({});
      world.state.turns = 6;
      expect(await h.api.prompt.submit({ text: 'd' })).toEqual({ drop: MAX_TURNS });
    });

    test('the run is past its --max-budget-usd limit: the total keeps adding up, so the next prompt of the user does not lift it', async () => {
      const { h, gate, world } = await run({ maxBudgetUsd: 1 });
      world.state.cost = 1;
      expect(await h.api.prompt.submit({ text: 'at the limit' })).toEqual({});
      world.state.cost = 1.01;
      expect(await h.api.prompt.submit({ text: 'a' })).toEqual({ drop: BUDGET });
      await gate.userInput();
      expect(await h.api.prompt.submit({ text: 'b' })).toEqual({ drop: BUDGET });
    });

    test('the host has ended its input: a retry returns the same reason, whatever the user sends', async () => {
      const { h, gate } = await run({});
      gate.endInput();
      expect(await h.api.prompt.submit({ text: 'a' })).toEqual({ drop: ENDED });
      await gate.userInput();
      expect(await h.api.prompt.submit({ text: 'b' })).toEqual({ drop: ENDED });
    });

    test('the session was stopped and nobody has sent input since: the run was interrupted', async () => {
      const { h, gate } = await run({});
      gate.interrupt();
      expect(await h.api.prompt.submit({ text: 'a' })).toEqual({ drop: STOPPED });
    });

    test('a run with no limits and no interruption refuses nothing', async () => {
      const { h, world, reached } = await run({});
      world.state.turns = 1000;
      world.state.cost = 1000;
      expect(await h.api.prompt.submit({ text: 'a' })).toEqual({});
      expect(reached.prompts).toEqual(['a']);
    });
  });

  spec('mods.apiGuide.A claude -p run with your mod never exits', () => {
    /** A mod that submits a prompt at the end of every turn: each prompt starts another turn. */
    async function loop(limits: RunLimits, turnsToRun: number) {
      let turns = 1;
      const answers: unknown[] = [];
      const base = fakePorts().ports;
      const ports: Partial<ModHostPorts> = {
        session: {
          ...base.session,
          turns: () => Promise.resolve(turns),
          usage: () => Promise.resolve({ cost: 0 }),
        },
        prompts: {
          ...base.prompts,
          submit: () => {
            turns += 1;
            return Promise.resolve({});
          },
        },
      };
      const mod = registerOf((on) => {
        on('turn.complete', async ($: ModsApi, e: unknown) => {
          answers.push(await $.prompt.submit({ text: 'keep going' }));
          return e;
        });
      });
      const s = session({ 'first-mod': mod }, { ports: fakePorts(ports).ports, limits });
      await s.host.load([modPlugin(inline('first-mod'), mod)]);
      for (let turn = 0; turn < turnsToRun; turn += 1) {
        await s.host.fire('turn.complete', {
          turnId: `t-${turn}`,
          answer: '',
          durationMs: 1,
          usage: {},
          isAborted: false,
        });
        if (isDrop(answers.at(-1))) break;
      }
      return answers;
    }

    test('without --max-turns or --max-budget-usd every prompt starts another turn, and the run goes on until it is stopped', async () => {
      expect(await loop({}, 25)).toHaveLength(25);
    });

    test("with --max-turns the mod's next prompt is refused at the limit instead of starting a turn, and the run ends", async () => {
      const answers = await loop({ maxTurns: 5 }, 25);
      expect(answers).toEqual([{}, {}, {}, {}, { drop: MAX_TURNS }]);
    });
  });
});
