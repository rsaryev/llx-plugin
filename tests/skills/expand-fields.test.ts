/**
 * What the `shell`, `model`, `effort` and `context` fields do once a skill is expanded, through
 * `expandSkill`: skills.md § Frontmatter reference, § How injected commands run, § Permission checks
 * on injected commands, § Run skills in a subagent; env-vars.md (`CLAUDE_CODE_EFFORT_LEVEL`,
 * `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS`). The readers of the fields are tested in tests/format and
 * the policies alone in execution.test.ts.
 */
import { expect, test } from 'bun:test';
import { abortOf, expandWith, skillFrom, textOf } from '../support/expand.ts';
import { spec } from '../support/spec.ts';

spec('skills.frontmatter.shell', () => {
  const body = 'Now: !`Get-Date`';
  const both = { bash: true, powershell: true };

  test('the default shell runs injected commands through Bash', async () => {
    const run = await expandWith(skillFrom('', body), {
      rules: { allow: ['Bash(Get-Date)'] },
      request: { shells: both },
    });
    expect(run.runs[0]).toMatchObject({
      spec: { form: 'shell', shell: 'bash' },
      mergeStderr: true,
    });
    expect(run.asked[0]?.tool).toBe('Bash');
  });

  test('`shell: powershell` with the PowerShell tool enabled runs them through PowerShell', async () => {
    const run = await expandWith(skillFrom('shell: powershell', body), {
      permissions: () => 'allow',
      request: { shells: both },
    });
    expect(run.runs[0]?.spec).toMatchObject({ form: 'shell', shell: 'powershell' });
    expect(run.runs[0]?.mergeStderr).toBe(false);
  });

  test("`shell: bash` when bash isn't available fails the invocation before any command runs", async () => {
    const run = await expandWith(skillFrom('shell: bash', '!`one`\n!`two`'), {
      permissions: () => 'allow',
      request: { shells: { bash: false, powershell: true } },
    });
    expect(abortOf(run.expansion)).toBe(
      'Skill pr-summary requires bash (`shell: bash` in frontmatter) but Git Bash was not found',
    );
    expect(run.runs).toHaveLength(0);
  });

  test('any other combination without bash falls back to the PowerShell tool', async () => {
    const run = await expandWith(skillFrom('', body), {
      permissions: () => 'allow',
      request: { shells: { bash: false, powershell: true } },
    });
    expect(run.runs[0]?.spec).toMatchObject({ shell: 'powershell' });
  });

  test('judgment: a skill with no command needs no shell, so it never fails for lack of one', async () => {
    const run = await expandWith(skillFrom('shell: bash', 'Just text'), {
      request: { shells: { bash: false, powershell: false } },
    });
    expect(textOf(run.expansion)).toBe('Just text');
  });

  test("the skills' own failure is an error issue, not a throw", async () => {
    const run = await expandWith(skillFrom('shell: bash', body), {
      request: { shells: { bash: false, powershell: false } },
    });
    expect(run.expansion).toMatchObject({ ok: false, issues: [{ severity: 'error' }] });
  });
});

spec('skills.frontmatter.model', () => {
  test('the override applies for the rest of the turn: the expansion hands it to the host', async () => {
    const run = await expandWith(skillFrom('model: claude-haiku-4-5', 'x'));
    expect(run.expansion).toMatchObject({
      turn: { target: 'turn', model: 'claude-haiku-4-5' },
    });
  });

  test('`inherit` keeps the active model', async () => {
    const run = await expandWith(skillFrom('model: inherit', 'x'));
    if (!run.expansion.ok) throw new Error('unreachable');
    expect(run.expansion.turn.model).toBeUndefined();
  });

  test('a value excluded by `availableModels` is not used and the session keeps its model', async () => {
    const run = await expandWith(skillFrom('model: opus', 'x'), {
      request: { limits: { models: { allowed: (model) => model !== 'opus' } } },
    });
    expect(run.expansion).toMatchObject({ turn: { modelKept: 'excluded' } });
    if (!run.expansion.ok) throw new Error('unreachable');
    expect(run.expansion.turn.model).toBeUndefined();
  });

  test('"a model that auto mode doesn\'t support also isn\'t used, and the session keeps its current model"', async () => {
    const models = { allowed: () => true, supportedInMode: (model: string) => model !== 'haiku' };
    const run = await expandWith(skillFrom('model: haiku', 'x'), {
      request: { permissionMode: 'auto', limits: { models } },
    });
    expect(run.expansion).toMatchObject({
      turn: { target: 'turn', modelKept: 'unsupported-in-mode' },
    });
    if (!run.expansion.ok) throw new Error('unreachable');
    expect(run.expansion.turn.model).toBeUndefined();
  });

  test('a forked skill with an excluded value follows the subagent override rules: the newest permitted version of the family', async () => {
    const models = {
      allowed: (model: string) => model !== 'opus',
      substitute: (model: string) => (model === 'opus' ? 'claude-opus-4-6' : undefined),
    };
    const run = await expandWith(skillFrom('context: fork\nmodel: opus', 'x'), {
      request: { limits: { models } },
    });
    expect(run.expansion).toMatchObject({
      turn: { target: 'subagent', model: 'claude-opus-4-6', modelSubstituted: true },
    });
  });

  test("with `context: fork` the value sets the forked subagent's model instead", async () => {
    const run = await expandWith(skillFrom('context: fork\nmodel: haiku', 'x'));
    expect(run.expansion).toMatchObject({ turn: { target: 'subagent', model: 'haiku' } });
  });
});

spec('skills.frontmatter.effort', () => {
  test('"Overrides the session effort level": the expansion carries it, and `${CLAUDE_EFFORT}` in the text is that level', async () => {
    const skill = skillFrom('effort: max', 'Think at ${CLAUDE_EFFORT}.');
    const run = await expandWith(skill, { request: { effort: 'low' } });
    expect(textOf(run.expansion)).toBe('Think at max.');
    expect(run.expansion).toMatchObject({
      turn: { effort: { level: 'max', source: 'skill' } },
    });
  });

  test('"but not the `CLAUDE_CODE_EFFORT_LEVEL` environment variable": it wins, and the text says so', async () => {
    const skill = skillFrom('effort: max', 'Think at ${CLAUDE_EFFORT}.');
    const run = await expandWith(skill, {
      env: { CLAUDE_CODE_EFFORT_LEVEL: 'low' },
      request: { effort: 'high' },
    });
    expect(textOf(run.expansion)).toBe('Think at low.');
    expect(run.expansion).toMatchObject({
      turn: { effort: { level: 'low', source: 'environment' } },
    });
  });

  test('without the field the session level is the one in force', async () => {
    const skill = skillFrom('', 'Think at ${CLAUDE_EFFORT}.');
    const run = await expandWith(skill, { request: { effort: 'high' } });
    expect(textOf(run.expansion)).toBe('Think at high.');
  });

  test('with no level known, `${CLAUDE_EFFORT}` stays as written', async () => {
    const run = await expandWith(skillFrom('', 'Think at ${CLAUDE_EFFORT}.'));
    expect(textOf(run.expansion)).toBe('Think at ${CLAUDE_EFFORT}.');
  });

  test("with `context: fork` the value sets the forked subagent's level", async () => {
    const run = await expandWith(skillFrom('context: fork\neffort: low', 'x'));
    expect(run.expansion).toMatchObject({ turn: { target: 'subagent', effort: { level: 'low' } } });
  });
});

spec('skills.frontmatter.context', () => {
  test('without `context` the skill runs inline', async () => {
    expect((await expandWith(skillFrom('', 'x'))).expansion).toMatchObject({
      execution: { mode: 'inline' },
    });
  });

  test("`context: fork` forks a subagent of the named type, in the background for a user's run", async () => {
    const run = await expandWith(skillFrom('context: fork\nagent: Explore', 'x'));
    expect(run.expansion).toMatchObject({
      execution: { mode: 'fork', agent: 'Explore', background: true },
    });
  });

  test('the environment decides whether the fork waits: background tasks disabled', async () => {
    const run = await expandWith(skillFrom('context: fork', 'x'), {
      env: { CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1' },
    });
    expect(run.expansion).toMatchObject({
      execution: { mode: 'fork', background: false, waitsFor: ['background-tasks-disabled'] },
    });
  });

  test('a forked skill that sets `agent` aborts in auto mode when a command needs approval; inline it does not', async () => {
    const body = '!`make build`';
    const request = { permissionMode: 'auto' } as const;
    const forked = await expandWith(skillFrom('context: fork\nagent: Explore', body), { request });
    expect(abortOf(forked.expansion)).toContain('permission check failed');
    const inline = await expandWith(skillFrom('', body), { request });
    expect(textOf(inline.expansion)).toContain('make build');
    expect(inline.runs).toHaveLength(0);
    const withoutAgent = await expandWith(skillFrom('context: fork', body), { request });
    expect(withoutAgent.expansion.ok).toBe(true);
  });
});
