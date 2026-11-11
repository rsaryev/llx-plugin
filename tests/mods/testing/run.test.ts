/**
 * plugins/mods/test.md § Write a test (the first-mod example, the output, the exit status, "declares
 * no test()", files named `.test.ts`), plugins/mods/reference.md § Commands (`claude plugin test
 * [directory]`: every file under the directory whose name ends in `.test.ts` or `.test.tsx`).
 */
import { expect, test } from 'bun:test';
import { registerOf } from '../../support/mods-load.ts';
import { runPluginTests } from '../../support/mods-testing.ts';
import { spec } from '../../support/spec.ts';

type Next = (e: unknown) => Promise<unknown>;

// first-mod/hooks/register.js of create.md, trimmed to the hooks the test of test.md reaches.
let calls = 0;
const firstMod = registerOf((on) => {
  calls = 0;
  on('tool.call', async ($: { ui: { invalidate(name: string): void } }, e: never, next: Next) => {
    calls += 1;
    $.ui.invalidate('ui.render');
    return next(e);
  });
  on('command.run', { command: 'tally' }, async () => ({
    text: 'Claude has made ' + calls + ' tool calls since this mod loaded',
  }));
});

spec('mods.command.claude plugin test [directory]', () => {
  test('runs the test of the first-mod example: two tool calls, then /tally counts both', async () => {
    const run = await runPluginTests({
      name: 'first-mod',
      register: firstMod,
      tests: {
        'tests/first-mod.test.ts': ({ test, expect }) => {
          test('/tally reports the tool calls the mod has seen', async ($, on) => {
            on('tool.call', () => ({ result: 'ok' }));
            await $['tool']?.['call']?.({ tool: 'Bash', command: 'ls' });
            await $['tool']?.['call']?.({ tool: 'Read', file_path: 'README.md' });
            const answer = (await $['command']?.['run']?.({ command: 'tally', args: '' })) as {
              text: string;
            };
            expect(answer.text).toBe('Claude has made 2 tool calls since this mod loaded');
          });
        },
      },
    });
    expect(run.exitCode).toBe(0);
    expect(run.lines).toEqual([
      'tests/first-mod.test.ts:',
      '(pass) /tally reports the tool calls the mod has seen [0ms]',
      '',
      ' 1 pass',
      ' 0 fail',
      'Ran 1 test across 1 file. [0.00s]',
    ]);
  });

  test('exits with status 1 when a test fails, and names the failed check', async () => {
    const run = await runPluginTests({
      name: 'first-mod',
      register: firstMod,
      tests: {
        'tests/first-mod.test.ts': ({ test, expect }) => {
          test('counts none', async ($, on) => {
            on('tool.call', () => ({ result: 'ok' }));
            const answer = (await $['command']?.['run']?.({ command: 'tally', args: '' })) as {
              text: string;
            };
            expect(answer.text).toBe('Claude has made 5 tool calls since this mod loaded');
          });
        },
      },
    });
    expect(run.exitCode).toBe(1);
    expect(run.failed).toBe(1);
    expect(run.lines.some((line) => line.startsWith('(fail) counts none'))).toBe(true);
    expect(run.lines).toContain(' 1 fail');
  });

  test('runs every file under the directory whose name ends in .test.ts or .test.tsx, and no other', async () => {
    const seen: string[] = [];
    const declare = (file: string) => (kit: { test(name: string, body: () => void): void }) => {
      seen.push(file);
      kit.test(file, () => undefined);
    };
    const run = await runPluginTests({
      name: 'first-mod',
      register: firstMod,
      tests: {
        'a.test.ts': declare('a.test.ts'),
        'deep/er/b.test.tsx': declare('deep/er/b.test.tsx'),
      },
      extra: { 'c.test.js': '', 'notes.md': '', 'node_modules/dep/d.test.ts': '' },
    });
    expect(seen).toEqual(['a.test.ts', 'deep/er/b.test.tsx']);
    expect(run.lines.at(-1)).toBe('Ran 2 tests across 2 files. [0.00s]');
  });

  test('a file that declares no test() fails the run with "declares no test(): nothing ran"', async () => {
    const run = await runPluginTests({
      name: 'first-mod',
      register: firstMod,
      tests: { 'tests/empty.test.ts': () => undefined },
    });
    expect(run.exitCode).toBe(1);
    expect(run.lines.join('\n')).toContain('declares no test(): nothing ran');
  });

  test('a stub that returns a bare value for a mods API call is reported as `returned neither { value } nor { deny }`', async () => {
    const reader = registerOf((on) => {
      on(
        'command.run',
        { command: 'read' },
        async ($: { store: { get(k: string): Promise<unknown> } }) => ({
          text: String(await $.store.get('k')),
        }),
      );
    });
    const run = await runPluginTests({
      name: 'reader',
      register: reader,
      tests: {
        'tests/r.test.ts': ({ test, expect }) => {
          test('bare', async ($, on) => {
            on('store.get', () => 7);
            const answer = (await $['command']?.['run']?.({ command: 'read', args: '' })) as {
              text: string;
            };
            expect(answer.text).toBe('7');
          });
        },
      },
    });
    expect(run.exitCode).toBe(1);
    const text = run.lines.join('\n');
    expect(text).toContain('the engine reported:');
    expect(text).toContain('returned neither { value } nor { deny }');
  });

  test('a mod call nobody answers fails with `no implementation for <name>`', async () => {
    const reader = registerOf((on) => {
      on(
        'command.run',
        { command: 'read' },
        async ($: { store: { get(k: string): Promise<unknown> } }) => ({
          text: String(await $.store.get('k')),
        }),
      );
    });
    const run = await runPluginTests({
      name: 'reader',
      register: reader,
      tests: {
        'tests/r.test.ts': ({ test, expect }) => {
          test('missing', async ($, on) => {
            on('command.run', () => ({ text: 'fallback' }));
            const answer = (await $['command']?.['run']?.({ command: 'read', args: '' })) as {
              text: string;
            };
            expect(answer.text).toBe('undefined');
          });
        },
      },
    });
    // test.md: the call rejects and the kit skips the hook; the skip is listed under `the engine
    // reported:` when a later check fails.
    expect(run.exitCode).toBe(1);
    const text = run.lines.join('\n');
    expect(text).toContain('the engine reported:');
    expect(text).toContain('no implementation for store.get');
  });
});

// Declarations 2.1.321 (spec/judgments.md, "claude-code/testing describe"): `describe(name, body)`
// runs its body at once and its name leads the title of each test inside (claude-code/index.d.ts:16667).
test('describe groups tests: its name leads each title inside, nested groups in order', async () => {
  const run = await runPluginTests({
    name: 'first-mod',
    register: firstMod,
    tests: {
      'tests/groups.test.ts': ({ describe, test, expect }) => {
        describe('tally', () => {
          describe('count', () => {
            test('starts at zero', () => expect(0).toBe(0));
          });
        });
        test('stands alone', () => expect(1).toBe(1));
      },
    },
  });
  expect(run.lines.filter((line) => line.startsWith('(pass)'))).toEqual([
    '(pass) tally > count > starts at zero [0ms]',
    '(pass) stands alone [0ms]',
  ]);
});
