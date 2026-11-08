/**
 * sub-agents.md, "Run subagents in foreground or background" (and its three subsections),
 * "What loads at startup", "Frontmatter reference" (the rows for `background`, `omitClaudeMd`,
 * `isolation`, `initialPrompt`); worktrees.md, "Isolate subagents with worktrees". Starting the
 * task, loading the files and creating the worktree are the host's; the kit owns the decision.
 */
import { describe, expect, test } from 'bun:test';
import {
  claudeMdScopes,
  mainSessionFirstTurn,
  runsInBackground,
  worktreeDisposition,
} from '../../src/agents/launch.ts';
import { agentWith } from '../support/launch.ts';
import { spec } from '../support/spec.ts';

spec('agents.frontmatter.background', () => {
  test('with nothing configured a subagent Claude spawns starts in the background', () => {
    expect(runsInBackground({ claudeWillWait: false })).toBe(true);
  });

  test('when Claude asks to wait (claude -p, the SDK, fork mode off) it runs in the foreground', () => {
    expect(runsInBackground({ claudeWillWait: true })).toBe(false);
    expect(runsInBackground({ background: false, claudeWillWait: true })).toBe(false);
  });

  test('`background: true` keeps it in the background even when Claude asks to wait', () => {
    const background = agentWith('background: true').definition.background;
    expect(runsInBackground({ background, claudeWillWait: true })).toBe(true);
  });

  test('CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1: Claude waits for subagents, so none runs in the background', () => {
    expect(runsInBackground({ claudeWillWait: false, backgroundDisabled: true })).toBe(false);
  });
});

spec('agents.frontmatter.omitClaudeMd', () => {
  test('by default the subagent loads the user, project and local CLAUDE.md files and the managed policy files', () => {
    expect(claudeMdScopes({ asMainSession: false, managedSubagent: false })).toEqual({
      user: true,
      project: true,
      local: true,
      managedPolicy: true,
      nested: true,
    });
  });

  test('`omitClaudeMd: true` drops the user, project and local files; the managed policy files still load', () => {
    const omitClaudeMd = agentWith('omitClaudeMd: true').definition.omitClaudeMd;
    expect(claudeMdScopes({ omitClaudeMd, asMainSession: false, managedSubagent: false })).toEqual({
      user: false,
      project: false,
      local: false,
      managedPolicy: true,
      nested: true,
    });
  });

  test('...except for a managed subagent, which loads none at all', () => {
    expect(
      claudeMdScopes({ omitClaudeMd: true, asMainSession: false, managedSubagent: true }),
    ).toEqual({
      user: false,
      project: false,
      local: false,
      managedPolicy: false,
      nested: true,
    });
  });

  test('ignored when the agent runs as the main session agent via --agent or the `agent` setting', () => {
    expect(
      claudeMdScopes({ omitClaudeMd: true, asMainSession: true, managedSubagent: false }),
    ).toEqual({
      user: true,
      project: true,
      local: true,
      managedPolicy: true,
      nested: true,
    });
  });

  test("a subdirectory's CLAUDE.md and path-scoped rules still load with `omitClaudeMd`, and for a managed subagent", () => {
    for (const managedSubagent of [false, true]) {
      expect(
        claudeMdScopes({ omitClaudeMd: true, asMainSession: false, managedSubagent }).nested,
      ).toBe(true);
    }
    expect(claudeMdScopes({ asMainSession: false, managedSubagent: false }).nested).toBe(true);
  });

  test('a managed subagent that does not omit CLAUDE.md still loads the managed policy files', () => {
    expect(
      claudeMdScopes({ omitClaudeMd: false, asMainSession: false, managedSubagent: true })
        .managedPolicy,
    ).toBe(true);
  });
});

spec('agents.frontmatter.isolation', () => {
  const isolation = agentWith('isolation: worktree').extras.isolation;

  test('without `isolation` the subagent has no worktree, with or without changes', () => {
    const { isolation: none } = agentWith('').extras;
    expect(worktreeDisposition({ isolation: none, hasChanges: false })).toBe('none');
    expect(worktreeDisposition({ isolation: none, hasChanges: true })).toBe('none');
  });

  test('the worktree is automatically cleaned up when the subagent makes no changes', () => {
    expect(worktreeDisposition({ isolation, hasChanges: false })).toBe('cleanup');
  });

  test('a worktree with changes stays on disk', () => {
    expect(worktreeDisposition({ isolation, hasChanges: true })).toBe('keep');
  });
});

spec('agents.frontmatter.initialPrompt', () => {
  const initialPrompt = agentWith('initialPrompt: Review the open pull requests').definition
    .initialPrompt;

  test('as the main session agent it is the first user turn', () => {
    expect(mainSessionFirstTurn({ initialPrompt, asMainSession: true })).toBe(
      'Review the open pull requests',
    );
  });

  test('it is prepended to any user-provided prompt', () => {
    const turn = mainSessionFirstTurn({
      initialPrompt,
      asMainSession: true,
      userPrompt: 'focus on the api package',
    });
    expect(turn?.startsWith('Review the open pull requests')).toBe(true);
    expect(turn?.endsWith('focus on the api package')).toBe(true);
  });

  test('a subagent run submits nothing: the field is for the main session agent only', () => {
    expect(
      mainSessionFirstTurn({ initialPrompt, asMainSession: false, userPrompt: 'x' }),
    ).toBeUndefined();
  });

  test('an agent without initialPrompt submits nothing of its own', () => {
    expect(mainSessionFirstTurn({ asMainSession: true, userPrompt: 'hi' })).toBeUndefined();
  });
});

describe('judgments (spec/judgments.md)', () => {
  test('`background: true` does not override CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1', () => {
    expect(
      runsInBackground({ background: true, claudeWillWait: false, backgroundDisabled: true }),
    ).toBe(false);
  });

  test('the initial prompt and the user prompt are joined by a blank line', () => {
    expect(mainSessionFirstTurn({ initialPrompt: 'a', asMainSession: true, userPrompt: 'b' })).toBe(
      'a\n\nb',
    );
  });

  test('an empty user prompt adds nothing; an empty initial prompt is none', () => {
    expect(
      mainSessionFirstTurn({ initialPrompt: 'a', asMainSession: true, userPrompt: '  ' }),
    ).toBe('a');
    expect(
      mainSessionFirstTurn({ initialPrompt: ' ', asMainSession: true, userPrompt: 'b' }),
    ).toBeUndefined();
  });
});
