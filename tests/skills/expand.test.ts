/**
 * skills.md § Inject dynamic context ("Substitution runs once over the original file. Command
 * output is inserted as plain text and is not re-scanned"), § Pass arguments to skills (the
 * `ARGUMENTS:` line), § How Claude Code handles the body of a synced skill, § How injected commands
 * run: the whole of `expandSkill`, the way the pieces fit. The frontmatter fields' effects are in
 * expand-fields.test.ts and expand-tools.test.ts.
 */
import { describe, expect, test } from 'bun:test';
import type { Environment } from '../../src/ports/index.ts';
import { abortOf, expandWith, PLUGIN, skillFrom, textOf } from '../support/expand.ts';

const PR_SUMMARY = `## Pull request context
- PR diff: !\`gh pr diff\`
- PR comments: !\`gh pr view --comments\`
- Changed files: !\`gh pr diff --name-only\`

## Your task
Summarize this pull request...`;

const GH = 'allowed-tools: Bash(gh *)';

describe('the docs example (pr-summary)', () => {
  test('the commands run first and their output replaces each placeholder', async () => {
    const { expansion, runs } = await expandWith(skillFrom(GH, PR_SUMMARY), {
      replies: [{ stdout: 'DIFF\n' }, { stdout: 'COMMENTS' }, { stdout: 'a.ts\nb.ts\n' }],
    });
    expect(textOf(expansion)).toBe(`## Pull request context
- PR diff: DIFF
- PR comments: COMMENTS
- Changed files: a.ts
b.ts

## Your task
Summarize this pull request...`);
    expect(runs.map((run) => run.spec)).toMatchObject([
      { command: 'gh pr diff' },
      { command: 'gh pr view --comments' },
      { command: 'gh pr diff --name-only' },
    ]);
  });

  test('"Claude receives actual data, not the command itself"', async () => {
    const { expansion } = await expandWith(skillFrom(GH, PR_SUMMARY));
    expect(textOf(expansion)).not.toContain('gh pr diff');
  });

  test('the fenced form is replaced as a whole, fences included', async () => {
    const body = '## Environment\n```!\nnode --version\ngit status --short\n```\nDone.';
    const { expansion, runs } = await expandWith(skillFrom('', body), {
      rules: { allow: ['Bash(node *)', 'Bash(git status *)'] },
      permissions: () => 'allow',
      replies: [{ stdout: 'v22.0.0\n M a.ts' }],
    });
    expect(textOf(expansion)).toBe('## Environment\nv22.0.0\n M a.ts\nDone.');
    expect(runs[0]?.spec).toMatchObject({ command: 'node --version\ngit status --short' });
  });
});

describe('"Substitution runs once over the original file"', () => {
  const allow = { permissions: () => 'allow' as const };

  test('output is plain text: a placeholder, an argument or a variable in it is never expanded', async () => {
    const skill = skillFrom('arguments: [topic]', 'Notes: !`gen`\nTopic: $topic');
    const { expansion, runs } = await expandWith(skill, {
      ...allow,
      request: { arguments: 'cats' },
      replies: [{ stdout: '!`rm -rf /` $topic $0 ${CLAUDE_SESSION_ID}' }],
    });
    expect(textOf(expansion)).toBe(
      'Notes: !`rm -rf /` $topic $0 ${CLAUDE_SESSION_ID}\nTopic: cats',
    );
    expect(runs).toHaveLength(1);
  });

  test('an argument value that looks like a command is inserted as text and never run', async () => {
    const skill = skillFrom('', 'Task: $ARGUMENTS\nRun: !`echo hi`');
    const { expansion, runs } = await expandWith(skill, {
      ...allow,
      request: { arguments: '!`rm -rf /`' },
      replies: [{ stdout: 'hi' }],
    });
    expect(textOf(expansion)).toBe('Task: !`rm -rf /`\nRun: hi');
    expect(runs.map((run) => run.spec)).toMatchObject([{ command: 'echo hi' }]);
  });

  test('the `ARGUMENTS:` line is appended after the commands ran, and its text is never run', async () => {
    const skill = skillFrom('', 'Status: !`git status --short`');
    const { expansion, runs } = await expandWith(skill, {
      ...allow,
      request: { arguments: '!`evil`' },
      replies: [{ stdout: 'clean' }],
    });
    const text = textOf(expansion);
    expect(text.startsWith('Status: clean')).toBe(true);
    expect(text.endsWith('ARGUMENTS: !`evil`')).toBe(true);
    expect(runs).toHaveLength(1);
  });

  test('a placeholder inside a command receives the arguments (judgment: the command is part of the file)', async () => {
    const skill = skillFrom('', 'Files: !`ls $ARGUMENTS`');
    const { expansion, runs } = await expandWith(skill, {
      ...allow,
      request: { arguments: 'src' },
      replies: [{ stdout: 'a.ts' }],
    });
    expect(runs[0]?.spec).toMatchObject({ command: 'ls src' });
    expect(textOf(expansion)).toBe('Files: a.ts');
  });

  test('an argument inside a command cannot close it or open another: the command is one piece', async () => {
    const skill = skillFrom('', 'Files: !`ls $ARGUMENTS`');
    const { runs } = await expandWith(skill, {
      ...allow,
      request: { arguments: '`; !`rm x`' },
      replies: [{}],
    });
    expect(runs).toHaveLength(1);
    expect(runs[0]?.spec).toMatchObject({ command: 'ls `; !`rm x`' });
  });

  test('"KEY=!`cmd`" is literal text: nothing runs and nothing is asked', async () => {
    const { expansion, runs, asked } = await expandWith(skillFrom('', 'KEY=!`cmd` here'));
    expect(textOf(expansion)).toBe('KEY=!`cmd` here');
    expect(runs).toHaveLength(0);
    expect(asked).toHaveLength(0);
  });

  test('a skill with no placeholder needs no shell and runs nothing', async () => {
    const { expansion, runs } = await expandWith(skillFrom('', 'Just text'), {
      request: { shells: { bash: false, powershell: false } },
    });
    expect(textOf(expansion)).toBe('Just text');
    expect(runs).toHaveLength(0);
  });

  test('arguments are not appended twice and `$ARGUMENTS` in the text is the full string', async () => {
    const { expansion } = await expandWith(skillFrom('', 'Do $ARGUMENTS now'), {
      request: { arguments: 'a "b c"' },
    });
    expect(textOf(expansion)).toBe('Do a "b c" now');
  });
});

describe('a failure aborts the whole invocation', () => {
  test('no text, one error issue, later commands never run', async () => {
    const skill = skillFrom(GH, '!`gh pr diff`\n!`gh pr view`');
    const { expansion, runs } = await expandWith(skill, {
      replies: [{ exitCode: 4, stdout: 'not a repo' }],
    });
    expect(expansion).toMatchObject({
      ok: false,
      issues: [
        {
          severity: 'error',
          message: 'Shell command failed for pattern "!`gh pr diff`": not a repo',
        },
      ],
    });
    expect('text' in expansion).toBe(false);
    expect(runs).toHaveLength(1);
  });

  test('a command no rule allows aborts: "pre-approve it with allowed-tools"', async () => {
    const skill = skillFrom('', '!`gh pr diff`');
    const { expansion, runs } = await expandWith(skill);
    expect(abortOf(expansion)).toBe(
      'Shell command permission check failed for pattern "!`gh pr diff`"',
    );
    expect(runs).toHaveLength(0);
  });

  test('the placeholder in a message is the one written in the file, not the substituted command', async () => {
    const skill = skillFrom('', '!`gh $ARGUMENTS`');
    const { expansion } = await expandWith(skill, { request: { arguments: 'pr diff' } });
    expect(abortOf(expansion)).toContain('"!`gh $ARGUMENTS`"');
  });
});

describe('where the commands run (judgments)', () => {
  test('in the project folder, with the session environment, unless the host gives its folder', async () => {
    const skill = skillFrom(GH, '!`gh pr diff`');
    const first = await expandWith(skill, { env: { HOME: '/home/user' } });
    expect(first.runs[0]).toMatchObject({ cwd: '/work/app', env: { HOME: '/home/user' } });
    const moved = await expandWith(skill, { request: { cwd: '/work/app/sub' } });
    expect(moved.runs[0]?.cwd).toBe('/work/app/sub');
  });

  test('one environment snapshot serves every command of an expansion', async () => {
    let snapshots = 0;
    const observe = (environment: Environment): Environment => ({
      get: (name) => environment.get(name),
      snapshot: () => {
        snapshots += 1;
        return environment.snapshot();
      },
    });
    const { runs } = await expandWith(skillFrom(GH, '!`gh a`\n!`gh b`'), {
      env: { A: '1' },
      observe,
    });
    expect(snapshots).toBe(1);
    expect(runs.map((run) => run.env)).toEqual([{ A: '1' }, { A: '1' }]);
  });
});

describe('a synced skill (skills.md, "How Claude Code handles the body of a synced skill")', () => {
  const synced = { kind: 'synced' } as const;
  const body = 'Status: !`git status`\n```!\nls\n```';

  test("on the owner's machine its `!` commands are not run: they reach Claude as literal text", async () => {
    const { expansion, runs, asked } = await expandWith(skillFrom('', body, synced), {
      permissions: () => 'allow',
    });
    expect(textOf(expansion)).toBe(body);
    expect(runs).toHaveLength(0);
    expect(asked).toHaveLength(0);
  });

  test('with `disableSkillShellExecution` on, a `!` command line reaches Claude as the placeholder', async () => {
    const { expansion } = await expandWith(skillFrom('', body, synced), {
      request: { disableShellExecution: true },
    });
    expect(textOf(expansion)).toBe(
      'Status: [shell command execution disabled by policy]\n[shell command execution disabled by policy]',
    );
  });

  test('in a cloud session (isolated) the body keeps the behavior a local skill has', async () => {
    const { expansion, runs } = await expandWith(skillFrom('', 'Status: !`git status`', synced), {
      permissions: () => 'allow',
      request: { session: { isolatedSession: true } },
      replies: [{ stdout: 'clean' }],
    });
    expect(textOf(expansion)).toBe('Status: clean');
    expect(runs).toHaveLength(1);
  });

  test('arguments are still substituted in the literal text', async () => {
    const { expansion } = await expandWith(
      skillFrom('', 'Do $ARGUMENTS: !`ls $ARGUMENTS`', synced),
      {
        request: { arguments: 'src' },
      },
    );
    expect(textOf(expansion)).toBe('Do src: !`ls src`');
  });
});

describe('issues that are not failures', () => {
  test('an unresolved ${user_config.KEY} in a plugin skill is a warning on a successful expansion', async () => {
    const { expansion } = await expandWith(
      skillFrom('', 'Token: ${user_config.api_token}', PLUGIN),
    );
    expect(expansion.ok).toBe(true);
    if (!expansion.ok) throw new Error('unreachable');
    expect(expansion.issues.map((found) => found.severity)).toEqual(['warning']);
  });
});
