/**
 * `CLAUDE_ENV_FILE`: env-vars.md (the variable's row: a script "Claude Code runs before each Bash
 * command"; PowerShell commands "receive its variables too"; "populated dynamically by SessionStart,
 * Setup, CwdChanged, and FileChanged hooks") and hooks.md § Persist environment variables (the four
 * events, "until the next CwdChanged event, when Claude Code clears them", "Other hook events don't
 * have access to this variable, and neither does a hook that runs in PowerShell"), § Persisted
 * variables in PowerShell commands (the line grammar, the debug message, Windows paths, sandbox).
 */
import { describe, expect, test } from 'bun:test';
import {
  createEnvFiles,
  createHookEngine,
  createHookRegistry,
  envFileKindOf,
} from '../../../src/hooks/index.ts';
import { HOOK_EVENTS } from '../../../src/protocol/hook-events.ts';
import type { HookEvent } from '../../../src/protocol/official.ts';
import { ENV_SESSION, memoryEnvFiles } from '../../support/env-files.ts';
import { cmd } from '../../support/hooks-fire.ts';
import { pluginCommand, runContext, settingsCommand } from '../../support/hooks-run.ts';
import { entry, FACTS, session } from '../../support/hooks-select.ts';
import { fakeOutput } from '../../support/hooks-verdict.ts';
import { runHandler } from '../../../src/hooks/index.ts';
import { fakeEnvironment, locations, scriptedRunner } from '../../support/ports.ts';
import { spec } from '../../support/spec.ts';

const signal = new AbortController().signal;

/** The `CLAUDE_ENV_FILE` a hook of `event` receives, from the hook's own environment. */
async function envFileOf(
  event: HookEvent,
  hook: Parameters<typeof settingsCommand>[0] = { command: './h.sh' },
  defaultShell: 'bash' | 'powershell' = 'bash',
) {
  const runner = scriptedRunner({});
  const files = createEnvFiles(memoryEnvFiles(), { sessionId: ENV_SESSION });
  await runHandler(
    settingsCommand(hook, event),
    runContext({ runner, envFiles: files, defaultShell }),
  );
  return runner.calls[0]?.env['CLAUDE_ENV_FILE'];
}

spec('environment.host.CLAUDE_ENV_FILE', () => {
  describe('which hooks get it', () => {
    test('SessionStart and Setup hooks get the file that lasts the session; CwdChanged and FileChanged hooks the one cleared on each CwdChanged', async () => {
      expect(await envFileOf('SessionStart')).toBe('/session/sess-1/session-env.sh');
      expect(await envFileOf('Setup')).toBe('/session/sess-1/session-env.sh');
      expect(await envFileOf('CwdChanged')).toBe('/session/sess-1/cwd-env.sh');
      expect(await envFileOf('FileChanged')).toBe('/session/sess-1/cwd-env.sh');
    });

    test('no other event has it', async () => {
      const others = HOOK_EVENTS.filter((event) => envFileKindOf(event) === undefined);
      expect(others).toHaveLength(HOOK_EVENTS.length - 4);
      for (const event of others) expect(await envFileOf(event)).toBeUndefined();
    });

    test('a variable inherited from the launch environment does not reach hooks of the other events', async () => {
      const runner = scriptedRunner({});
      await runHandler(
        settingsCommand({ command: './h.sh' }, 'PostToolUse'),
        runContext({
          runner,
          envFiles: createEnvFiles(memoryEnvFiles(), { sessionId: ENV_SESSION }),
          environment: fakeEnvironment({ CLAUDE_ENV_FILE: '/launch/env.sh' }),
        }),
      );
      expect(runner.calls[0]?.env).not.toHaveProperty('CLAUDE_ENV_FILE');
    });

    test('a hook that runs in PowerShell does not get it: by "shell": "powershell", or by default without Git Bash', async () => {
      expect(
        await envFileOf('SessionStart', {
          command: 'Write-Host x',
          shell: 'powershell',
        }),
      ).toBeUndefined();
      expect(
        await envFileOf('SessionStart', { command: 'Write-Host x' }, 'powershell'),
      ).toBeUndefined();
      expect(
        await envFileOf('SessionStart', { command: './h.sh', shell: 'bash' }, 'powershell'),
      ).toBe('/session/sess-1/session-env.sh');
    });

    test('a plugin hook gets it the same as a settings hook', async () => {
      const runner = scriptedRunner({});
      await runHandler(
        pluginCommand({ command: './h.sh' }, 'SessionStart'),
        runContext({
          runner,
          envFiles: createEnvFiles(memoryEnvFiles(), { sessionId: ENV_SESSION }),
        }),
      );
      expect(runner.calls[0]?.env['CLAUDE_ENV_FILE']).toBe('/session/sess-1/session-env.sh');
    });

    test('with no files given by the host there is none, and an inherited one is not passed on as the hook file', async () => {
      const runner = scriptedRunner({});
      await runHandler(
        settingsCommand({ command: './h.sh' }, 'SessionStart'),
        runContext({
          runner,
          environment: fakeEnvironment({ CLAUDE_ENV_FILE: '/launch/env.sh' }),
        }),
      );
      expect(runner.calls[0]?.env).not.toHaveProperty('CLAUDE_ENV_FILE');
    });
  });

  describe('the two files and their lifetimes', () => {
    test('a CwdChanged event clears the file of CwdChanged and FileChanged hooks, and only that one', async () => {
      const store = memoryEnvFiles({
        '/session/sess-1/session-env.sh': 'export A=1\n',
        '/session/sess-1/cwd-env.sh': 'export B=2\n',
      });
      const files = createEnvFiles(store, { sessionId: ENV_SESSION });
      await files.beforeEvent('CwdChanged', signal);
      expect(store.cleared).toEqual(['sess-1/cwd']);
      expect(store.texts.get('/session/sess-1/session-env.sh')).toBe('export A=1\n');
      expect(store.texts.get('/session/sess-1/cwd-env.sh')).toBe('');
    });

    test('no other event clears anything: SessionStart, Setup and FileChanged leave what was written', async () => {
      const store = memoryEnvFiles();
      const files = createEnvFiles(store, { sessionId: ENV_SESSION });
      for (const event of HOOK_EVENTS.filter((each) => each !== 'CwdChanged')) {
        await files.beforeEvent(event, signal);
      }
      expect(store.cleared).toEqual([]);
    });

    test('the engine clears at a CwdChanged event even when no hook handles it, then the hooks write', async () => {
      const store = memoryEnvFiles({
        '/session/sess-1/cwd-env.sh': 'export STALE=1\n',
      });
      const runner = scriptedRunner(({ env }) => {
        // What the hook does: appends to the file named in its environment.
        const path = env['CLAUDE_ENV_FILE'] ?? '';
        store.texts.set(path, `${store.texts.get(path) ?? ''}export FRESH=1\n`);
        return {};
      });
      const engine = createHookEngine(
        {
          commands: runner,
          locations: locations(),
          environment: fakeEnvironment(),
        },
        { output: fakeOutput, envFiles: createEnvFiles(store, { sessionId: ENV_SESSION }) },
      );
      const dispatch = (registryEntries: ReturnType<typeof entry>[] = []) =>
        engine.dispatch(createHookRegistry(registryEntries), {
          event: 'CwdChanged',
          facts: FACTS.CwdChanged,
          session: session(),
          signal,
        });
      await dispatch();
      expect(store.texts.get('/session/sess-1/cwd-env.sh')).toBe('');
      await dispatch([entry('CwdChanged', { handler: cmd() })]);
      expect(store.texts.get('/session/sess-1/cwd-env.sh')).toBe('export FRESH=1\n');
      expect(runner.calls).toHaveLength(1);
    });

    test('a Bash command runs the session file, then the file of the directory; a script named at launch comes first', async () => {
      const files = createEnvFiles(memoryEnvFiles(), {
        sessionId: ENV_SESSION,
        launchScript: '/home/me/venv.sh',
      });
      expect(await files.scripts(signal)).toEqual([
        '/home/me/venv.sh',
        '/session/sess-1/session-env.sh',
        '/session/sess-1/cwd-env.sh',
      ]);
      expect(
        await createEnvFiles(memoryEnvFiles(), { sessionId: ENV_SESSION }).scripts(signal),
      ).toEqual(['/session/sess-1/session-env.sh', '/session/sess-1/cwd-env.sh']);
    });
  });
});

describe('judgment: a hook in exec form', () => {
  test('runs no shell, so it gets CLAUDE_ENV_FILE even when the host default shell is PowerShell', async () => {
    expect(await envFileOf('SessionStart', { command: 'tool', args: [] }, 'powershell')).toBe(
      '/session/sess-1/session-env.sh',
    );
  });
});

describe('judgment: one store, many sessions', () => {
  test('every call to the store names the session, so two sessions get two files and clear only their own', async () => {
    const store = memoryEnvFiles();
    const first = createEnvFiles(store, { sessionId: 'a' });
    const second = createEnvFiles(store, { sessionId: 'b' });
    expect(await first.pathFor('SessionStart', 'bash', signal)).toBe('/session/a/session-env.sh');
    expect(await second.pathFor('SessionStart', 'bash', signal)).toBe('/session/b/session-env.sh');
    expect(await second.scripts(signal)).toEqual([
      '/session/b/session-env.sh',
      '/session/b/cwd-env.sh',
    ]);
    await first.beforeEvent('CwdChanged', signal);
    expect(store.cleared).toEqual(['a/cwd']);
  });
});
