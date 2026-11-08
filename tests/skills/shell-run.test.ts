/**
 * skills.md § Inject dynamic context: "How injected commands run" (the tool, stderr, the 2-minute
 * timeout), "When an injected command fails" (any non-zero exit aborts; exit 1 of search and
 * comparison commands is a result), "Permission checks on injected commands" (deny aborts, so does
 * anything but allow outside auto mode); tools-reference.md § Output limits (the commands whose
 * exit 1 is valid; the PowerShell list differs); errors.md § No shell command in a skill or command
 * was run (control characters).
 */
import { describe, expect, test } from 'bun:test';
import type { PermissionBehavior, PermissionMode } from '../../src/protocol/official.ts';
import { runInjections, type InjectionContext } from '../../src/skills/shell-run.ts';
import { scriptedRunner } from '../support/ports.ts';
import { base, failure, plan, run } from '../support/shell-run.ts';

const timeoutMessage = async (env: Record<string, string>): Promise<string> =>
  failure((await run(['x'], [{ exitCode: null, timedOut: true }], { context: { env } })).result);

describe('how a command runs', () => {
  test('through the runner as one shell line, in the working directory, with the session environment', async () => {
    const { runner } = await run(['gh pr diff'], [{ stdout: 'diff' }]);
    expect(runner.calls[0]).toMatchObject({
      spec: { form: 'shell', command: 'gh pr diff', shell: 'bash' },
      cwd: '/work/app',
      env: { PATH: '/bin' },
      signal: base.signal,
    });
  });

  test('"each command runs under the Bash tool\'s default 2-minute timeout"', async () => {
    const { runner } = await run(['sleep 1'], [{}]);
    expect(runner.calls[0]?.timeoutMs).toBe(120_000);
  });

  test('the default timeout is `BASH_DEFAULT_TIMEOUT_MS` (tools-reference.md, "Timeout and output limits"), in the Bash and the PowerShell tool', async () => {
    for (const shell of ['bash', 'powershell'] as const) {
      const { runner } = await run(['sleep 1'], [{}], {
        context: { shell, env: { BASH_DEFAULT_TIMEOUT_MS: '300000' } },
      });
      expect(runner.calls[0]?.timeoutMs).toBe(300_000);
    }
  });

  test('judgment: a value that is not a positive whole number of milliseconds is ignored; `BASH_MAX_TIMEOUT_MS` is not read', async () => {
    for (const value of ['', '0', '-5', '1.5', 'soon', '1e5', '99999999999999999999']) {
      const { runner } = await run(['sleep 1'], [{}], {
        context: { env: { BASH_DEFAULT_TIMEOUT_MS: value, BASH_MAX_TIMEOUT_MS: '60000' } },
      });
      expect(runner.calls[0]?.timeoutMs).toBe(120_000);
    }
  });

  test('"with the default bash shell, Claude Code merges stderr into stdout"', async () => {
    const { runner } = await run(['make'], [{ stdout: 'ok' }]);
    expect(runner.calls[0]?.mergeStderr).toBe(true);
  });

  test('the PowerShell tool is not documented to merge stderr', async () => {
    const { runner } = await run(['Get-Date'], [{}], { context: { shell: 'powershell' } });
    expect(runner.calls[0]).toMatchObject({
      spec: { shell: 'powershell' },
      mergeStderr: false,
    });
  });

  test("judgment: the PowerShell tool's stderr is not injected on success", async () => {
    const { result } = await run(['Get-Item x'], [{ stdout: 'out', stderr: 'warn' }], {
      context: { shell: 'powershell' },
    });
    expect(result).toEqual({ ok: true, outputs: ['out'] });
  });

  test('the output replaces the placeholder, in order, one run per command', async () => {
    const { result, runner } = await run(['a', 'b'], [{ stdout: 'first\n' }, { stdout: 'second' }]);
    expect(result).toEqual({ ok: true, outputs: ['first', 'second'] });
    expect(runner.calls.map((call) => call.spec)).toMatchObject([
      { command: 'a' },
      { command: 'b' },
    ]);
  });

  test('a command with no output is replaced by nothing', async () => {
    const { result } = await run(['true'], [{}]);
    expect(result).toEqual({ ok: true, outputs: [''] });
  });

  test('the output is plain text: nothing in it is run', async () => {
    const { result, runner } = await run(['gen'], [{ stdout: '!`rm -rf /`' }]);
    expect(result).toEqual({ ok: true, outputs: ['!`rm -rf /`'] });
    expect(runner.calls).toHaveLength(1);
  });
});

describe('when an injected command fails', () => {
  test('"Shell command failed for pattern" with the command\'s output; the rest never run', async () => {
    const { result, runner } = await run(
      ['npm test', 'echo after'],
      [{ exitCode: 3, stdout: 'boom' }, { stdout: 'never' }],
    );
    expect(failure(result)).toBe('Shell command failed for pattern "!`npm test`": boom');
    expect(runner.calls).toHaveLength(1);
  });

  test('the failure is an error issue, not a throw', async () => {
    const { result } = await run(['false'], [{ exitCode: 1 }]);
    expect(result).toMatchObject({ ok: false, issue: { severity: 'error', path: '/pr-summary' } });
  });

  test('a command that timed out fails', async () => {
    const { result } = await run(
      ['sleep 999'],
      [{ exitCode: null, timedOut: true, stdout: 'part' }],
    );
    expect(failure(result)).toContain('Shell command failed for pattern "!`sleep 999`"');
    expect(failure(result)).toContain('timed out');
  });

  test('a timeout names the limit in force', async () => {
    expect(await timeoutMessage({})).toContain('timed out after 2 minutes');
    expect(await timeoutMessage({ BASH_DEFAULT_TIMEOUT_MS: '600000' })).toContain(
      'after 10 minutes',
    );
    expect(await timeoutMessage({ BASH_DEFAULT_TIMEOUT_MS: '90000' })).toContain(
      'after 90 seconds',
    );
  });

  test('a command that could not start fails with the reason', async () => {
    const { result } = await run(['nope'], [{ exitCode: null, startError: 'no such shell' }]);
    expect(failure(result)).toContain('no such shell');
  });

  test('a killed command (no exit code) fails', async () => {
    const { result } = await run(['x'], [{ exitCode: null }]);
    expect(failure(result)).toContain('Shell command failed for pattern');
  });

  test('stderr is part of the message when the shell did not merge it', async () => {
    const { result } = await run(['Get-Item x'], [{ exitCode: 1, stderr: 'not found' }], {
      context: { shell: 'powershell' },
    });
    expect(failure(result)).toContain('not found');
  });
});

describe('permission checks on injected commands', () => {
  test("each command is checked first, with its tool, the command and the skill's grants", async () => {
    const { asked, runner } = await run(['gh pr diff'], [{}], {
      context: { grants: ['Bash(gh *)'] },
    });
    expect(asked).toEqual([{ tool: 'Bash', command: 'gh pr diff', grants: ['Bash(gh *)'] }]);
    expect(runner.calls).toHaveLength(1);
  });

  test('the PowerShell tool is the tool of a PowerShell skill', async () => {
    const { asked } = await run(['Get-Date'], [{}], { context: { shell: 'powershell' } });
    expect(asked[0]?.tool).toBe('PowerShell');
  });

  test('"A command a deny rule matches aborts the invocation with `Shell command permission check failed for pattern`"', async () => {
    const { result, runner } = await run(['rm -rf x'], [], { behavior: 'deny' });
    expect(failure(result)).toBe('Shell command permission check failed for pattern "!`rm -rf x`"');
    expect(runner.calls).toHaveLength(0);
  });

  test('"outside auto mode, anything other than allow aborts ... including a rule that would ask"', async () => {
    for (const mode of [
      undefined,
      'default',
      'acceptEdits',
      'plan',
      'dontAsk',
      'bypassPermissions',
    ] as const) {
      const { result, runner } = await run(['make'], [], { behavior: 'ask', context: { mode } });
      expect(failure(result)).toContain('Shell command permission check failed for pattern');
      expect(runner.calls).toHaveLength(0);
    }
  });

  test('the check runs for every command and stops at the first refusal', async () => {
    const runner = scriptedRunner({ stdout: 'a' });
    const behaviors: PermissionBehavior[] = ['allow', 'deny'];
    const result = await runInjections([plan('one'), plan('two'), plan('three')], base, {
      runner,
      permissions: () => behaviors.shift() ?? 'allow',
    });
    expect(failure(result)).toContain('"!`two`"');
    expect(runner.calls).toHaveLength(1);
  });

  test('the host may answer asynchronously', async () => {
    const runner = scriptedRunner({ stdout: 'x' });
    const result = await runInjections([plan('ls')], base, {
      runner,
      permissions: () => Promise.resolve('allow'),
    });
    expect(result).toEqual({ ok: true, outputs: ['x'] });
  });
});

describe('in auto mode', () => {
  const auto: Partial<InjectionContext> = { mode: 'auto' satisfies PermissionMode };

  test('"a command that would otherwise need your approval doesn\'t abort": an instruction to run it first', async () => {
    const { result, runner } = await run(['make build'], [], { behavior: 'ask', context: auto });
    expect(runner.calls).toHaveLength(0);
    if (!result.ok) throw new Error('expected success');
    expect(result.outputs[0]).toContain('make build');
    expect(result.outputs[0]).toMatch(/run .* first/i);
  });

  test('a deny rule still aborts', async () => {
    const { result } = await run(['rm x'], [], { behavior: 'deny', context: auto });
    expect(failure(result)).toContain('Shell command permission check failed');
  });

  test('"The invocation still aborts in a forked skill that sets `agent`"', async () => {
    const { result } = await run(['make'], [], {
      behavior: 'ask',
      context: { ...auto, forkedWithAgent: true },
    });
    expect(failure(result)).toContain('Shell command permission check failed');
  });

  test('an allowed command runs as usual', async () => {
    const { result } = await run(['ls'], [{ stdout: 'a' }], { context: auto });
    expect(result).toEqual({ ok: true, outputs: ['a'] });
  });
});

describe('"No shell command in <name> was run" (errors.md)', () => {
  test('a raw control character other than tab or newline refuses the command, shown as the replacement mark', async () => {
    const { result, runner, asked } = await run(['build.sh --target\u0001dist'], []);
    const message = failure(result);
    expect(
      message.startsWith(
        'No shell command in /pr-summary was run, because the Bash tool does not accept one of them: ',
      ),
    ).toBe(true);
    expect(message).toContain(
      'command contains control characters that would be hidden in the approval dialog',
    );
    expect(message.endsWith('\nbuild.sh --target�dist')).toBe(true);
    expect(runner.calls).toHaveLength(0);
    expect(asked).toHaveLength(0);
  });

  test('judgment: CRLF line endings of a skill file are not refused, and the shell gets plain newlines', async () => {
    const { result, runner } = await run(['node --version\r\ngit status'], [{ stdout: 'ok' }]);
    expect(result.ok).toBe(true);
    expect(runner.calls[0]?.spec).toMatchObject({ command: 'node --version\ngit status' });
    const { result: lone } = await run(['a\rb'], []);
    expect(failure(lone)).toContain('a\uFFFDb');
  });

  test('judgment: the permission check sees the same normalised command the shell runs', async () => {
    const { asked, runner } = await run(['node --version\r\ngit status'], [{}]);
    expect(asked[0]?.command).toBe('node --version\ngit status');
    expect(asked[0]?.command).toBe(
      runner.calls[0]?.spec.form === 'shell' ? runner.calls[0].spec.command : undefined,
    );
  });

  test("judgment: output past the inline ceiling is injected whole (a file and preview are the host's)", async () => {
    const big = 'x'.repeat(50_000);
    const { result } = await run(['cat big'], [{ stdout: big }]);
    expect(result).toEqual({ ok: true, outputs: [big] });
  });

  test('a tab and a newline are fine', async () => {
    const { result } = await run(['printf a\tb\nprintf c'], [{ stdout: 'ac' }]);
    expect(result.ok).toBe(true);
  });

  test('"PowerShell tool: also U+FEFF or U+180E"', async () => {
    for (const char of ['﻿', '᠎']) {
      const { result } = await run([`Get-Date${char}`], [], { context: { shell: 'powershell' } });
      expect(failure(result)).toContain('the PowerShell tool does not accept one of them');
    }
    const { result } = await run(['echo ﻿'], [{}]);
    expect(result.ok).toBe(true);
  });
});
