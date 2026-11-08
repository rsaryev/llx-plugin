/**
 * What a host session gives its command hooks to run in: the settings files' `env` blocks (env-vars.md
 * § Set variables in settings files, § Precedence), `CLAUDE_PID`, `CLAUDE_ENV_FILE` and the files the
 * host's own shells read (hooks.md § Persist environment variables). Integration of the modules
 * the units prove, over the real host and fakes: outside `spec()`.
 */
import { describe, expect, test } from 'bun:test';
import { createPluginHost } from '../../src/host/index.ts';
import { createPolicyView } from '../../src/settings/index.ts';
import { memoryEnvFiles } from '../support/env-files.ts';
import { SESSION, signal } from '../support/host.ts';
import { fakeEnvironment, locations, scriptedRunner } from '../support/ports.ts';
import { layerOf } from '../support/settings-layers.ts';

const hook = (command = './h.sh') => ({ hooks: [{ type: 'command', command }] });

function hostWith(options: {
  layers: ReturnType<typeof layerOf>[];
  env?: Record<string, string>;
  processId?: number;
  envFiles?: ReturnType<typeof memoryEnvFiles>;
}) {
  const runner = scriptedRunner({}, {}, {});
  const host = createPluginHost({
    plugins: [],
    ports: {
      commands: runner,
      locations: locations(),
      environment: fakeEnvironment(options.env),
    },
    settings: createPolicyView(options.layers),
    ...(options.processId === undefined ? {} : { processId: options.processId }),
    ...(options.envFiles === undefined ? {} : { envFiles: options.envFiles }),
  });
  return { host, runner };
}

const start = { source: 'startup' } as const;

describe('a host session and the environment of its hooks', () => {
  test('the settings env replaces the shell value in the hook process, project values only in a trusted session', async () => {
    const layers = [
      layerOf('user', { env: { A: 'user', B: 'user' }, hooks: { SessionStart: [hook()] } }),
      layerOf('project', { env: { B: 'project', C: 'project' } }),
    ];
    const trusted = hostWith({ layers, env: { A: 'shell', LANG: 'C' } });
    await trusted.host.openSession(SESSION).dispatch('SessionStart', start, { signal: signal() });
    expect(trusted.runner.calls[0]?.env).toMatchObject({
      A: 'user',
      B: 'project',
      C: 'project',
      LANG: 'C',
    });

    // Settings-file hooks do not run in an untrusted session, so what it would give them is read off the session.
    const untrusted = hostWith({ layers, env: { A: 'shell' } });
    const { settings } = untrusted.host.openSession({ ...SESSION, trusted: false }).hookEnvironment;
    expect(settings.values).toEqual({ A: 'user', B: 'user' });
    expect(settings.ignored).toContainEqual({ name: 'C', scope: 'project', reason: 'untrusted' });
  });

  test('the scrub can be turned on by the settings and then applies to what they set', async () => {
    const layers = [
      layerOf('user', {
        env: { CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: '1', DB_PASSWORD: 'x' },
        hooks: { SessionStart: [hook()] },
      }),
    ];
    const { host, runner } = hostWith({ layers, env: { NPM_TOKEN: 'y' } });
    await host.openSession(SESSION).dispatch('SessionStart', start, { signal: signal() });
    expect(runner.calls[0]?.env).not.toHaveProperty('DB_PASSWORD');
    expect(runner.calls[0]?.env).not.toHaveProperty('NPM_TOKEN');
  });

  test('CLAUDE_PID is the process id the host gave, CLAUDE_CODE_SESSION_ID the session of the options', async () => {
    const { host, runner } = hostWith({
      layers: [layerOf('user', { hooks: { SessionStart: [hook()] } })],
      processId: 31337,
    });
    await host.openSession(SESSION).dispatch('SessionStart', start, { signal: signal() });
    expect(runner.calls[0]?.env).toMatchObject({
      CLAUDE_PID: '31337',
      CLAUDE_CODE_SESSION_ID: 'sess-1',
      CLAUDECODE: '1',
    });
  });

  test('a SessionStart hook gets the session file and the session hands the host the scripts and the PowerShell variables', async () => {
    const files = memoryEnvFiles();
    const { host, runner } = hostWith({
      layers: [layerOf('user', { hooks: { SessionStart: [hook()] } })],
      envFiles: files,
      env: { CLAUDE_ENV_FILE: '/home/me/venv.sh' },
    });
    files.texts.set('/home/me/venv.sh', 'export VIRTUAL_ENV=venv\n');
    const session = host.openSession(SESSION);
    await session.dispatch('SessionStart', start, { signal: signal() });
    expect(runner.calls[0]?.env['CLAUDE_ENV_FILE']).toBe('/session/session-env.sh');
    files.texts.set('/session/session-env.sh', 'export NODE_ENV=production\n');
    expect(await session.hookEnvironment.files?.scripts(signal())).toEqual([
      '/home/me/venv.sh',
      '/session/session-env.sh',
      '/session/cwd-env.sh',
    ]);
    const received = await session.hookEnvironment.files?.powershellVariables(
      { windows: false, sandboxed: false },
      signal(),
    );
    expect(received?.variables).toEqual({ VIRTUAL_ENV: 'venv', NODE_ENV: 'production' });
  });

  test('a CwdChanged event through the session clears the directory file', async () => {
    const files = memoryEnvFiles({ '/session/cwd-env.sh': 'export OLD=1\n' });
    const { host } = hostWith({ layers: [], envFiles: files });
    await host
      .openSession(SESSION)
      .dispatch('CwdChanged', { old_cwd: '/a', new_cwd: '/b' }, { signal: signal() });
    expect(files.cleared).toEqual(['cwd']);
  });

  test('the session reports what the settings env ignored, never a value', async () => {
    const { host } = hostWith({
      layers: [layerOf('project', { env: { CLAUDE_CONFIG_DIR: '/evil', OK: '1' } })],
    });
    const { settings } = host.openSession(SESSION).hookEnvironment;
    expect(settings.values).toEqual({ OK: '1' });
    expect(settings.ignored).toEqual([
      { name: 'CLAUDE_CONFIG_DIR', scope: 'project', reason: 'repository' },
    ]);
  });

  test('a host with no env file store gives hooks no CLAUDE_ENV_FILE', async () => {
    const { host, runner } = hostWith({
      layers: [layerOf('user', { hooks: { SessionStart: [hook()] } })],
    });
    const session = host.openSession(SESSION);
    await session.dispatch('SessionStart', start, { signal: signal() });
    expect(runner.calls[0]?.env).not.toHaveProperty('CLAUDE_ENV_FILE');
    expect(session.hookEnvironment.files).toBeUndefined();
  });
});

describe('a host session builds the environment of the processes it starts itself', () => {
  const layers = [layerOf('user', { env: { A: 'settings', API_KEY: 'k' } })];

  test('each kind gets the settings env, the scrub, no OTEL_* variable and its own Claude Code variables', () => {
    const { host } = hostWith({
      layers,
      env: {
        A: 'shell',
        PATH: '/bin',
        OTEL_LOGS_EXPORTER: 'otlp',
        CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: '1',
      },
      processId: 99,
    });
    const session = host.openSession(SESSION);
    const bash = session.subprocessEnvironment('bash');
    expect(bash).toEqual({
      A: 'settings',
      PATH: '/bin',
      CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: '1',
      CLAUDECODE: '1',
      CLAUDE_CODE_CHILD_SESSION: '1',
      CLAUDE_CODE_SESSION_ID: 'sess-1',
      CLAUDE_PID: '99',
    });
    expect(session.subprocessEnvironment('mcp')).toMatchObject({
      CLAUDE_CODE_SESSION_ID: 'sess-1',
    });
    expect(session.subprocessEnvironment('mcp')).not.toHaveProperty('CLAUDE_PID');
    expect(session.subprocessEnvironment('monitor')).not.toHaveProperty('CLAUDE_CODE_SESSION_ID');
  });

  test('without a process id the host gave, CLAUDE_PID is not set; project env waits for trust', () => {
    const project = [layerOf('project', { env: { P: '1' } })];
    const { host } = hostWith({ layers: project });
    expect(host.openSession(SESSION).subprocessEnvironment('hook')).toMatchObject({ P: '1' });
    const untrusted = host.openSession({ ...SESSION, trusted: false });
    expect(untrusted.subprocessEnvironment('hook')).not.toHaveProperty('P');
    expect(untrusted.subprocessEnvironment('hook')).not.toHaveProperty('CLAUDE_PID');
  });
});
