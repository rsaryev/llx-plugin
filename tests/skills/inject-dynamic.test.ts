/**
 * skills.md § Inject dynamic context: the `` !`<command>` `` syntax runs shell commands before the
 * skill content is sent to Claude and "the command output replaces the placeholder"; "Substitution
 * runs once over the original file" and output "is not re-scanned"; "The inline form is only
 * recognized when `!` appears at the start of a line or immediately after whitespace"; the fenced
 * ` ```! ` form for multi-line commands; `disableSkillShellExecution` ("Bundled and managed skills
 * are not affected"); and a skill synced from claude.ai never runs its commands on the machine.
 */
import { expect, test } from 'bun:test';
import { commandFrom, expandWith, PLUGIN, skillFrom, textOf } from '../support/expand.ts';
import { spec } from '../support/spec.ts';

const ALLOW = { permissions: () => 'allow' as const };
const PLACEHOLDER = '[shell command execution disabled by policy]';

const PR_SUMMARY = `## Pull request context
- PR diff: !\`gh pr diff\`
- PR comments: !\`gh pr view --comments\`
- Changed files: !\`gh pr diff --name-only\`

## Your task
Summarize this pull request...`;

spec('skills.behavior.Inject dynamic context', () => {
  test('the docs example: the commands run first and their output replaces each placeholder', async () => {
    const { expansion, runs } = await expandWith(
      skillFrom('allowed-tools: Bash(gh *)', PR_SUMMARY),
      {
        replies: [{ stdout: 'DIFF' }, { stdout: 'COMMENTS' }, { stdout: 'a.ts' }],
      },
    );
    expect(textOf(expansion)).toBe(`## Pull request context
- PR diff: DIFF
- PR comments: COMMENTS
- Changed files: a.ts

## Your task
Summarize this pull request...`);
    expect(runs).toHaveLength(3);
  });

  test('"Claude receives actual data, not the command itself"', async () => {
    const { expansion } = await expandWith(skillFrom('allowed-tools: Bash(gh *)', PR_SUMMARY));
    expect(textOf(expansion).includes('gh pr')).toBe(false);
  });

  test('the fenced form runs a multi-line command and is replaced as a whole', async () => {
    const body = '## Environment\n```!\nnode --version\ngit status --short\n```\nEnd';
    const { expansion, runs } = await expandWith(skillFrom('', body), {
      ...ALLOW,
      replies: [{ stdout: 'v22.0.0\n M a.ts' }],
    });
    expect(textOf(expansion)).toBe('## Environment\nv22.0.0\n M a.ts\nEnd');
    expect(runs[0]?.spec).toMatchObject({ command: 'node --version\ngit status --short' });
  });

  test('"Substitution runs once": output is plain text, never scanned for a later placeholder', async () => {
    const { expansion, runs } = await expandWith(skillFrom('', 'Out: !`gen`'), {
      ...ALLOW,
      replies: [{ stdout: '!`rm -rf /`' }],
    });
    expect(textOf(expansion)).toBe('Out: !`rm -rf /`');
    expect(runs).toHaveLength(1);
  });

  test('"only recognized when ! appears at the start of a line or immediately after whitespace": `KEY=!`cmd`` stays literal and nothing runs', async () => {
    const { expansion, runs } = await expandWith(skillFrom('', 'KEY=!`cmd` and (!`cmd`)'), {
      ...ALLOW,
    });
    expect(textOf(expansion)).toBe('KEY=!`cmd` and (!`cmd`)');
    expect(runs).toHaveLength(0);
  });

  test('after whitespace and at the start of a line it runs', async () => {
    const { runs } = await expandWith(skillFrom('', '!`a`\nx !`b`\n\t!`c`'), ALLOW);
    expect(runs.map((run) => (run.spec.form === 'shell' ? run.spec.command : ''))).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  test('"Claude Code doesn\'t run these commands on your machine when the skill is synced from your claude.ai account"', async () => {
    const body = 'Status: !`git status`';
    const { expansion, runs, asked } = await expandWith(
      skillFrom('', body, { kind: 'synced' }),
      ALLOW,
    );
    expect(textOf(expansion)).toBe(body);
    expect([runs.length, asked.length]).toEqual([0, 0]);
  });

  test('"set disableSkillShellExecution ... Each command is replaced with the placeholder instead of being run", skills and commands of user, project and plugin sources', async () => {
    for (const origin of [{ kind: 'user' }, { kind: 'project' }, PLUGIN] as const) {
      for (const make of [skillFrom, commandFrom]) {
        const run = await expandWith(make('', 'A: !`ls`\n```!\npwd\n```', origin), {
          request: { disableShellExecution: true },
        });
        expect(textOf(run.expansion)).toBe(`A: ${PLACEHOLDER}\n${PLACEHOLDER}`);
        expect(run.runs).toHaveLength(0);
      }
    }
  });

  test('"Bundled and managed skills are not affected": a managed skill still runs its commands', async () => {
    const run = await expandWith(skillFrom('', 'A: !`ls`', { kind: 'managed' }), {
      ...ALLOW,
      request: { disableShellExecution: true },
      replies: [{ stdout: 'a.ts' }],
    });
    expect(textOf(run.expansion)).toBe('A: a.ts');
  });
});
