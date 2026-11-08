/**
 * skills.md § Run skills in a subagent: `context: fork` starts a new subagent of the type in `agent`
 * with the skill content as its prompt; it "doesn't see your conversation history"; it runs in the
 * background unless `background: false`, and Claude Code waits in the listed cases; a backgrounded
 * fork has a narrower tool set; the table (system prompt from the agent type, task the SKILL.md
 * content, CLAUDE.md per the agent's startup context); `Explore` and `Plan` "start without CLAUDE.md
 * and git status". § Example: Research skill using Explore agent: the `deep-research` skill. The
 * agent catalog is the host's: these tests give `launchFork` the real built-in catalog.
 */
import { describe, expect, test } from 'bun:test';
import { builtinAgents, type CatalogAgent } from '../../src/agents/catalog/index.ts';
import {
  resolveExecution,
  type Execution,
  type ExecutionContext,
  type WaitReason,
} from '../../src/skills/execution.ts';
import { launchFork, type ForkAgents, type ForkLaunch } from '../../src/skills/fork.ts';
import { expandWith, skillFrom, textOf } from '../support/expand.ts';
import { skillWith } from '../support/skills.ts';
import { spec } from '../support/spec.ts';

const interactive: ExecutionContext = {
  interactive: true,
  backgroundTasksDisabled: false,
  trigger: 'user',
};

const BUILTIN = builtinAgents({ interactive: true, disableExplorePlan: false, disableAll: false });
const CUSTOM: CatalogAgent['startsWith'] = { claudeMd: true, gitStatus: true };

/** The host's lookup: built-ins plus one custom agent. */
const agents: ForkAgents = (name) =>
  BUILTIN.find((agent) => agent.name === name)?.startsWith ??
  (name === 'security-reviewer' ? CUSTOM : undefined);

type Fork = Extract<Execution, { readonly mode: 'fork' }>;
const forkOf = (frontmatter: string, ctx: Partial<ExecutionContext> = {}): Fork => {
  const execution = resolveExecution(skillWith(`context: fork\n${frontmatter}`), {
    ...interactive,
    ...ctx,
  });
  if (execution.mode !== 'fork') throw new Error('expected a fork');
  return execution;
};
const launched = (fork: Fork, text = 'Do it.'): ForkLaunch => {
  const result = launchFork(fork, 'deep-research', text, agents);
  if (!result.ok) throw new Error(result.issue.message);
  return result.launch;
};

spec('skills.behavior.Run skills in a subagent', () => {
  test('"Add `context: fork` ... Claude Code starts a new subagent of the type set in the agent field and gives it the skill content as its prompt"', () => {
    const launch = launched(forkOf('agent: Plan'), 'Plan the migration.');
    expect(launch).toMatchObject({ agent: 'Plan', task: 'Plan the migration.' });
  });

  test('"The subagent doesn\'t see your conversation history, so the skill\'s instructions have to stand on their own"', () => {
    expect(launched(forkOf('')).seesConversation).toBe(false);
  });

  test('"If omitted, uses general-purpose"', () => {
    expect(launched(forkOf('')).agent).toBe('general-purpose');
  });

  test("the table: the system prompt is the agent type's, the task is the SKILL.md content, CLAUDE.md follows the agent's startup context", () => {
    const launch = launched(forkOf(''));
    expect(launch.systemPrompt).toBe('agent-type');
    expect(launch.loads).toEqual({ claudeMd: true, gitStatus: true });
    expect(launched(forkOf('agent: security-reviewer')).loads).toEqual(CUSTOM);
  });

  test('"The built-in Explore and Plan agents start without CLAUDE.md and git status"', () => {
    for (const agent of ['Explore', 'Plan']) {
      expect(launched(forkOf(`agent: ${agent}`)).loads).toEqual({
        claudeMd: false,
        gitStatus: false,
      });
    }
  });

  test('"The forked subagent runs in the background": you keep working, the result arrives when it completes', () => {
    expect(launched(forkOf('')).background).toBe(true);
    expect(forkOf('').waitsFor).toEqual([]);
  });

  test('"Set `background: false` ... to instead wait for the result in the turn that invoked the skill"', () => {
    const fork = forkOf('background: false');
    expect(fork.waitsFor).toEqual(['background-false']);
    expect(launched(fork).background).toBe(false);
  });

  test('Claude Code also waits in non-interactive mode, with the tasks disabled, while an earlier run of the skill goes on, for a scheduled task and for a workflow agent', () => {
    const cases: readonly (readonly [WaitReason, Partial<ExecutionContext>])[] = [
      ['non-interactive', { interactive: false }],
      ['background-tasks-disabled', { backgroundTasksDisabled: true }],
      ['already-running', { runningForks: new Set(['fork-skill']) }],
      ['scheduled-task', { trigger: 'scheduled-task' }],
      ['workflow-agent', { trigger: 'workflow-agent' }],
    ];
    for (const [reason, ctx] of cases) {
      const execution = resolveExecution(skillWith('name: fork-skill\ncontext: fork'), {
        ...interactive,
        ...ctx,
      });
      expect([reason, execution.mode === 'fork' && execution.waitsFor.includes(reason)]).toEqual([
        reason,
        true,
      ]);
    }
  });

  test('"A backgrounded fork also runs with the narrower tool set": waiting keeps the full one', () => {
    expect(launched(forkOf('')).fullToolSet).toBe(false);
    expect(launched(forkOf('background: false')).fullToolSet).toBe(true);
  });

  test('a skill without `context: fork` is not a fork: it runs in the conversation', () => {
    expect(resolveExecution(skillWith('agent: Explore'), interactive).mode).toBe('inline');
  });

  test('judgment: an agent no built-in or custom subagent has is an error naming it, not a fall-back', () => {
    const result = launchFork(forkOf('agent: nobody'), 'deep-research', 'x', agents);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.issue.severity).toBe('error');
    expect(result.issue.message.includes('"nobody"')).toBe(true);
  });
});

const DEEP_RESEARCH = `Research $ARGUMENTS thoroughly:

1. Find relevant files using Glob and Grep
2. Read and analyze the code
3. Summarize findings with specific file references`;

const skill = () =>
  skillFrom('context: fork\nagent: Explore', DEEP_RESEARCH, undefined, 'deep-research');

spec('skills.behavior.Example: Research skill using Explore agent', () => {
  test('"A new isolated context is created" and the agent field picks the execution environment: Explore', async () => {
    const { expansion } = await expandWith(skill(), { request: { arguments: 'authentication' } });
    if (!expansion.ok) throw new Error('expected an expansion');
    expect(expansion.execution).toMatchObject({
      mode: 'fork',
      agent: 'Explore',
      seesConversation: false,
    });
  });

  test('"The subagent receives the skill content as its prompt (the "Research $ARGUMENTS thoroughly" instructions)"', async () => {
    const run = await expandWith(skill(), { request: { arguments: 'the auth flow' } });
    const text = textOf(run.expansion);
    expect(text.startsWith('Research the auth flow thoroughly:')).toBe(true);
    if (!run.expansion.ok || run.expansion.execution.mode !== 'fork') throw new Error('fork');
    const launch = launched(run.expansion.execution, text);
    expect(launch.task).toBe(text);
    expect(launch.agent).toBe('Explore');
  });

  test('"The `agent` field determines the execution environment": Explore is read-only and starts lean', () => {
    const explore = BUILTIN.find((agent) => agent.name === 'Explore');
    expect(explore?.definition.disallowedTools).toEqual(['Write', 'Edit']);
    expect(explore?.startsWith).toEqual({ claudeMd: false, gitStatus: false });
  });

  test('"The subagent summarizes its results and returns them to your main conversation": it runs in the background and the result arrives when it completes', async () => {
    const { expansion } = await expandWith(skill());
    if (!expansion.ok || expansion.execution.mode !== 'fork') throw new Error('fork');
    expect(expansion.execution.background).toBe(true);
  });
});

describe('forked skills and injected commands (judgments)', () => {
  test('the launch is made after the expansion: a failed expansion launches nothing', async () => {
    const run = await expandWith(skillFrom('context: fork\nagent: Explore', '!`gh pr diff`'), {});
    expect(run.expansion.ok).toBe(false);
  });
});
