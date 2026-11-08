/**
 * What a command hook's process gets and what the kit reports of its end, beyond the fields of the
 * command hook: hooks.md § Hook handler fields (the working directory and its fallbacks: "If the
 * current directory no longer exists ... Claude Code runs command hooks from the first of these that
 * still exists: the directory the session started in, the project root, your home directory, or
 * the system temp directory", "records a warning naming the fallback directory"), § Common input
 * fields ("A hook process inherits the parent environment, apart from the `OTEL_*` exporter
 * variables that Claude Code removes from every subprocess it spawns"; monitoring-usage.md says the
 * same of hooks), § Exit code output and "Block the action when a hook fails" ("Can't start" is a
 * hook that "fails to start"). No requirement id names these rules, so the tests sit outside
 * `spec(...)`; the judgments are rows in spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import { HANDLERS, runHandler } from '../../../../src/hooks/handlers/index.ts';
import { entry } from '../../../support/hooks-select.ts';
import { pluginCommand, runContext, settingsCommand } from '../../../support/hooks-run.ts';
import type { RunnerReply } from '../../../support/ports.ts';
import { fakeEnvironment, locations, scriptedRunner } from '../../../support/ports.ts';

const where = async (
  directories: readonly string[],
  options: { start?: string; temp?: string } = {},
) => {
  const runner = scriptedRunner({});
  const result = await runHandler(
    settingsCommand({ command: './h.sh' }),
    runContext({
      runner,
      cwd: '/work/app/wt',
      locations: locations({ directories }),
      ...(options.start === undefined ? {} : { startDirectory: options.start }),
      ...(options.temp === undefined ? {} : { tempDirectory: options.temp }),
    }),
  );
  return { cwd: runner.calls[0]?.cwd, issues: result.issues };
};

describe('working directory', () => {
  test('the current directory, when it exists, with no warning', async () => {
    expect(await where(['/work/app/wt', '/work/app'])).toEqual({ cwd: '/work/app/wt', issues: [] });
  });

  test('the directory the session started in, when the current one is gone', async () => {
    const { cwd, issues } = await where(['/start', '/work/app', '/home/user', '/tmp'], {
      start: '/start',
      temp: '/tmp',
    });
    expect(cwd).toBe('/start');
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe('warning');
    expect(issues[0]?.message).toContain('/start');
  });

  test('then the project root', async () => {
    expect(
      (await where(['/work/app', '/home/user', '/tmp'], { start: '/start', temp: '/tmp' })).cwd,
    ).toBe('/work/app');
  });

  test('then the home directory', async () => {
    expect((await where(['/home/user', '/tmp'], { start: '/start', temp: '/tmp' })).cwd).toBe(
      '/home/user',
    );
  });

  test('then the system temp directory', async () => {
    expect((await where(['/tmp'], { start: '/start', temp: '/tmp' })).cwd).toBe('/tmp');
  });

  test('the warning names the fallback directory', async () => {
    const { issues } = await where(['/home/user']);
    expect(issues[0]?.message).toContain('/home/user');
    expect(issues[0]?.message).toContain('/work/app/wt');
  });

  test('judgment: when none exists the process is started in the current directory and the port reports it', async () => {
    expect(await where([])).toEqual({ cwd: '/work/app/wt', issues: [] });
  });
});

const envOf = async (variables: Record<string, string>) => {
  const runner = scriptedRunner({});
  await runHandler(
    settingsCommand({ command: './h.sh' }),
    runContext({ runner, environment: fakeEnvironment(variables) }),
  );
  return runner.calls[0]?.env;
};

describe('environment', () => {
  test('is inherited, apart from the OTEL_* exporter variables', async () => {
    const env = await envOf({
      PATH: '/usr/bin',
      HOME: '/home/user',
      OTEL_EXPORTER_OTLP_ENDPOINT: 'https://otel.test',
      OTEL_METRICS_EXPORTER: 'otlp',
      OTEL_RESOURCE_ATTRIBUTES: 'a=b',
      NOT_OTEL_X: '1',
    });
    expect(env).toEqual({
      PATH: '/usr/bin',
      HOME: '/home/user',
      NOT_OTEL_X: '1',
      CLAUDE_PROJECT_DIR: '/work/app',
    });
  });

  test('the OTEL_ prefix is matched exactly off Windows, where names are case-sensitive', async () => {
    const env = await envOf({ otel_lower: '1', OTEL_UPPER: '2' });
    expect(env).toEqual({ otel_lower: '1', CLAUDE_PROJECT_DIR: '/work/app' });
  });

  test('the OTEL_ prefix is matched in any case on Windows, where names are case-insensitive', async () => {
    const runner = scriptedRunner({});
    await runHandler(
      settingsCommand({ command: './h.sh' }),
      runContext({
        runner,
        windows: true,
        environment: fakeEnvironment({ Otel_Mixed: '1', OTEL_UPPER: '2', Path: 'C:\\Windows' }),
      }),
    );
    expect(runner.calls[0]?.env).toEqual({ Path: 'C:\\Windows', CLAUDE_PROJECT_DIR: '/work/app' });
  });

  test('the exported variables win over an inherited one of the same name', async () => {
    expect((await envOf({ CLAUDE_PROJECT_DIR: '/elsewhere' }))?.['CLAUDE_PROJECT_DIR']).toBe(
      '/work/app',
    );
  });

  test('a plugin option with no value and no default exports nothing', async () => {
    const runner = scriptedRunner({});
    await runHandler(
      pluginCommand({ command: './h.sh' }),
      runContext({
        runner,
        userConfigOf: () => ({
          declared: { api_token: { type: 'string', title: 't', description: 'd' } },
          values: {},
        }),
      }),
    );
    expect(runner.calls[0]?.env).not.toHaveProperty('CLAUDE_PLUGIN_OPTION_API_TOKEN');
  });
});

describe('judgment: a handler of no plugin', () => {
  test('keeps ${CLAUDE_PLUGIN_ROOT}, ${CLAUDE_PLUGIN_DATA} and ${user_config.*} as written', async () => {
    const runner = scriptedRunner({});
    await runHandler(
      settingsCommand({
        command: 'run',
        args: [
          '${CLAUDE_PLUGIN_ROOT}/a',
          '${CLAUDE_PLUGIN_DATA}/b',
          '${user_config.x}',
          '${CLAUDE_PROJECT_DIR}',
        ],
      }),
      runContext({ runner }),
    );
    expect(runner.calls[0]?.spec).toEqual({
      form: 'exec',
      command: 'run',
      args: ['${CLAUDE_PLUGIN_ROOT}/a', '${CLAUDE_PLUGIN_DATA}/b', '${user_config.x}', '/work/app'],
    });
  });

  test('never asks the host for a plugin data folder', async () => {
    const fake = locations();
    await runHandler(
      settingsCommand({ command: 'run ${CLAUDE_PLUGIN_DATA}' }),
      runContext({ runner: scriptedRunner({}), locations: fake }),
    );
    expect(fake.dataCreated).toEqual([]);
  });
});

const report = async (reply: RunnerReply) =>
  (
    await runHandler(
      settingsCommand({ command: './h.sh' }),
      runContext({ runner: scriptedRunner(reply) }),
    )
  ).run;

describe('the run the port reports', () => {
  test('an exit code with its output', async () => {
    expect(await report({ exitCode: 1, stdout: 'o', stderr: 'e' })).toEqual({
      kind: 'exited',
      exitCode: 1,
      stdout: 'o',
      stderr: 'e',
    });
  });

  test('a program that did not start, with the port’s message', async () => {
    expect(await report({ exitCode: null, startError: 'spawn ./h.sh ENOENT' })).toEqual({
      kind: 'not-started',
      message: 'spawn ./h.sh ENOENT',
    });
  });

  test('a process killed by the session (no exit code, no timeout) is cancelled', async () => {
    expect(await report({ exitCode: null })).toEqual({ kind: 'cancelled' });
  });

  test('the process gets the session’s abort signal', async () => {
    const runner = scriptedRunner({});
    const context = runContext({ runner });
    await runHandler(settingsCommand({ command: './h.sh' }), context);
    expect(runner.calls[0]?.signal).toBe(context.signal);
  });

  test('stderr is kept apart from stdout', async () => {
    expect(await report({ exitCode: 1, stdout: 'to stdout', stderr: 'to stderr' })).toEqual({
      kind: 'exited',
      exitCode: 1,
      stdout: 'to stdout',
      stderr: 'to stderr',
    });
  });
});

describe('a runner handed a hook of another type', () => {
  test('reports it as not run instead of reading a shape it does not have', async () => {
    const { run } = await HANDLERS.command(
      entry('Stop', { handler: { type: 'http', url: 'https://x.test' } }),
      runContext({ runner: scriptedRunner() }),
    );
    expect(run).toEqual({ kind: 'skipped', reason: 'The command runner was given a http hook.' });
  });
});
