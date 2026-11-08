/**
 * plugins/mods/test.md § Look up what a stub returns (`{ deny }`, a stub that throws, the `expect` that
 * fails inside a stub, the fires of `$.prompt.submit`, `$.turn.complete` and `$.session.receive`), §
 * Test a timer (`clock.set`, `clock.settle`, `clock.sleep`, `clock.now`, `mock.clock(on, { now })`), §
 * Test a policy mod (`tier`, the `tier` of an inline mod).
 */
import { expect, test } from 'bun:test';
import { registerOf } from '../../support/mods-load.ts';
import { runPluginTests, type TestFile } from '../../support/mods-testing.ts';
import { spec } from '../../support/spec.ts';

type Next = (e: unknown) => Promise<unknown>;

const subject = registerOf((on) => {
  on('command.run', { command: 'now' }, async ($: { clock: { now(): Promise<number> } }) => ({
    text: String(await $.clock.now()),
  }));
  on(
    'command.run',
    { command: 'read' },
    async ($: { fs: { read(path: string): Promise<unknown> } }) => {
      try {
        await $.fs.read('notes.md');
        return { text: 'read' };
      } catch (error) {
        return { text: error instanceof Error ? error.message : 'failed' };
      }
    },
  );
  on(
    'command.run',
    { command: 'ticks' },
    async ($: {
      clock: { after(ms: number, f: () => void): unknown };
      ui: { toast(text: string): Promise<unknown> };
    }) => {
      $.clock.after(0, () => void $.ui.toast('zero'));
      $.clock.after(1500, () => void $.ui.toast('late'));
      return {};
    },
  );
  on('prompt.submit', async (_$: unknown, e: { text: string }, next: Next) =>
    next({ ...e, text: e.text.toUpperCase() }),
  );
  on('turn.complete', async (_$: unknown, e: { answer: string }, next: Next) =>
    next({ ...e, answer: `${e.answer}!` }),
  );
  on('session.receive', async (_$: unknown, e: { text: string }, next: Next) =>
    next({ ...e, text: `peer: ${e.text}` }),
  );
});

const run = (file: TestFile) =>
  runPluginTests({ name: 'subject', register: subject, tests: { 'tests/subject.test.ts': file } });

spec('mods.command.claude plugin test [directory]', () => {
  test('clock.now, clock.set, clock.settle and mock.clock(on, { now }) move and read the time the mod sees', async () => {
    const result = await run(({ test, expect, mock }) => {
      test('the clock starts at now and moves with set', async (claude, on) => {
        const $ = claude;
        const clock = mock.clock(on, { now: 5000 });
        expect(clock.now()).toBe(5000);
        const first = (await $['command']?.['run']?.({ command: 'now', args: '' })) as {
          text: string;
        };
        expect(first.text).toBe('5000');
        await clock.set(7500);
        expect(clock.now()).toBe(7500);
        const second = (await $['command']?.['run']?.({ command: 'now', args: '' })) as {
          text: string;
        };
        expect(second.text).toBe('7500');
        await clock.set(100);
        expect(clock.now()).toBe(7500);
      });
      test('settle runs what is due without moving the time; advance runs the later timer', async (claude, on) => {
        const $ = claude;
        const clock = mock.clock(on);
        const toasts: string[] = [];
        on('ui.toast', (_$: unknown, e: { text: string }) => {
          toasts.push(e.text);
          return { value: undefined };
        });
        await $['command']?.['run']?.({ command: 'ticks', args: '' });
        await clock.settle();
        expect(toasts).toEqual(['zero']);
        expect(clock.now()).toBe(0);
        await clock.advance(1500);
        expect(toasts).toEqual(['zero', 'late']);
      });
      test('sleep inside a stub answers only once the test has advanced that far', async (claude, on) => {
        const $ = claude;
        const clock = mock.clock(on);
        let started = false;
        on('fs.read', async () => {
          started = true;
          await clock.sleep(2000);
          return { value: '# Notes' };
        });
        let answered = false;
        const pending = $['command']?.['run']?.({ command: 'read', args: '' })?.then((answer) => {
          answered = true;
          return answer as { text: string };
        });
        // let the call load the mods and reach the stub, which starts its sleep
        while (!started) await new Promise((resolve) => setTimeout(resolve, 0));
        await clock.advance(1999);
        expect(answered).toBe(false);
        await clock.advance(1);
        expect((await pending)?.text).toBe('read');
      });
    });
    expect(result.lines.join('\n')).toContain('(pass) the clock starts at now and moves with set');
    expect(result.lines.join('\n')).toContain('(pass) settle runs what is due');
    expect(result.lines.join('\n')).toContain('(pass) sleep inside a stub');
    expect(result.exitCode).toBe(0);
  });

  test('a stub that returns { deny } makes the call reject with that reason, and a stub that throws is skipped', async () => {
    const result = await run(({ test, expect }) => {
      test('deny', async (claude, on) => {
        const $ = claude;
        on('fs.read', () => ({ deny: 'no such notes' }));
        const answer = (await $['command']?.['run']?.({ command: 'read', args: '' })) as {
          text: string;
        };
        expect(answer.text).toContain('no such notes');
        expect(answer.text).not.toBe('read');
      });
      test('a throwing stub is skipped, not an answer', async (claude, on) => {
        const $ = claude;
        on('fs.read', () => {
          throw new Error('stub broke');
        });
        const answer = (await $['command']?.['run']?.({ command: 'read', args: '' })) as {
          text: string;
        };
        expect(answer.text).not.toBe('read');
        expect(answer.text).toContain('no implementation for fs.read');
      });
    });
    expect(result.lines.join('\n')).toContain('(pass) deny');
    expect(result.lines.join('\n')).toContain('(pass) a throwing stub is skipped');
    expect(result.exitCode).toBe(0);
  });

  test('an expect that fails inside a stub fails the test and names the hook: in the test`s <name> hook', async () => {
    const result = await run(({ test, expect }) => {
      test('checks inside a stub', async (claude, on) => {
        const $ = claude;
        on('fs.read', (_$: unknown, e: { path: string }) => {
          expect(e.path.endsWith('other.md')).toBe(true);
          return { value: '' };
        });
        await $['command']?.['run']?.({ command: 'read', args: '' });
      });
    });
    expect(result.exitCode).toBe(1);
    expect(result.lines.join('\n')).toContain("in the test's fs.read hook");
  });

  test('$.prompt.submit, $.turn.complete and $.session.receive fire the mod`s hooks, and the stub answers after them', async () => {
    const result = await run(({ test, expect }) => {
      test('three fires', async (claude, on) => {
        const $ = claude;
        on('prompt.submit', (_$: unknown, e: { text: string }) => ({ text: e.text }));
        on('turn.complete', (_$: unknown, e: { answer: string }) => ({ text: e.answer }));
        on('session.receive', (_$: unknown, e: { text: string }) => ({ text: e.text }));
        expect(await $['prompt']?.['submit']?.({ text: 'hello' })).toEqual({ text: 'HELLO' });
        expect(
          await $['turn']?.['complete']?.({
            turnId: 't1',
            answer: 'done',
            durationMs: 5,
            isAborted: false,
            usage: null,
          }),
        ).toEqual({ text: 'done!' });
        expect(
          await $['session']?.['receive']?.({
            origin: { kind: 'peer-send-message' },
            text: 'hi',
          }),
        ).toEqual({ text: 'peer: hi' });
      });
    });
    expect(result.lines.join('\n')).toContain('(pass) three fires');
    expect(result.exitCode).toBe(0);
  });
});

const answerer = (name: string) =>
  registerOf((on) => {
    on('tool.call', async () => ({ result: `${name} answered` }));
  });

spec('mods.command.claude plugin test [directory]', () => {
  test('tier("append") and tier("builtin") load the mod under test after the inline mods of the test; a per-inline-mod tier places that mod', async () => {
    const append = await runPluginTests({
      name: 'subject',
      register: answerer('subject'),
      tests: {
        'tests/a.test.ts': ({ test, tier, expect }) => {
          tier('append');
          test(
            'an inline user mod answers first',
            { plugins: [{ name: 'inline-user', register: answerer('inline-user') }] },
            async (claude, on) => {
              const $ = claude;
              on('tool.call', () => ({ result: 'core' }));
              expect(await $['tool']?.['call']?.({ tool: 'Bash', command: 'ls' })).toEqual({
                result: 'inline-user answered',
              });
            },
          );
        },
      },
    });
    expect(append.lines.join('\n')).toContain('(pass) an inline user mod answers first');
    const builtin = await runPluginTests({
      name: 'subject',
      register: answerer('subject'),
      tests: {
        'tests/b.test.ts': ({ test, tier, expect }) => {
          tier('builtin');
          test(
            'an inline append mod answers before the built-in mod',
            {
              plugins: [
                { name: 'inline-append', register: answerer('inline-append'), tier: 'append' },
              ],
            },
            async (claude, on) => {
              const $ = claude;
              on('tool.call', () => ({ result: 'core' }));
              expect(await $['tool']?.['call']?.({ tool: 'Bash', command: 'ls' })).toEqual({
                result: 'inline-append answered',
              });
            },
          );
          test(
            'an inline prepend mod answers before every other',
            {
              plugins: [
                { name: 'inline-first', register: answerer('inline-first'), tier: 'prepend' },
              ],
            },
            async (claude, on) => {
              const $ = claude;
              on('tool.call', () => ({ result: 'core' }));
              expect(await $['tool']?.['call']?.({ tool: 'Bash', command: 'ls' })).toEqual({
                result: 'inline-first answered',
              });
            },
          );
        },
      },
    });
    expect(builtin.lines.join('\n')).toContain('(pass) an inline append mod answers before');
    expect(builtin.lines.join('\n')).toContain('(pass) an inline prepend mod answers before');
    expect(append.exitCode + builtin.exitCode).toBe(0);
  });
});

spec('mods.command.claude plugin test [directory]', () => {
  test('a hooks.json that holds only settings hooks is no hooks module, even when the text says "modules"', async () => {
    const settingsHooks = JSON.stringify({
      hooks: {
        PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo "modules"' }] }],
      },
    });
    const result = await runPluginTests({
      name: 'settings-only',
      extra: { 'hooks/hooks.json': settingsHooks },
      tests: {
        'tests/s.test.ts': ({ test, expect: check }) => {
          test('nothing to load', async (claude, on) => {
            on('tool.call', () => ({ result: 'core answered' }));
            const answer = await claude['tool']?.['call']?.({ tool: 'Bash', command: 'ls' });
            check(answer).toEqual({ result: 'core answered' });
          });
        },
      },
    });
    expect(result.lines.join('\n')).toContain('(pass) nothing to load');
    expect(result.exitCode).toBe(0);
  });
});
