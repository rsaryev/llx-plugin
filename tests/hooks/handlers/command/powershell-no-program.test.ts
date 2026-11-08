/**
 * hooks.md § PowerShell started no program and its four fixes (print text, run a script, run one
 * `.exe`, a script written for Bash). The wording of the error beyond the docs' phrase is a judgment
 * (spec/judgments.md), asserted outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import {
  NO_PROGRAM,
  onlyQuotedStrings,
} from '../../../../src/hooks/handlers/command/powershell.ts';
import { settingsCommand } from '../../../support/hooks-run.ts';
import { noGitBash, run } from '../../../support/powershell-run.ts';
import { spec } from '../../../support/spec.ts';

spec('hooks.behavior.PowerShell started no program', () => {
  const guard = '"C:\\Tools\\guard.exe"';

  test('a command that is only quoted strings, in a hook that runs in PowerShell by default, starts nothing: the runner is never asked', async () => {
    const { result, calls } = await run(
      settingsCommand({ command: guard }, 'PreToolUse'),
      noGitBash,
    );
    expect(calls).toEqual([]);
    expect(result.run).toEqual({ kind: 'not-started', message: NO_PROGRAM });
    expect(result.issues.map((issue) => issue.message)).toEqual([NO_PROGRAM]);
    expect(NO_PROGRAM.startsWith('PowerShell started no program')).toBe(true);
  });

  test('"only quoted strings": double or single quoted, with the escapes of each, one or several', () => {
    for (const command of [
      '"C:\\Tools\\guard.exe"',
      "'C:\\Tools\\guard.exe'",
      '  "a"  ',
      '"say `"hi`""',
      '"say ""hi"""',
      "'it''s'",
      '"a" \'b\'',
      '"{\\"x\\": 1}"'.replace(/\\"/g, '`"'),
    ]) {
      expect(onlyQuotedStrings(command)).toBe(true);
    }
  });

  test('anything else is a command PowerShell runs', () => {
    for (const command of [
      '& "C:\\Tools\\guard.exe"',
      'C:\\Tools\\guard.exe',
      '"C:\\Tools\\guard.exe" --strict',
      '"a" + "b"',
      'Write-Host "x"',
      '"unterminated',
      '',
      '"a"b"',
      "& 'a'",
    ]) {
      expect(onlyQuotedStrings(command)).toBe(false);
    }
  });

  test('Bash runs the same quoted program, so a host with Git Bash starts it', async () => {
    const { calls, result } = await run(settingsCommand({ command: guard }), {
      windows: true,
    });
    expect(calls[0]?.spec).toMatchObject({ form: 'shell', shell: 'bash' });
    expect(result.issues).toEqual([]);
  });

  test('exec form has no shell to print it: a quoted command with args is a program', async () => {
    const { calls } = await run(settingsCommand({ command: guard, args: [] }), noGitBash);
    expect(calls).toHaveLength(1);
  });
});

spec('hooks.behavior.PowerShell started no program.To print text, such as JSON', () => {
  const json = '\'{"decision":"block","reason":"no"}\'';

  test('without "shell": "powershell" the hook ran in PowerShell by default and started no program', async () => {
    const { result, calls } = await run(settingsCommand({ command: json }), noGitBash);
    expect(calls).toEqual([]);
    expect(result.run.kind).toBe('not-started');
  });

  test('with "shell": "powershell" the command is run as written, so PowerShell can print it: the runner is asked and no program-less result comes back', async () => {
    const { result, calls } = await run(
      settingsCommand({ command: json, shell: 'powershell' }),
      noGitBash,
    );
    expect(calls[0]?.spec).toEqual({
      form: 'shell',
      shell: 'powershell',
      command: json,
    });
    expect(result.run.kind).not.toBe('not-started');
    expect(result.issues).toEqual([]);
  });
});

spec('hooks.behavior.PowerShell started no program.To run a script written for Bash', () => {
  test('a Bash script is not for PowerShell: with Git Bash found the hook runs in Bash; "shell": "bash" says so', async () => {
    const script = settingsCommand({
      command: '"$CLAUDE_PROJECT_DIR"/.claude/hooks/check.sh',
    });
    expect((await run(script, noGitBash)).calls[0]?.spec).toMatchObject({
      shell: 'powershell',
    });
    expect(
      (await run(script, { ...noGitBash, defaultShell: 'bash' })).calls[0]?.spec,
    ).toMatchObject({
      shell: 'bash',
    });
    const named = settingsCommand({
      command: script.handler.command,
      shell: 'bash',
    });
    expect((await run(named, noGitBash)).calls[0]?.spec).toMatchObject({
      shell: 'bash',
    });
  });
});

spec('hooks.behavior.PowerShell started no program.To run one .exe at a path without $', () => {
  test('with the inner quotes removed the command is not only a string: PowerShell runs it', async () => {
    const { result, calls } = await run(
      settingsCommand({ command: 'C:\\Tools\\guard.exe' }),
      noGitBash,
    );
    expect(calls[0]?.spec).toEqual({
      form: 'shell',
      shell: 'powershell',
      command: 'C:\\Tools\\guard.exe',
    });
    expect(result.issues).toEqual([]);
  });

  test('exec form spawns that program with "args": [] and no shell', async () => {
    const { calls } = await run(
      settingsCommand({
        command: 'C:\\Tools\\guard.exe',
        args: [],
        onFailure: 'block',
      }),
      noGitBash,
    );
    expect(calls[0]?.spec).toEqual({
      form: 'exec',
      command: 'C:\\Tools\\guard.exe',
      args: [],
    });
  });

  test('a path with a space is one executable, not a bare name: no warning', async () => {
    const { result } = await run(
      settingsCommand({
        command: 'C:\\Program Files\\Guard\\guard.exe',
        args: [],
      }),
      noGitBash,
    );
    expect(result.issues).toEqual([]);
  });
});

describe('PowerShell started no program: to run a .ps1, .cmd, .bat or an .exe whose path has a variable', () => {
  // This fix is the one of the id's own bullet: it has no id of its own, the section's id above holds it.
  const script = '& "$env:CLAUDE_PROJECT_DIR\\.claude\\hooks\\check.ps1"';

  test('"shell": "powershell" and & before the quoted path: the command reaches PowerShell as written', async () => {
    const { calls, result } = await run(
      settingsCommand({ command: script, shell: 'powershell' }),
      noGitBash,
    );
    expect(calls[0]?.spec).toEqual({
      form: 'shell',
      shell: 'powershell',
      command: script,
    });
    expect(result.issues).toEqual([]);
  });

  test('$HOME is left as written, for PowerShell to expand', async () => {
    const command = '& "$HOME\\guard.ps1"';
    const { calls } = await run(settingsCommand({ command, shell: 'powershell' }), noGitBash);
    expect(calls[0]?.spec.command).toBe(command);
  });

  test('& before a quoted path is a command, not only a string', () => {
    expect(onlyQuotedStrings(script)).toBe(false);
  });
});
