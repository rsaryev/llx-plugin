/**
 * skills.md § Run skills in a subagent (`context: fork`, `agent`, `background` and the cases where
 * Claude Code "also waits for the result"), env-vars.md (`CLAUDE_CODE_DISABLE_BACKGROUND_TASKS`).
 * The model, effort and shell of a skill are in execution-overrides.test.ts.
 */
import { expect, test } from 'bun:test';
import {
  readExecutionEnvironment,
  resolveExecution,
  resolveTurnOverrides,
  type ExecutionContext,
} from '../../src/skills/execution.ts';
import { fakeEnvironment } from '../support/ports.ts';
import { skillWith } from '../support/skills.ts';
import { spec } from '../support/spec.ts';

const RESEARCH = 'name: deep-research\ndescription: Research a topic thoroughly\n';
const FORK = `${RESEARCH}context: fork\n`;

const interactive: ExecutionContext = {
  interactive: true,
  backgroundTasksDisabled: false,
  trigger: 'user',
};
const run = (frontmatter: string, ctx: Partial<ExecutionContext> = {}) =>
  resolveExecution(skillWith(frontmatter), { ...interactive, ...ctx });

spec('skills.frontmatter.context', () => {
  test('"Set to `fork` to run in a forked subagent context"', () => {
    expect(run(FORK).mode).toBe('fork');
  });

  test('without `context` the skill runs inline, in the conversation', () => {
    expect(run(RESEARCH).mode).toBe('inline');
  });

  test('a forked subagent "doesn\'t see your conversation history"', () => {
    const execution = run(FORK);
    if (execution.mode !== 'fork') throw new Error('unreachable');
    expect(execution.seesConversation).toBe(false);
  });

  test('the model and effort of a forked skill go to the subagent, not the turn', () => {
    const forked = skillWith(`${FORK}model: haiku\neffort: low`);
    expect(resolveTurnOverrides(forked, {})).toMatchObject({
      target: 'subagent',
      model: 'haiku',
      effort: { level: 'low', source: 'skill' },
    });
    const inline = skillWith(`${RESEARCH}model: haiku\neffort: low`);
    expect(resolveTurnOverrides(inline, {})).toMatchObject({
      target: 'turn',
      model: 'haiku',
      effort: { level: 'low', source: 'skill' },
    });
  });
});

spec('skills.frontmatter.agent', () => {
  test('"Which subagent type to use when `context: fork` is set": a built-in agent', () => {
    const execution = run(`${FORK}agent: Explore`);
    expect(execution).toMatchObject({ mode: 'fork', agent: 'Explore' });
  });

  test('"or any custom subagent from `.claude/agents/`"', () => {
    expect(run(`${FORK}agent: code-reviewer`)).toMatchObject({ agent: 'code-reviewer' });
  });

  test('"If omitted, uses `general-purpose`"', () => {
    expect(run(FORK)).toMatchObject({ agent: 'general-purpose' });
  });

  test('`agent` without `context: fork` does nothing: the skill is inline', () => {
    expect(run(`${RESEARCH}agent: Explore`)).toEqual({ mode: 'inline' });
  });
});

spec('skills.frontmatter.background', () => {
  test('"The forked subagent runs in the background": the default is `true`', () => {
    expect(run(FORK)).toMatchObject({ mode: 'fork', background: true, waitsFor: [] });
  });

  test('"Set `background: false` to instead wait for the result in the turn that invoked the skill"', () => {
    expect(run(`${FORK}background: false`)).toMatchObject({
      background: false,
      waitsFor: ['background-false'],
    });
  });

  test('"Only applies with `context: fork`": an inline skill has no background', () => {
    expect(run(`${RESEARCH}background: false`)).toEqual({ mode: 'inline' });
  });

  test('waits "In non-interactive mode, with the `-p` flag or the Agent SDK"', () => {
    expect(run(FORK, { interactive: false })).toMatchObject({
      background: false,
      waitsFor: ['non-interactive'],
    });
  });

  test('waits when `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS` is `1`', () => {
    const disabled = readExecutionEnvironment(
      fakeEnvironment({ CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1' }),
    );
    expect(disabled.backgroundTasksDisabled).toBe(true);
    expect(run(FORK, disabled)).toMatchObject({
      background: false,
      waitsFor: ['background-tasks-disabled'],
    });
    expect(readExecutionEnvironment(fakeEnvironment({})).backgroundTasksDisabled).toBe(false);
  });

  test('waits "When you invoke a forked skill while an earlier invocation of the same skill is still running"', () => {
    expect(run(FORK, { runningForks: new Set(['deep-research']) })).toMatchObject({
      background: false,
      waitsFor: ['already-running'],
    });
    expect(run(FORK, { runningForks: new Set(['another-skill']) })).toMatchObject({
      background: true,
    });
  });

  test('waits "When a session-scoped scheduled task fires with the skill as its prompt"', () => {
    expect(run(FORK, { trigger: 'scheduled-task' })).toMatchObject({
      background: false,
      waitsFor: ['scheduled-task'],
    });
  });

  test('waits when an agent in a dynamic workflow invokes the forked skill', () => {
    expect(run(FORK, { trigger: 'workflow-agent' })).toMatchObject({
      background: false,
      waitsFor: ['workflow-agent'],
    });
  });

  test('Claude invoking the skill, like the user typing it, runs it in the background', () => {
    expect(run(FORK, { trigger: 'model' })).toMatchObject({ background: true });
  });

  test('every reason that applies is reported, in the order the docs give them', () => {
    expect(
      run(`${FORK}background: false`, {
        interactive: false,
        backgroundTasksDisabled: true,
        trigger: 'scheduled-task',
        runningForks: new Set(['deep-research']),
      }),
    ).toMatchObject({
      waitsFor: [
        'background-false',
        'non-interactive',
        'background-tasks-disabled',
        'already-running',
        'scheduled-task',
      ],
    });
  });

  test('"A backgrounded fork also runs with the narrower tool set": waiting keeps the full one', () => {
    expect(run(FORK)).toMatchObject({ fullToolSet: false });
    expect(run(`${FORK}background: false`)).toMatchObject({ fullToolSet: true });
  });
});
