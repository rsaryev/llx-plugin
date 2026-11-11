/** Also plugins/mods/api.md § Reach files, processes, and the network. */
/**
 * `$.process`: run and spawn, the timeout, and the 4 MiB output limits.
 * plugins/mods/api.md § Reach files, processes, and the network ("`$.process.run`: takes an
 * argument list and uses no shell. It resolves to { exitCode, stdout, stderr } whatever the exit
 * code. It rejects if the program can't start or is still running at the timeout, which is 30
 * seconds by default"; the `$.process.spawn started, and a plugin withheld its result:` strings);
 * plugins/mods/reference.md § Limits ("`$.process.run` timeout: 30 seconds by default, 10 minutes
 * at most"; "`stdout` and `stderr`: 4 MiB each. `isStdoutTruncated` or `isStderrTruncated` is
 * `true` when one was cut"); plugins/mods/test.md § Look up what a stub returns (`e.argv` is the
 * argument list and `e.init` holds `cwd` and `timeoutMs`).
 */
import { expect, test } from 'bun:test';
import type { CommandRun } from '../../../src/ports/index.ts';
import { MODS_API } from '../../../src/protocol/mods-api-names.ts';
import { MOD_LIMITS } from '../../../src/protocol/mods-limits.ts';
import { consume, fn, gen } from '../../support/mods-chain.ts';
import { apiHarness, exited, expectMethods, field, streamOf } from '../../support/mods-api.ts';
import { rejection } from '../../support/rejection.ts';
import { spec } from '../../support/spec.ts';

const runner = (result = exited('ok\n'), runs: CommandRun[] = []) => ({
  run: (run: CommandRun) => (runs.push(run), Promise.resolve(result)),
});

const spawnerOf = (stopped: { value: boolean }) => ({
  spawn: async function* () {
    try {
      yield { stream: 'stdout', text: 'first' } as const;
      yield { stream: 'stdout', text: 'second' } as const;
      return { exitCode: 0 };
    } finally {
      stopped.value = true;
    }
  },
});

spec(
  [
    'mods.api.$.process',
    'mods.apiGuide.Reach files, processes, and the network',
    'mods.apiGuide.Reach files, processes, and the network.$.process',
    'mods.apiGuide.Reach files, processes, and the network.$.process.run',
  ],
  () => {
    test('$.process has run and spawn', async () => {
      const { api } = await apiHarness();
      expectMethods(api.process, MODS_API.process);
    });

    test('run starts the program with its arguments and no shell, in the working directory', async () => {
      const runs: CommandRun[] = [];
      const h = await apiHarness({ ports: { runner: runner(exited('main\n'), runs) } });
      const out = await h.api.process.run(['git', 'branch', '--show-current']);
      expect(out).toEqual({
        exitCode: 0,
        stdout: 'main\n',
        stderr: '',
        isStdoutTruncated: false,
        isStderrTruncated: false,
      });
      expect(runs[0]?.spec).toEqual({
        form: 'exec',
        command: 'git',
        args: ['branch', '--show-current'],
      });
      expect(runs[0]?.cwd).toBe('/work');
      expect(runs[0]?.timeoutMs).toBe(MOD_LIMITS.runTimeoutMs);
    });

    test('a non-zero exit code still resolves', async () => {
      const h = await apiHarness({ ports: { runner: runner(exited('', 'fatal', 128)) } });
      expect(await h.api.process.run(['git', 'status'])).toMatchObject({
        exitCode: 128,
        stderr: 'fatal',
      });
    });

    test('the event holds e.argv and e.init with cwd and timeoutMs; a stub answers with { value }', async () => {
      const seen: unknown[] = [];
      const h = await apiHarness();
      await h.mod('stub', 'prepend', [
        fn(
          'process.run',
          (_$, e) => (seen.push(e), { value: { exitCode: 0, stdout: 'stubbed', stderr: '' } }),
        ),
      ]);
      await h.api.process.run(['ls'], { cwd: '/tmp', timeoutMs: 5000 });
      expect(seen).toEqual([{ argv: ['ls'], init: { cwd: '/tmp', timeoutMs: 5000 } }]);
    });

    test('it rejects when the program cannot start', async () => {
      const h = await apiHarness({
        ports: { runner: runner({ ...exited(), exitCode: null, startError: 'ENOENT' }) },
      });
      expect(await rejection(h.api.process.run(['nope']))).toContain('nope: ENOENT');
    });

    test('it rejects when the program is still running at the timeout', async () => {
      const h = await apiHarness({
        ports: { runner: runner({ ...exited(), exitCode: null, timedOut: true }) },
      });
      expect(await rejection(h.api.process.run(['sleep', '99']))).toContain(
        'still running after 30000 ms',
      );
    });

    test('an argument list that is not strings rejects', async () => {
      const h = await apiHarness({ ports: { runner: runner() } });
      expect(await rejection(h.api.process.run('git status'))).toContain('$.process.run');
      expect(await rejection(h.api.process.run([]))).toContain('$.process.run');
    });

    test('spawn streams the output the port produced', async () => {
      const spawner = {
        spawn: async function* () {
          yield { stream: 'stdout', text: 'one' } as const;
          yield { stream: 'stdout', text: 'two' } as const;
          return { exitCode: 0 };
        },
      };
      const h = await apiHarness({ ports: { spawner } });
      const out = await consume(streamOf(h.api.process.spawn({ argv: ['tail', '-f', 'log'] })));
      expect(out.chunks).toEqual([
        { stream: 'stdout', text: 'one' },
        { stream: 'stdout', text: 'two' },
      ]);
      expect(out.result).toEqual({ code: 0, signal: null });
    });

    test('a hook on process.spawn that returns next(e) unchanged leaves the output and the result as they are', async () => {
      const spawner = {
        spawn: async function* () {
          yield { stream: 'stdout', text: 'one' } as const;
          return { exitCode: 3 };
        },
      };
      const h = await apiHarness({ ports: { spawner } });
      await h.mod('observer', 'prepend', [
        gen('process.spawn', async function* (_$, e, next) {
          return yield* next(e);
        }),
      ]);
      const out = await consume(streamOf(h.api.process.spawn({ argv: ['tail', '-f', 'log'] })));
      expect(out.chunks).toEqual([{ stream: 'stdout', text: 'one' }]);
      expect(out.result).toEqual({ code: 3, signal: null });
      expect(h.reports).toEqual([]);
    });

    test('a hook on process.spawn can rewrite a chunk it forwards', async () => {
      const spawner = {
        spawn: async function* () {
          yield { stream: 'stdout', text: 'token=abc' } as const;
          return { exitCode: 0 };
        },
      };
      const h = await apiHarness({ ports: { spawner } });
      await h.mod('redactor', 'prepend', [
        gen('process.spawn', async function* (_$, e, next) {
          const stream = next(e);
          for (let step = await stream.next(); ; step = await stream.next()) {
            if (step.done) return step.value;
            yield { stream: 'stdout', text: 'token=***' };
          }
        }),
      ]);
      const out = await consume(streamOf(h.api.process.spawn({ argv: ['env'] })));
      expect(out.chunks).toEqual([{ stream: 'stdout', text: 'token=***' }]);
      expect(out.result).toEqual({ code: 0, signal: null });
      expect(h.reports).toEqual([]);
    });

    test('a mod that refuses after reading the output to the end: "ran, and a plugin withheld its result:"', async () => {
      const h = await apiHarness({ ports: { spawner: spawnerOf({ value: false }) } });
      await h.mod('guard', 'prepend', [
        gen('process.spawn', async function* (_$, e, next) {
          yield* next(e);
          return { deny: 'secret output' };
        }),
      ]);
      expect(
        await rejection(consume(streamOf(h.api.process.spawn({ argv: ['cat', 'x'] })))),
      ).toMatch(/\$\.process\.spawn ran, and a plugin withheld its result: secret output$/);
    });

    test('a mod that refuses before reading it to the end: "started, and ...", and the command is stopped', async () => {
      const stopped = { value: false };
      const h = await apiHarness({ ports: { spawner: spawnerOf(stopped) } });
      await h.mod('guard', 'prepend', [
        gen('process.spawn', async function* (_$, e, next) {
          const first = await next(e).next();
          if (!first.done) yield first.value;
          return { deny: 'too noisy' };
        }),
      ]);
      expect(await rejection(consume(streamOf(h.api.process.spawn({ argv: ['yes'] }))))).toMatch(
        /\$\.process\.spawn started, and a plugin withheld its result: too noisy$/,
      );
      expect(stopped.value).toBe(true);
    });
  },
);

spec('mods.limit.$.process.run', () => {
  test('the timeout is 30 seconds by default and what the call sets otherwise', async () => {
    const runs: CommandRun[] = [];
    const h = await apiHarness({ ports: { runner: runner(exited(), runs) } });
    await h.api.process.run(['a']);
    await h.api.process.run(['b'], { timeoutMs: 1000 });
    expect(runs.map((run) => run.timeoutMs)).toEqual([30_000, 1000]);
  });

  test('a timeout of exactly 10 minutes is used as given', async () => {
    const runs: CommandRun[] = [];
    const h = await apiHarness({ ports: { runner: runner(exited(), runs) } });
    await h.api.process.run(['a'], { timeoutMs: MOD_LIMITS.runTimeoutMaxMs });
    expect(runs.map((run) => run.timeoutMs)).toEqual([600_000]);
  });

  test('a timeout over 10 minutes never reaches the program as more than 10 minutes', async () => {
    const runs: CommandRun[] = [];
    const h = await apiHarness({ ports: { runner: runner(exited(), runs) } });
    // Whether the call is cut or refused is the kit's judgment (judgments.test.ts); the limit holds either way.
    await h.api.process.run(['a'], { timeoutMs: 3_600_000 }).catch(() => undefined);
    expect(runs.every((run) => (run.timeoutMs ?? 0) <= MOD_LIMITS.runTimeoutMaxMs)).toBe(true);
  });
});

spec(['mods.limit.stdout', 'mods.limit.stderr'], () => {
  const four = MOD_LIMITS.outputBytes;

  test('4 MiB of stdout is kept whole and not flagged', async () => {
    const h = await apiHarness({ ports: { runner: runner(exited('x'.repeat(four))) } });
    expect(await h.api.process.run(['a'])).toMatchObject({ isStdoutTruncated: false });
  });

  test('stdout over 4 MiB is cut to 4 MiB and isStdoutTruncated is true', async () => {
    const h = await apiHarness({ ports: { runner: runner(exited('x'.repeat(four + 5))) } });
    const out = await h.api.process.run(['a']);
    expect(out).toMatchObject({ isStdoutTruncated: true, isStderrTruncated: false });
    expect(field(out, 'stdout')).toHaveLength(four);
  });

  test('stderr is limited on its own: isStderrTruncated is true, stdout is untouched', async () => {
    const h = await apiHarness({ ports: { runner: runner(exited('ok', 'e'.repeat(four + 1))) } });
    const out = await h.api.process.run(['a']);
    expect(out).toMatchObject({ stdout: 'ok', isStdoutTruncated: false, isStderrTruncated: true });
    expect(field(out, 'stderr')).toHaveLength(four);
  });

  test('the cut counts bytes and never leaves half a character', async () => {
    const h = await apiHarness({ ports: { runner: runner(exited('é'.repeat(four / 2 + 3))) } });
    const out = await h.api.process.run(['a']);
    const text = String(field(out, 'stdout'));
    expect(new TextEncoder().encode(text).length).toBeLessThanOrEqual(four);
    expect(text).not.toContain('�');
    expect(out).toMatchObject({ isStdoutTruncated: true });
  });
});
