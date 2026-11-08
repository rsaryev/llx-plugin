/**
 * plugins/mods/reference.md § Limits (one `claude plugin test` test: 5 seconds unless the test sets
 * `timeoutMs`), plugins/mods/test.md § Write a test (hooks modules turned off), plugins/mods/
 * troubleshoot.md § Check whether mods can load (the messages of `claude plugin test` in a directory
 * that holds no mod).
 */
import { expect, test } from 'bun:test';
import { MOD_LIMITS } from '../../../src/protocol/mods-limits.ts';
import type { RegisterFunction } from '../../../src/testing/mods/index.ts';
import { fixedClock } from '../../support/clock.ts';
import { policy } from '../../support/mods-load.ts';
import { runPluginTests, type TestFile } from '../../support/mods-testing.ts';
import { spec } from '../../support/spec.ts';

const idle = ((on: (name: string, ...rest: unknown[]) => void) => {
  on('command.run', { command: 'idle' }, async () => ({}));
}) as RegisterFunction;

/** A test that has been running for `ms` of the runner's clock and never finishes. */
const stuckFor =
  (
    clock: ReturnType<typeof fixedClock>,
    ms: number,
    options: { timeoutMs?: number } = {},
  ): TestFile =>
  ({ test }) => {
    test('stuck', options, () => {
      clock.advance(ms);
      return new Promise<void>(() => undefined);
    });
  };

/** A test that runs `ms` of the runner's clock and then finishes. */
const busyFor =
  (
    clock: ReturnType<typeof fixedClock>,
    ms: number,
    options: { timeoutMs?: number } = {},
  ): TestFile =>
  ({ test }) => {
    test('busy', options, () => {
      clock.advance(ms);
    });
  };

const outcome = (file: TestFile, clock: ReturnType<typeof fixedClock>) =>
  runPluginTests({ name: 'idle', register: idle, clock, tests: { 'tests/t.test.ts': file } });

spec('mods.limit.claude plugin test', () => {
  test('the limit is 5 seconds', () => {
    expect(MOD_LIMITS.testMs).toBe(5000);
  });

  test('a test that runs past 5 seconds fails with a timeout, one that stops before it passes', async () => {
    const clock = fixedClock();
    const slow = await outcome(stuckFor(clock, 5000), clock);
    expect(slow.exitCode).toBe(1);
    expect(slow.lines.join('\n')).toContain('this test timed out after 5000ms');
    const clockTwo = fixedClock();
    const quick = await outcome(busyFor(clockTwo, 4999), clockTwo);
    expect(quick.exitCode).toBe(0);
  });

  test('timeoutMs of the test replaces the 5 seconds, longer or shorter', async () => {
    const shortClock = fixedClock();
    const shorter = await outcome(stuckFor(shortClock, 100, { timeoutMs: 100 }), shortClock);
    expect(shorter.lines.join('\n')).toContain('this test timed out after 100ms');
    const longClock = fixedClock();
    const longer = await outcome(busyFor(longClock, 9000, { timeoutMs: 10_000 }), longClock);
    expect(longer.exitCode).toBe(0);
  });

  test('the limit holds for one test, not the whole run: two tests of 4 seconds each pass', async () => {
    const clock = fixedClock();
    const run = await outcome(({ test }) => {
      test('first', () => {
        clock.advance(4000);
      });
      test('second', () => {
        clock.advance(4000);
      });
    }, clock);
    expect(run.exitCode).toBe(0);
    expect(run.passed).toBe(2);
  });
});

spec('mods.command.claude plugin test [directory]', () => {
  test('in a directory that holds no mod it prints `no hooks module to load` and exits with 0', async () => {
    const run = await runPluginTests({ name: 'empty', tests: {} });
    expect(run.lines.join('\n')).toContain('no hooks module to load');
    expect(run.exitCode).toBe(0);
  });

  test('disableAllHooks in your own settings or your organization`s policy: `hooks modules are turned off here`, exit 1', async () => {
    const own = await runPluginTests({
      name: 'empty',
      tests: {},
      policy: policy({ user: { disableAllHooks: true } }),
    });
    expect(own.lines[0]).toBe(
      'claude plugin test: hooks modules are turned off here: disableAllHooks in your settings',
    );
    expect(own.exitCode).toBe(1);
    const managed = await runPluginTests({
      name: 'empty',
      register: idle,
      tests: { 'tests/t.test.ts': ({ test }) => test('x', () => undefined) },
      policy: policy({ managed: { disableAllHooks: true } }),
    });
    expect(managed.lines[0]).toContain('claude plugin test: hooks modules are turned off here');
    expect(managed.exitCode).toBe(1);
  });

  test('the rollout switch turned off, served or saved: `hooks modules are turned off in this process`', async () => {
    const served = await runPluginTests({
      name: 'empty',
      tests: {},
      policy: policy({ rollout: 'served-off' }),
    });
    expect(served.lines).toEqual([
      'claude plugin test: hooks modules are turned off in this process: the rollout switch served off',
    ]);
    const saved = await runPluginTests({
      name: 'empty',
      tests: {},
      policy: policy({ rollout: 'saved-off' }),
    });
    expect(saved.lines[0]).toContain(
      'hooks modules are turned off in this process: the rollout switch was saved off by an earlier session',
    );
    expect(saved.exitCode).toBe(1);
  });

  test('allowManagedModsOnly is not reported: the command still runs the tests', async () => {
    const run = await runPluginTests({
      name: 'empty',
      tests: {},
      policy: policy({
        managed: {
          pluginConfigs: {
            'cc-plugin-sec-default@builtin': { options: { allowManagedModsOnly: true } },
          },
        },
      }),
    });
    expect(run.lines.join('\n')).toContain('no hooks module to load');
  });
});
