/**
 * Guarding a tool call from a hook. plugins/mods/events.md § Guard or change a tool call (change,
 * retry, answer, withhold) and § Hold a tool call until the user decides (the four ways the question
 * ends); the wording Claude reads of a withheld result is the page's. Where a call is made, and what
 * the permission check and the tool do, is the host's: the tests fire `tool.call` through the chain
 * with a `core` that stands for "the permission check, then the tool", and record what reaches it.
 */
import { describe, expect, test } from 'bun:test';
import { withheldResultText } from '../../../src/mods/events/index.ts';
import { fn, record } from '../../support/mods-chain.ts';
import { eventHarness } from '../../support/mods-events.ts';
import { spec } from '../../support/spec.ts';

const bash = { tool: 'Bash', command: 'git push --force' };

/** Claude Code's own behaviour for a call: the permission check, then the tool. */
const permissionThenTool = (trace: unknown[], result: unknown = { stdout: 'ran' }) => {
  return (e: unknown): Promise<unknown> => {
    trace.push('permission check', e);
    trace.push('tool');
    return Promise.resolve(result);
  };
};

describe('guard or change a tool call', () => {
  spec('mods.events.Guard or change a tool call.Change the call', () => {
    test('arguments passed to next are what the permission check and the tool receive, and later hooks see them too', async () => {
      const h = eventHarness();
      const trace: unknown[] = [];
      const later: unknown[] = [];
      h.mod('first-mod', 'user', [
        fn('tool.call', (_$, e, next) => next({ ...e, command: 'git push' })),
      ]);
      h.mod('second-mod', 'user', [fn('tool.call', (_$, e, next) => (later.push(e), next(e)))]);
      await h.fire('tool.call', bash, { core: permissionThenTool(trace) });
      expect(later).toEqual([{ tool: 'Bash', command: 'git push' }]);
      expect(trace).toEqual(['permission check', { tool: 'Bash', command: 'git push' }, 'tool']);
    });

    test('the event the hook received is not touched: a change is a copy, and the original stays frozen', async () => {
      const h = eventHarness();
      const seen: Record<string, unknown>[] = [];
      h.mod('first-mod', 'user', [
        fn('tool.call', (_$, e, next) => {
          seen.push(e);
          return next({ ...e, command: 'ls' });
        }),
      ]);
      await h.fire('tool.call', bash);
      expect(seen[0]?.command).toBe('git push --force');
      expect(Object.isFrozen(seen[0])).toBe(true);
    });
  });

  spec('mods.events.Guard or change a tool call.Retry the call', () => {
    test('a hook that sees isError on the first result calls next(e) again: the tool runs a second time and the hook returns that result', async () => {
      const h = eventHarness();
      const trace: unknown[] = [];
      let runs = 0;
      h.mod('retry-mod', 'user', [
        fn('tool.call', async (_$, e, next) => {
          const first = record(await next(e));
          return first.isError ? next(e) : first;
        }),
      ]);
      const result = await h.fire('tool.call', bash, {
        core: (e) => {
          trace.push(e);
          runs += 1;
          return Promise.resolve(runs === 1 ? { isError: true } : { stdout: 'second run' });
        },
      });
      expect(result).toEqual({ stdout: 'second run' });
      expect(trace).toHaveLength(2);
    });

    test('a first result that is not an error is not retried', async () => {
      const h = eventHarness();
      let runs = 0;
      h.mod('retry-mod', 'user', [
        fn('tool.call', async (_$, e, next) => {
          const first = record(await next(e));
          return first.isError ? next(e) : first;
        }),
      ]);
      const result = await h.fire('tool.call', bash, {
        core: () => {
          runs += 1;
          return Promise.resolve({ stdout: 'fine' });
        },
      });
      expect(result).toEqual({ stdout: 'fine' });
      expect(runs).toBe(1);
    });
  });

  spec('mods.events.Guard or change a tool call.Answer the call yourself', () => {
    test('a result without next: no permission prompt appears, the tool does not run, and the result is all Claude learns', async () => {
      const h = eventHarness();
      const trace: unknown[] = [];
      h.mod('answer-mod', 'user', [
        fn('tool.call', () => Promise.resolve({ result: { stdout: 'stubbed', stderr: '' } })),
      ]);
      const result = await h.fire('tool.call', bash, { core: permissionThenTool(trace) });
      expect(result).toEqual({ result: { stdout: 'stubbed', stderr: '' } });
      expect(trace).toEqual([]);
    });

    test('hooks after the answering one never see the call', async () => {
      const h = eventHarness();
      const later: unknown[] = [];
      h.mod('answer-mod', 'user', [fn('tool.call', () => Promise.resolve({ result: 'x' }))]);
      h.mod('later-mod', 'user', [fn('tool.call', (_$, e, next) => (later.push(e), next(e)))]);
      await h.fire('tool.call', bash);
      expect(later).toEqual([]);
    });
  });

  spec('mods.events.Guard or change a tool call.Withhold the result from Claude', () => {
    test('{ deny } after await next(e): the tool ran and nothing it did is undone, and Claude reads the reason in place of the result', async () => {
      const h = eventHarness();
      const trace: unknown[] = [];
      h.mod('withhold-mod', 'user', [
        fn('tool.call', async (_$, e, next) => {
          await next(e);
          return { deny: 'The output is private.' };
        }),
      ]);
      const result = await h.fire('tool.call', bash, { core: permissionThenTool(trace) });
      expect(result).toEqual({ deny: 'The output is private.' });
      expect(trace).toContain('tool');
    });

    test('when the tool ran and succeeded, the reason follows the note "Bash ran, and a plugin withheld its result:"', () => {
      expect(
        withheldResultText({ tool: 'Bash', reason: 'The output is private.', ran: 'succeeded' }),
      ).toBe('Bash ran, and a plugin withheld its result: The output is private.');
    });
  });
});

/** The hook of events.md, "Hold a tool call until the user decides". */
const RISKY = /\brm\s+-rf?\b|\bgit\s+reset\s+--hard\b|\bgit\s+push\b.*--force/;

const holdHook = () =>
  fn(
    'tool.call',
    async ($, e, next) => {
      if (!RISKY.test(String(e.command))) return next(e);
      let answer: unknown = 'Refuse';
      try {
        answer = await $.ui.ask('Run this command? ' + String(e.command), ['Run it', 'Refuse']);
      } catch {
        // dismissed, or a claude -p run with nobody to ask
      }
      if (answer !== 'Run it') {
        return { deny: 'The user declined this command. Ask before trying a different approach.' };
      }
      return next(e);
    },
    { matcher: { tool: 'Bash' } },
  );

const DECLINED = {
  deny: 'The user declined this command. Ask before trying a different approach.',
};

describe('hold a tool call until the user decides', () => {
  const rm = { tool: 'Bash', command: 'rm -rf build' };

  /** A session whose question is answered by `answer`, and the questions asked. */
  const asking = (answer: () => Promise<string>) => {
    const h = eventHarness();
    const questions: unknown[][] = [];
    h.mod('hold-mod', 'user', [holdHook()], {
      'ui.ask': (...args: unknown[]) => {
        questions.push(args);
        return answer();
      },
    });
    return { h, questions };
  };

  spec('mods.events.Hold a tool call until the user decides.The user picks Run it', () => {
    test('the hook calls next(e), and the usual permission check still runs after it', async () => {
      const { h, questions } = asking(() => Promise.resolve('Run it'));
      const trace: unknown[] = [];
      const result = await h.fire('tool.call', rm, { core: permissionThenTool(trace) });
      expect(questions).toEqual([['Run this command? rm -rf build', ['Run it', 'Refuse']]]);
      expect(result).toEqual({ stdout: 'ran' });
      expect(trace).toEqual(['permission check', rm, 'tool']);
    });

    test('a command that is not risky goes through without a question', async () => {
      const { h, questions } = asking(() => Promise.resolve('Refuse'));
      const result = await h.fire('tool.call', { tool: 'Bash', command: 'ls' });
      expect(questions).toEqual([]);
      expect(result).toEqual({ core: { tool: 'Bash', command: 'ls' } });
    });
  });

  spec('mods.events.Hold a tool call until the user decides.The user picks Refuse', () => {
    test('the command does not run, and Claude reads the deny text', async () => {
      const { h } = asking(() => Promise.resolve('Refuse'));
      const trace: unknown[] = [];
      const result = await h.fire('tool.call', rm, { core: permissionThenTool(trace) });
      expect(result).toEqual(DECLINED);
      expect(trace).toEqual([]);
    });
  });

  spec('mods.events.Hold a tool call until the user decides.The user types an answer', () => {
    test('$.ui.ask resolves to the typed text, and any other text than "Run it" refuses the command', async () => {
      const { h } = asking(() => Promise.resolve('sure, go ahead'));
      const trace: unknown[] = [];
      const result = await h.fire('tool.call', rm, { core: permissionThenTool(trace) });
      expect(result).toEqual(DECLINED);
      expect(trace).toEqual([]);
    });
  });

  spec('mods.events.Hold a tool call until the user decides.Nobody answers', () => {
    test('$.ui.ask rejects when the user dismisses the question or picks Chat about this, so the catch block leaves the answer at Refuse', async () => {
      const { h } = asking(() => Promise.reject(new Error('dismissed')));
      const trace: unknown[] = [];
      const result = await h.fire('tool.call', rm, { core: permissionThenTool(trace) });
      expect(result).toEqual(DECLINED);
      expect(trace).toEqual([]);
    });

    test('a hook with no catch block fails when nobody answers, so Claude Code skips it and the held command runs', async () => {
      const h = eventHarness();
      const trace: unknown[] = [];
      h.mod(
        'careless-mod',
        'user',
        [
          fn('tool.call', async ($, e, next) => {
            await $.ui.ask('Run it?', ['Run it', 'Refuse']);
            return next(e);
          }),
        ],
        { 'ui.ask': () => Promise.reject(new Error('dismissed')) },
      );
      const result = await h.fire('tool.call', rm, { core: permissionThenTool(trace) });
      expect(result).toEqual({ stdout: 'ran' });
      expect(h.reports.map((report) => report.line)).toEqual([
        'careless-mod: tool.call hook skipped: threw Error: dismissed',
      ]);
    });

    test('a .catch handler on the registration refuses the command instead', async () => {
      const h = eventHarness();
      const trace: unknown[] = [];
      h.mod(
        'strict-mod',
        'user',
        [
          fn(
            'tool.call',
            async ($, e, next) => {
              await $.ui.ask('Run it?', ['Run it', 'Refuse']);
              return next(e);
            },
            { handler: () => Promise.resolve({ deny: 'The question was not answered.' }) },
          ),
        ],
        { 'ui.ask': () => Promise.reject(new Error('dismissed')) },
      );
      const result = await h.fire('tool.call', rm, { core: permissionThenTool(trace) });
      expect(result).toEqual({ deny: 'The question was not answered.' });
      expect(trace).toEqual([]);
    });
  });
});
