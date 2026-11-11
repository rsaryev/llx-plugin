/**
 * The environment of every subprocess Claude Code starts, for a host that runs its own Bash,
 * PowerShell, stdio MCP and Monitor processes: env-vars.md `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` ("Bash
 * commands, hooks, and stdio MCP servers"), `CLAUDECODE`, `CLAUDE_CODE_CHILD_SESSION` (Bash,
 * PowerShell, Monitor, hooks, not stdio MCP), `CLAUDE_CODE_SESSION_ID` (Bash, PowerShell, hooks, stdio
 * MCP), `CLAUDE_PID` (Bash, PowerShell, hooks) and `CLAUDE_EFFORT` (Bash, hooks). The rows have no requirement id beyond the hook's
 * (proven in `host-variables.test.ts`), so these tests assert outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import {
  SUBPROCESS_KINDS,
  subprocessEnvironment,
  type SubprocessKind,
} from '../../../../src/hooks/index.ts';
import { scrubEnvironment } from '../../../../src/loading/index.ts';

const HOST = { PATH: '/bin', OTEL_LOGS_EXPORTER: 'otlp', CLAUDE_ENV_FILE: '/launch/env.sh' };

const envOf = (
  kind: SubprocessKind,
  more: Partial<Parameters<typeof subprocessEnvironment>[0]> = {},
) =>
  subprocessEnvironment({
    kind,
    environment: HOST,
    windows: false,
    sessionId: 's-1',
    processId: 4242,
    ...more,
  });

describe('env-vars.md: what Claude Code sets in each kind of subprocess', () => {
  test('CLAUDE_EFFORT is the effort level in hooks and Bash, and absent when no level is given', () => {
    for (const kind of ['hook', 'bash'] as const) {
      expect(envOf(kind, { effort: 'high' })['CLAUDE_EFFORT']).toBe('high');
      expect(envOf(kind)).not.toHaveProperty('CLAUDE_EFFORT');
    }
    for (const kind of ['powershell', 'mcp', 'monitor'] as const) {
      expect(envOf(kind, { effort: 'high' })).not.toHaveProperty('CLAUDE_EFFORT');
    }
  });

  test('CLAUDECODE is 1 in every kind', () => {
    for (const kind of SUBPROCESS_KINDS) expect(envOf(kind)['CLAUDECODE']).toBe('1');
  });

  test('CLAUDE_CODE_CHILD_SESSION is 1 for Bash, PowerShell, Monitor and hooks, and absent for stdio MCP servers', () => {
    for (const kind of ['hook', 'bash', 'powershell', 'monitor'] as const) {
      expect(envOf(kind)['CLAUDE_CODE_CHILD_SESSION']).toBe('1');
    }
    expect(envOf('mcp')).not.toHaveProperty('CLAUDE_CODE_CHILD_SESSION');
  });

  test('CLAUDE_CODE_SESSION_ID is the session id for Bash, PowerShell, hooks and stdio MCP servers', () => {
    for (const kind of ['hook', 'bash', 'powershell', 'mcp'] as const) {
      expect(envOf(kind)['CLAUDE_CODE_SESSION_ID']).toBe('s-1');
    }
    expect(envOf('monitor')).not.toHaveProperty('CLAUDE_CODE_SESSION_ID');
  });

  test('CLAUDE_PID is the process id for Bash, PowerShell and hooks only', () => {
    for (const kind of ['hook', 'bash', 'powershell'] as const) {
      expect(envOf(kind)['CLAUDE_PID']).toBe('4242');
    }
    for (const kind of ['mcp', 'monitor'] as const) {
      expect(envOf(kind)).not.toHaveProperty('CLAUDE_PID');
    }
  });

  test('judgment: no session id or process id given, none is set, and an inherited one stays', () => {
    const bare = envOf('bash', { sessionId: undefined, processId: undefined });
    expect(bare).not.toHaveProperty('CLAUDE_CODE_SESSION_ID');
    expect(bare).not.toHaveProperty('CLAUDE_PID');
    const inherited = envOf('bash', {
      environment: { CLAUDE_PID: '7' },
      sessionId: undefined,
      processId: undefined,
    });
    expect(inherited['CLAUDE_PID']).toBe('7');
  });
});

describe('env-vars.md: what every kind inherits', () => {
  test('the OTEL_* exporter variables are removed, case-insensitively on Windows only', () => {
    for (const kind of SUBPROCESS_KINDS)
      expect(envOf(kind)).not.toHaveProperty('OTEL_LOGS_EXPORTER');
    const lower = { environment: { otel_logs_exporter: 'otlp' } };
    expect(envOf('bash', lower)).toHaveProperty('otel_logs_exporter');
    expect(envOf('bash', { ...lower, windows: true })).not.toHaveProperty('otel_logs_exporter');
  });

  test('the settings env is written over the host environment, and the scrub then sees both', () => {
    const env = envOf('mcp', {
      environment: { PATH: '/bin', A: 'host', CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: '1' },
      settingsEnv: { A: 'settings', DB_PASSWORD: 'hunter2' },
    });
    expect(env).toMatchObject({ PATH: '/bin', A: 'settings' });
    expect(env).not.toHaveProperty('DB_PASSWORD');
  });

  test('the scrub can come from the settings env; unset, the credentials stay', () => {
    const credentialed = { environment: { NPM_TOKEN: 'x' } };
    expect(envOf('bash', credentialed)).toHaveProperty('NPM_TOKEN');
    expect(
      envOf('bash', { ...credentialed, settingsEnv: { CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: '1' } }),
    ).not.toHaveProperty('NPM_TOKEN');
  });

  test('judgment: the CLAUDE_ENV_FILE of the host environment reaches no kind', () => {
    for (const kind of SUBPROCESS_KINDS) expect(envOf(kind)).not.toHaveProperty('CLAUDE_ENV_FILE');
  });

  test('the function reads its input and returns a new object', () => {
    const environment = Object.freeze({ PATH: '/bin' });
    expect(envOf('bash', { environment })).not.toBe(environment);
    expect(environment).toEqual({ PATH: '/bin' });
  });
});

describe('scrubEnvironment is the host-facing scrub', () => {
  test('it removes credentials by name and value and cuts index URL passwords', () => {
    expect(
      scrubEnvironment({
        NPM_TOKEN: 'x',
        DATABASE_URL: 'postgres://a:b@h/db',
        PIP_INDEX_URL: 'https://u:p@h/simple',
        GITHUB_TOKEN: 'ghp_x',
        PATH: '/bin',
        CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: '1',
      }),
    ).toEqual({
      PIP_INDEX_URL: 'https://h/simple',
      GITHUB_TOKEN: 'ghp_x',
      PATH: '/bin',
      CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: '1',
    });
  });
});
