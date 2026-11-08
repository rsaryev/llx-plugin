/**
 * plugins/mods/test.md § Stub what Claude Code would answer (`$`, `on`, the grader example, the rules
 * of the kit, the table of what a stub returns), § Test a timer (`mock.clock`, the countdown
 * example).
 */
import { expect, test } from 'bun:test';
import type { RegisterFunction } from '../../../src/testing/mods/index.ts';
import { registerOf } from '../../support/mods-load.ts';
import { runPluginTests, type TestFile } from '../../support/mods-testing.ts';
import { spec } from '../../support/spec.ts';

const grader = registerOf((on) => {
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
});

const run = (name: string, register: RegisterFunction, file: TestFile) =>
  runPluginTests({ name, register, tests: { [`tests/${name}.test.ts`]: file } });

spec('mods.command.claude plugin test [directory]', () => {
  test('a stub for model.complete answers the mod`s call with the object under value', async () => {
    const result = await run('grader', grader, ({ test, expect }) => {
      test('a passing grade is reported', async (claude, on) => {
        const $ = claude;
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
        const $ = claude;
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
        const $ = claude;
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
        const $ = claude;
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
    const starter = registerOf((on) => {
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
    });
    const result = await run('starter', starter, ({ test, expect }) => {
      test('before session.start the module holds its initial values', async (claude, on) => {
        const $ = claude;
        const answer = (await $['command']?.['run']?.({ command: 'where', args: '' })) as {
          text: string;
        };
        expect(answer.text).toBe('unset');
        void on;
      });
      test('after session.start the hook has set up', async (claude, on) => {
        const $ = claude;
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

  test('a mods API call without a stub rejects with no implementation, the kit skips the hook, and a later check fails', async () => {
    const starter = registerOf((on) => {
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
    });
    const result = await run('starter', starter, ({ test, expect }) => {
      test('no command.register stub', async (claude, on) => {
        const $ = claude;
        on('session.start', () => ({ cwd: '/work' }));
        await $['session']?.['start']?.({ surface: 'terminal', isInteractive: true, cwd: '/work' });
        const answer = (await $['command']?.['run']?.({ command: 'where', args: '' })) as {
          text: string;
        };
        expect(answer.text).toBe('/work');
      });
    });
    expect(result.failed).toBe(1);
    expect(result.lines.join('\n')).toContain('no implementation for command.register');
  });

  test('every other call a mod makes needs a stub, the kit answers only ui.invalidate, $.state and session.append', async () => {
    const caller = registerOf((on) => {
      on(
        'command.run',
        { command: 'try' },
        async ($: {
          ui: {
            toast(text: string): Promise<unknown>;
            log(text: string): Promise<unknown>;
            status(text: string): Promise<unknown>;
            invalidate(name: string): Promise<unknown>;
          };
          env: { get(name: string): Promise<unknown> };
          session: { cwd(): Promise<unknown>; append(row: unknown): Promise<unknown> };
        }) => {
          const outcomes: string[] = [];
          const attempt = async (name: string, call: () => Promise<unknown>) => {
            try {
              await call();
              outcomes.push(`${name}: ok`);
            } catch (error) {
              outcomes.push(`${name}: ${error instanceof Error ? error.message : ''}`);
            }
          };
          await attempt('ui.toast', () => $.ui.toast('hi'));
          await attempt('ui.log', () => $.ui.log('hi'));
          await attempt('ui.status', () => $.ui.status('hi'));
          await attempt('env.get', () => $.env.get('HOME'));
          await attempt('session.cwd', () => $.session.cwd());
          await attempt('ui.invalidate', () => $.ui.invalidate('ui.render'));
          await attempt('session.append', () => $.session.append({ role: 'assistant', text: 'x' }));
          return { text: outcomes.join('\n') };
        },
      );
    });
    const result = await run('caller', caller, ({ test, expect }) => {
      test('unanswered calls', async (claude) => {
        const $ = claude;
        const answer = (await $['command']?.['run']?.({ command: 'try', args: '' })) as {
          text: string;
        };
        for (const name of ['ui.toast', 'ui.log', 'ui.status', 'env.get', 'session.cwd']) {
          expect(answer.text).toContain(`no implementation for ${name}`);
        }
        expect(answer.text).toContain('ui.invalidate: ok');
        expect(answer.text).toContain('session.append: ok');
      });
    });
    expect(result.lines.join('\n')).toContain('(pass) unanswered calls');
  });

  test('$.classic.<Event> fires a settings hook event through the mod`s classic hook', async () => {
    const classic = registerOf((on) => {
      on(
        'classic.SessionStart',
        async (_$: unknown, e: { source: string }, next: (e: unknown) => Promise<unknown>) =>
          next({ ...e, seen: e.source }),
      );
    });
    const result = await run('classic', classic, ({ test, expect }) => {
      test('classic', async (claude, on) => {
        const $ = claude;
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
