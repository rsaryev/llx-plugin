/**
 * plugins/mods/test.md § Stub what Claude Code would answer (`mock.clock`, `mock.store`, `mock.env`,
 * `mock.session`; a `$.clock` call without `mock.clock` fails with `no implementation for clock.now`),
 * § Test a timer (the countdown example).
 */
import { expect, test } from 'bun:test';
import type { RegisterFunction } from '../../../src/testing/mods/index.ts';
import { registerOf } from '../../support/mods-load.ts';
import { runPluginTests, type TestFile } from '../../support/mods-testing.ts';
import { spec } from '../../support/spec.ts';

const countdown = registerOf((on) => {
  on(
    'command.run',
    { command: 'countdown' },
    async (
      $: {
        clock: { every(ms: number, f: () => void): { cancel(): void } };
        ui: { toast(text: string): void };
      },
      e: { args: string },
    ) => {
      let left = Number(e.args);
      const timer = $.clock.every(1000, () => {
        left -= 1;
        if (left === 0) {
          timer.cancel();
          $.ui.toast('Time is up');
        }
      });
      return {};
    },
  );
});

/** A user-role row of one text block, as `$.session.append` takes it (claude-code/index.d.ts:11585). */
const note = (text: string) => ({ message: { type: 'user', content: [{ type: 'text', text }] } });

const run = (name: string, register: RegisterFunction, file: TestFile) =>
  runPluginTests({ name, register, tests: { [`tests/${name}.test.ts`]: file } });

spec('mods.command.claude plugin test [directory]', () => {
  test('mock.clock answers $.clock from a clock the test advances: the countdown ends with a toast', async () => {
    const result = await run('countdown', countdown, ({ test, expect, mock }) => {
      test('the countdown ends with a toast', async (claude, on) => {
        const $ = claude;
        const clock = mock.clock(on);
        const toasts: string[] = [];
        on('ui.toast', (_$: unknown, e: { text: string }) => {
          toasts.push(e.text);
          return { value: undefined };
        });
        await $['command']?.['run']?.({ command: 'countdown', args: '3' });
        await clock.advance(2000);
        expect(toasts).toEqual([]);
        await clock.advance(1000);
        expect(toasts).toEqual(['Time is up']);
      });
    });
    expect(result.exitCode).toBe(0);
  });

  test('without mock.clock a $.clock call fails with `no implementation for clock.now`', async () => {
    const stamp = registerOf((on) => {
      on('command.run', { command: 'stamp' }, async ($: { clock: { now(): Promise<number> } }) => ({
        text: String(await $.clock.now()),
      }));
    });
    const result = await run('stamp', stamp, ({ test, expect }) => {
      test('unanswered clock', async (claude, on) => {
        const $ = claude;
        on('command.run', () => ({ text: 'core' }));
        const answer = (await $['command']?.['run']?.({ command: 'stamp', args: '' })) as {
          text: string;
        };
        expect(answer.text).toBe('0');
      });
    });
    expect(result.exitCode).toBe(1);
    expect(result.lines.join('\n')).toContain('no implementation for clock.now');
  });

  test('mock.store answers $.store from the entries given; mock.env answers $.env.get', async () => {
    const reader = registerOf((on) => {
      on(
        'command.run',
        { command: 'read' },
        async ($: {
          store: { get(k: string): Promise<unknown> };
          env: { get(n: string): Promise<unknown> };
        }) => ({ text: `${String(await $.store.get('count'))} ${String(await $.env.get('CI'))}` }),
      );
    });
    const result = await run('reader', reader, ({ test, expect, mock }) => {
      test('values', async (claude, on) => {
        const $ = claude;
        mock.store(on, { count: 7 });
        mock.env(on, { CI: 'true' });
        const answer = (await $['command']?.['run']?.({ command: 'read', args: '' })) as {
          text: string;
        };
        expect(answer.text).toBe('7 true');
      });
    });
    expect(result.exitCode).toBe(0);
  });

  test('mock.session(on).appended() lists the rows the mod added, oldest first', async () => {
    const writer = registerOf((on) => {
      on(
        'command.run',
        { command: 'note' },
        async ($: { session: { append(row: unknown): Promise<void> } }) => {
          await $.session.append(note('one'));
          await $.session.append(note('two'));
          return {};
        },
      );
    });
    const result = await run('writer', writer, ({ test, expect, mock }) => {
      test('rows', async (claude, on) => {
        const $ = claude;
        const session = mock.session(on);
        await $['command']?.['run']?.({ command: 'note', args: '' });
        expect(session.appended()).toEqual([note('one'), note('two')]);
      });
    });
    expect(result.exitCode).toBe(0);
  });
});
