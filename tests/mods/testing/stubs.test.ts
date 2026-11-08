/**
 * plugins/mods/test.md § Stub what Claude Code would answer (`$`, `on`, the grader example, the rules
 * of the kit, the table of what a stub returns), § Test a timer (`mock.clock`, the countdown
 * example).
 */
import { expect, test } from 'bun:test';
import type { RegisterFunction } from '../../../src/testing/mods/index.ts';
import { runPluginTests, type TestFile } from '../../support/mods-testing.ts';
import { spec } from '../../support/spec.ts';

type Dollar = Record<string, Record<string, (input: unknown) => Promise<unknown>>>;

const grader = ((on: (name: string, ...rest: unknown[]) => void) => {
  on(
    'command.run',
    { command: 'grade' },
    async (
      $: { model: { complete(o: unknown): Promise<{ isAnswered: boolean; text: string }> } },
      e: { args: string },
    ) => {
      const reply = await $.model.complete({ model: 'haiku', system: 'Grade', prompt: e.args });
      const passed = reply.isAnswered && reply.text.startsWith('PASS');
      return { text: passed ? 'Passed' : 'Try again' };
    },
  );
}) as RegisterFunction;

const run = (name: string, register: RegisterFunction, file: TestFile) =>
  runPluginTests({ name, register, tests: { [`tests/${name}.test.ts`]: file } });

spec('mods.command.claude plugin test [directory]', () => {
  test('a stub for model.complete answers the mod`s call with the object under value', async () => {
    const result = await run('grader', grader, ({ test, expect }) => {
      test('a passing grade is reported', async (claude, on) => {
        const $ = claude as unknown as Dollar;
        on('model.complete', () => ({
          value: { isAnswered: true, text: 'PASS\nNice sentence.', usage: {} },
        }));
        const answer = (await $['command']?.['run']?.({
          command: 'grade',
          args: 'The cat sat on the mat.',
        })) as { text: string };
        expect(answer.text).toBe('Passed');
      });
      test('a failing grade asks to try again', async (claude, on) => {
        const $ = claude as unknown as Dollar;
        on('model.complete', () => ({ value: { isAnswered: true, text: 'FAIL', usage: {} } }));
        const answer = (await $['command']?.['run']?.({ command: 'grade', args: 'x' })) as {
          text: string;
        };
        expect(answer.text).toBe('Try again');
      });
    });
    expect(result.exitCode).toBe(0);
    expect(result.passed).toBe(2);
  });

  test('{ deny } makes the mod`s call reject with the reason', async () => {
    const result = await run('grader', grader, ({ test, expect }) => {
      test('a refused model call', async (claude, on) => {
        const $ = claude as unknown as Dollar;
        on('model.complete', () => ({ deny: 'no model here' }));
        on('command.run', () => ({ text: 'core' }));
        const answer = (await $['command']?.['run']?.({ command: 'grade', args: 'x' })) as {
          text: string;
        };
        // the hook threw on the rejected call, so the kit skipped it and `core` answered
        expect(answer.text).toBe('core');
      });
    });
    expect(result.exitCode).toBe(0);
  });

  test('on("x") after the first call on $ throws `on("x") after the test first called $`', async () => {
    const result = await run('grader', grader, ({ test }) => {
      test('late stub', async (claude, on) => {
        const $ = claude as unknown as Dollar;
        on('command.run', () => ({ text: 'core' }));
        await $['command']?.['run']?.({ command: 'other', args: '' });
        on('ui.render', () => ({ type: 'Text', props: {}, children: [] }));
      });
    });
    expect(result.exitCode).toBe(1);
    expect(result.lines.join('\n')).toContain('on("ui.render") after the test first called $');
  });

  test('a stub for turn.step is an async generator the test reads to its end', async () => {
    const result = await run('grader', grader, ({ test, expect }) => {
      test('stream', async (claude, on) => {
        const $ = claude as unknown as {
          turn: { step(e: unknown): AsyncGenerator<unknown, { answer: string }> };
        };
        on('turn.step', async function* (_$: unknown, e: { turnId: string; index: number }) {
          yield { kind: 'text', index: 0, text: 'ok' };
          return {
            turnId: e.turnId,
            index: e.index,
            answer: 'ok',
            toolUses: [],
            stopReason: 'end_turn',
            usage: null,
          };
        } as never);
        const pieces: unknown[] = [];
        const stream = $.turn.step({
          turnId: 't',
          index: 0,
          model: 'claude-test',
          messageCount: 1,
        });
        let step = await stream.next();
        while (step.done !== true) {
          pieces.push(step.value);
          step = await stream.next();
        }
        expect(pieces).toEqual([{ kind: 'text', index: 0, text: 'ok' }]);
        expect(step.value.answer).toBe('ok');
      });
    });
    expect(result.exitCode).toBe(0);
  });

  test('session.start does not run by itself: the test fires it, and the stubs answer the hook`s command.register call', async () => {
    const starter = ((on: (name: string, ...rest: unknown[]) => void) => {
      let cwd = 'unset';
      on(
        'session.start',
        async (
          $: { command: { register(c: unknown): Promise<void> } },
          e: { cwd: string },
          next: (e: unknown) => Promise<unknown>,
        ) => {
          await $.command.register({ name: 'where', description: 'Show the directory' });
          cwd = e.cwd;
          return next(e);
        },
      );
      on('command.run', { command: 'where' }, async () => ({ text: cwd }));
    }) as RegisterFunction;
    const result = await run('starter', starter, ({ test, expect }) => {
      test('before session.start the module holds its initial values', async (claude, on) => {
        const $ = claude as unknown as Dollar;
        const answer = (await $['command']?.['run']?.({ command: 'where', args: '' })) as {
          text: string;
        };
        expect(answer.text).toBe('unset');
        void on;
      });
      test('after session.start the hook has set up', async (claude, on) => {
        const $ = claude as unknown as Dollar;
        on('session.start', () => ({ cwd: '/work' }));
        on('command.register', () => ({ value: undefined }));
        await $['session']?.['start']?.({ surface: 'terminal', isInteractive: true, cwd: '/work' });
        const answer = (await $['command']?.['run']?.({ command: 'where', args: '' })) as {
          text: string;
        };
        expect(answer.text).toBe('/work');
      });
    });
    expect(result.lines.join('\n')).toContain('(pass) after session.start the hook has set up');
    expect(result.exitCode).toBe(0);
  });

  test('$.classic.<Event> fires a settings hook event through the mod`s classic hook', async () => {
    const classic = ((on: (name: string, ...rest: unknown[]) => void) => {
      on(
        'classic.SessionStart',
        async (_$: unknown, e: { source: string }, next: (e: unknown) => Promise<unknown>) =>
          next({ ...e, seen: e.source }),
      );
    }) as RegisterFunction;
    const result = await run('classic', classic, ({ test, expect }) => {
      test('classic', async (claude, on) => {
        const $ = claude as unknown as Dollar;
        on('classic.SessionStart', (_$: unknown, e: { seen: string }) => ({ echoed: e.seen }));
        const out = await $['classic']?.['SessionStart']?.({ source: 'clear' });
        expect(out).toEqual({ echoed: 'clear' });
      });
    });
    expect(result.lines.join('\n')).toContain('(pass) classic');
  });

  test('expect has toBe, toEqual, toMatch, toMatchObject, toContain, toBeDefined, toBeUndefined, toThrow and .not before each', async () => {
    const result = await run('grader', grader, ({ test, expect }) => {
      test('every assertion holds', () => {
        expect(1).toBe(1);
        expect({ a: [1, { b: 2 }] }).toEqual({ a: [1, { b: 2 }] });
        expect('hello world').toMatch(/wor/);
        expect({ a: 1, b: { c: 2, d: 3 } }).toMatchObject({ b: { c: 2 } });
        expect(['x', 'y']).toContain('y');
        expect('abc').toContain('b');
        expect(0).toBeDefined();
        expect(undefined).toBeUndefined();
        expect(() => {
          throw new Error('boom');
        }).toThrow('boom');
        expect(1).not.toBe(2);
        expect([1]).not.toContain(2);
        expect(() => 1).not.toThrow();
      });
      test('a failed assertion fails the test', () => {
        expect(1).not.toBe(1);
      });
    });
    expect(result.passed).toBe(1);
    expect(result.failed).toBe(1);
  });
});
