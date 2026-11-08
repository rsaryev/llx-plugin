/**
 * skills.md § How injected commands run: the tool is picked from `shell` and the environment, and
 * the Bash or PowerShell tool runs the commands "the same way it runs Claude's own shell commands.
 * They share the working directory, timeout, and output handling": stderr, the 2-minute timeout
 * that moves a command to the background, the output ceiling, the working directory. The Bash
 * tool's own rules are in tools-reference.md § Timeout and output limits, § Output limits and
 * § Foreground commands that move to the background.
 */
import { describe, expect, test } from 'bun:test';
import { memoryScratch } from '../support/ports.ts';
import { abortOf, expandWith, skillFrom, textOf } from '../support/expand.ts';
import { fixedRunner, runThrough } from '../support/shell-run.ts';
import { spec } from '../support/spec.ts';

const ALLOW = { permissions: () => 'allow' as const };
const BOTH = { bash: true, powershell: true };
const NO_BASH = { bash: false, powershell: true };

/** A foreground command the Bash tool moved to the background at its timeout. */
const MOVED = {
  exitCode: null,
  timedOut: true,
  background: { taskId: 'task-7', outputPath: '/session/task-7.output' },
} as const;

spec('skills.behavior.How injected commands run.shell: bash', () => {
  test('"shell: bash when bash isn\'t available: the invocation fails before any command runs" with the quoted message', async () => {
    const skill = skillFrom('shell: bash', '!`ls`', { kind: 'project' }, 'build');
    const run = await expandWith(skill, { ...ALLOW, request: { shells: NO_BASH } });
    expect(abortOf(run.expansion)).toBe(
      'Skill build requires bash (`shell: bash` in frontmatter) but Git Bash was not found',
    );
    expect(run.runs).toHaveLength(0);
    expect(run.asked).toHaveLength(0);
  });

  test('with bash available the commands run through the Bash tool, and its permission rules apply', async () => {
    const asked: string[] = [];
    const run = await expandWith(skillFrom('shell: bash', '!`ls`'), {
      permissions: (call) => {
        asked.push(call.tool);
        return 'allow';
      },
      request: { shells: BOTH },
    });
    expect(run.runs[0]?.spec).toMatchObject({ form: 'shell', shell: 'bash' });
    expect(asked).toEqual(['Bash']);
  });

  test('"Any other combination": no `shell` key runs through Bash when it is there, else through PowerShell', async () => {
    const withBash = await expandWith(skillFrom('', '!`ls`'), { ...ALLOW });
    expect(withBash.runs[0]?.spec).toMatchObject({ shell: 'bash' });
    const without = await expandWith(skillFrom('', '!`ls`'), {
      ...ALLOW,
      request: { shells: NO_BASH },
    });
    expect(without.runs[0]?.spec).toMatchObject({ shell: 'powershell' });
  });
});

spec('skills.behavior.How injected commands run.shell: powershell', () => {
  test('"with the PowerShell tool enabled: the commands run through the PowerShell tool"', async () => {
    const asked: string[] = [];
    const run = await expandWith(skillFrom('shell: powershell', '!`Get-Date`'), {
      permissions: (call) => {
        asked.push(call.tool);
        return 'allow';
      },
      request: { shells: BOTH },
    });
    expect(run.runs[0]?.spec).toMatchObject({ form: 'shell', shell: 'powershell' });
    expect(asked).toEqual(['PowerShell']);
  });

  test('the same timeout, backgrounding and output ceiling apply to the PowerShell tool', async () => {
    const shell = { context: { shell: 'powershell' } } as const;
    const runner = fixedRunner(MOVED);
    const result = await runThrough(runner, 'Start-Sleep 300', shell);
    if (!result.ok) throw new Error(result.issue.message);
    expect(result.outputs[0]).toContain('moved to the background');
    expect(runner.calls[0]).toMatchObject({ timeoutMs: 120_000, moveToBackgroundOnTimeout: true });
  });

  test('with the tool off, a `shell: powershell` skill falls back to Bash', async () => {
    const run = await expandWith(skillFrom('shell: powershell', '!`ls`'), {
      ...ALLOW,
      request: { shells: { bash: true, powershell: false } },
    });
    expect(run.runs[0]?.spec).toMatchObject({ shell: 'bash' });
  });
});

spec('skills.behavior.How injected commands run.stderr', () => {
  test('"with the default bash shell, Claude Code merges stderr into stdout": stderr appears in the injected text', async () => {
    // a runner that honours `mergeStderr` the way the port documents it
    const run = await expandWith(skillFrom('', 'Result: !`build`'), {
      ...ALLOW,
      replies: [(given) => (given.mergeStderr === true ? { stdout: 'out\nwarning: slow\n' } : {})],
    });
    expect(textOf(run.expansion)).toBe('Result: out\nwarning: slow');
    expect(run.runs[0]?.mergeStderr).toBe(true);
  });

  test('the merge is asked for the bash shell only: the PowerShell tool is not documented to merge', async () => {
    const run = await expandWith(skillFrom('shell: powershell', '!`Get-Date`'), {
      ...ALLOW,
      request: { shells: BOTH },
    });
    expect(run.runs[0]?.mergeStderr).toBe(false);
  });
});

spec('skills.behavior.How injected commands run.Timeout', () => {
  test('"each command runs under the Bash tool\'s default 2-minute timeout"', async () => {
    const runner = fixedRunner({ stdout: 'ok' });
    await runThrough(runner, 'make');
    expect(runner.calls[0]?.timeoutMs).toBe(120_000);
  });

  test('"When the Bash tool moves a timed-out command to the background, the skill still renders": the text reports the move and names the task and the file', async () => {
    const result = await runThrough(fixedRunner(MOVED), 'npm run build');
    expect(result).toEqual({
      ok: true,
      outputs: [
        'Command did not complete within its 120s timeout and was moved to the background. Background task task-7, output file /session/task-7.output.',
      ],
    });
  });

  test('the seconds in the notice are the timeout that applied', async () => {
    const result = await runThrough(fixedRunner(MOVED), 'npm run build', {
      context: { env: { BASH_DEFAULT_TIMEOUT_MS: '30000' } },
    });
    if (!result.ok) throw new Error(result.issue.message);
    expect(result.outputs[0]).toContain('within its 30s timeout');
  });

  test('a `cd` inside the moved command is reported as not carrying over', async () => {
    const result = await runThrough(fixedRunner(MOVED), 'cd web && npm run build');
    if (!result.ok) throw new Error(result.issue.message);
    expect(result.outputs[0]).toContain(
      'Session cwd remains /work/app; directory changes made by the backgrounded command do not apply to subsequent commands.',
    );
  });

  test('"a command the Bash tool never auto-backgrounds is killed at the timeout" and the failure aborts the invocation', async () => {
    const runner = fixedRunner({ ...MOVED });
    const result = await runThrough(runner, 'sleep 600');
    expect(runner.calls[0]?.moveToBackgroundOnTimeout).toBe(false);
    expect(result).toMatchObject({
      ok: false,
      issue: {
        message: expect.stringContaining('Shell command failed for pattern "!`sleep 600`"'),
      },
    });
  });

  test('"CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1" and bare mode turn the move off: the command is killed and the invocation aborts', async () => {
    for (const context of [
      { env: { CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1' } },
      { bare: true },
    ]) {
      const runner = fixedRunner({ exitCode: null, timedOut: true });
      const result = await runThrough(runner, 'npm run build', { context });
      expect(runner.calls[0]?.moveToBackgroundOnTimeout).toBe(false);
      expect(result.ok).toBe(false);
    }
  });

  test('a timeout the host did not move aborts with the limit in force', async () => {
    const result = await runThrough(fixedRunner({ exitCode: null, timedOut: true }), 'make');
    if (result.ok) throw new Error('expected a failure');
    expect(result.issue.message).toContain('timed out after 2 minutes');
  });
});

const CEILING = 30_000;
const PREVIEW = 2_000;

spec('skills.behavior.How injected commands run.Output size', () => {
  test('output up to the inline ceiling (30,000 characters) is injected whole', async () => {
    const text = 'x'.repeat(CEILING);
    const result = await runThrough(fixedRunner({ stdout: text }), 'cat big');
    expect(result).toEqual({ ok: true, outputs: [text] });
  });

  test('"output past the inline ceiling arrives as a file path plus a short preview, not truncated text"', async () => {
    const scratch = memoryScratch('/session');
    const text = `${'a'.repeat(PREVIEW)}${'B'.repeat(CEILING)}`;
    const result = await runThrough(fixedRunner({ stdout: text }), 'cat big', { scratch });
    if (!result.ok) throw new Error(result.issue.message);
    const [injected = ''] = result.outputs;
    const [path] = [...scratch.files.keys()];
    expect(scratch.files.get(path ?? '')).toBe(text);
    expect(injected.includes(path ?? 'missing')).toBe(true);
    expect(injected.endsWith(`\n${'a'.repeat(PREVIEW)}`)).toBe(true);
    expect(injected.includes('B')).toBe(false);
    expect(injected.length).toBeLessThan(text.length / 10);
  });

  test('"truncated past 64 MiB": the saved file keeps the first 64 MiB, cut between two characters', async () => {
    const limit = 64 * 1024 * 1024;
    const scratch = memoryScratch('/session');
    const text = `${'a'.repeat(limit - 1)}\u20ac${'z'.repeat(10)}`;
    const result = await runThrough(fixedRunner({ stdout: text }), 'cat huge', { scratch });
    if (!result.ok) throw new Error(result.issue.message);
    const [saved = ''] = [...scratch.files.values()];
    expect(saved).toBe('a'.repeat(limit - 1));
    expect(result.outputs[0]).toContain('the first 64 MiB of the output was saved to');
    const whole = memoryScratch('/session');
    await runThrough(fixedRunner({ stdout: 'a'.repeat(limit) }), 'cat huge', {
      scratch: whole,
    });
    expect([...whole.files.values()][0]?.length).toBe(limit);
  });

  test('`bashOutputMaxChars` sizes the inline ceiling', async () => {
    const result = await runThrough(fixedRunner({ stdout: 'y'.repeat(5_000) }), 'cat big', {
      context: { bashOutputMaxChars: 4_000 },
      scratch: memoryScratch(),
    });
    if (!result.ok) throw new Error(result.issue.message);
    expect(result.outputs[0] === 'y'.repeat(5_000)).toBe(false);
    const whole = await runThrough(fixedRunner({ stdout: 'y'.repeat(5_000) }), 'cat big', {
      context: { bashOutputMaxChars: 128_000 },
    });
    expect(whole).toEqual({ ok: true, outputs: ['y'.repeat(5_000)] });
  });

  test('"a failure ... past 10,000 characters: a head-and-tail excerpt, with no file path"', async () => {
    const scratch = memoryScratch();
    const output = `${'H'.repeat(8_000)}${'M'.repeat(8_000)}${'T'.repeat(8_000)}`;
    const result = await runThrough(fixedRunner({ exitCode: 2, stdout: output }), 'make', {
      scratch,
    });
    if (result.ok) throw new Error('expected a failure');
    expect(scratch.files.size).toBe(0);
    expect(result.issue.message.includes('H'.repeat(5_000))).toBe(true);
    expect(result.issue.message.includes('T'.repeat(5_000))).toBe(true);
    expect(result.issue.message.includes('M')).toBe(false);
  });

  test('judgment: with no scratch port the preview says the rest could not be saved', async () => {
    const result = await runThrough(fixedRunner({ stdout: 'z'.repeat(CEILING + 1) }), 'cat big');
    if (!result.ok) throw new Error(result.issue.message);
    expect(result.outputs[0]?.includes('could not be saved')).toBe(true);
    expect(result.outputs[0]?.includes('z'.repeat(PREVIEW))).toBe(true);
  });

  test('judgment: a failing scratch port is the same as none', async () => {
    const scratch = { write: () => Promise.reject(new Error('disk full')) };
    const result = await runThrough(fixedRunner({ stdout: 'z'.repeat(CEILING + 1) }), 'cat big', {
      scratch,
    });
    if (!result.ok) throw new Error(result.issue.message);
    expect(result.outputs[0]).toContain('could not be saved');
  });
});

describe('where the commands run', () => {
  spec('skills.behavior.How injected commands run.Working directory', () => {
    test('"each command in the session shell\'s current working directory", which moves when Claude runs cd', async () => {
      const skill = skillFrom('', '!`ls`');
      const first = await expandWith(skill, { ...ALLOW });
      expect(first.runs[0]?.cwd).toBe('/work/app');
      const afterCd = await expandWith(skill, { ...ALLOW, request: { cwd: '/work/app/web' } });
      expect(afterCd.runs[0]?.cwd).toBe('/work/app/web');
    });

    test('"Use ${CLAUDE_SKILL_DIR} or ${CLAUDE_PROJECT_DIR} in paths that must resolve the same way every time"', async () => {
      const skill = skillFrom('', '!`${CLAUDE_SKILL_DIR}/run.sh ${CLAUDE_PROJECT_DIR}/data`');
      for (const cwd of ['/work/app', '/elsewhere']) {
        const run = await expandWith(skill, { ...ALLOW, request: { cwd } });
        expect(run.runs[0]?.spec).toMatchObject({
          command: '/work/app/.claude/skills/pr-summary/run.sh /work/app/data',
        });
      }
    });

    test('commands share the one directory: every command of an expansion gets the same', async () => {
      const run = await expandWith(skillFrom('', '!`a`\n!`b`'), {
        ...ALLOW,
        request: { cwd: '/x' },
      });
      expect(run.runs.map((found) => found.cwd)).toEqual(['/x', '/x']);
    });
  });
});
