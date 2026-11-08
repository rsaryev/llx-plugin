/**
 * hooks.md § "Add context for Claude": the events that deliver `additionalContext`, several hooks,
 * the `<system-reminder>` tag, the 10,000-character cap, and the environment-state and conditional
 * project-rule uses it names. The docs' JSON and scripts are played through the real engine and
 * output stage.
 */
import { expect, test } from 'bun:test';
import { createOutputStage } from '../../../src/hooks/index.ts';
import type { CommandResult } from '../../../src/ports/index.ts';
import type { HookEvent } from '../../../src/protocol/official.ts';
import { fire } from '../../support/hooks-fire.ts';
import { specific, stage, viaEngine } from '../../support/hooks-output.ts';
import { command, entry, FACTS } from '../../support/hooks-select.ts';
import { memoryScratch, type RunnerReply } from '../../support/ports.ts';
import { spec } from '../../support/spec.ts';

const inputOf = (run: { readonly stdin?: string }): Record<string, unknown> =>
  JSON.parse(run.stdin ?? '{}') as Record<string, unknown>;

/** A hook's own JSON as a script prints it. */
const prints = (body: object): Partial<CommandResult> => ({
  exitCode: 0,
  stdout: JSON.stringify(body),
});

const hookNamed = (event: HookEvent, name: string) =>
  entry(event, { handler: command(`./${name}.sh`) });

spec('hooks.behavior.Add context for Claude', () => {
  /** The events whose section says where the reminder appears. */
  const DELIVERS = [
    'SessionStart',
    'SubagentStart',
    'UserPromptSubmit',
    'UserPromptExpansion',
    'PreToolUse',
    'PostToolUse',
    'PostToolUseFailure',
    'PostToolBatch',
    'Stop',
    'SubagentStop',
    'PostModelSwitch',
  ] as const;

  test.each(DELIVERS)(
    '%s: additionalContext inside hookSpecificOutput reaches Claude',
    async (event) => {
      const outcome = await viaEngine(event, [
        specific(event, { additionalContext: 'This repo uses `bun test`' }),
      ]);
      expect(outcome.additionalContext).toEqual(['This repo uses `bun test`']);
    },
  );

  test('the docs example: PostToolUse tells Claude a file is generated', async () => {
    const note = 'This file is generated. Edit src/schema.ts and run `bun generate` instead.';
    const outcome = await viaEngine('PostToolUse', [
      { hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: note } },
    ]);
    expect(outcome.additionalContext).toEqual([note]);
    expect(outcome.proceed).toBe(true);
  });

  test.each([
    'Notification',
    'SessionEnd',
    'PreCompact',
    'PostCompact',
    'TaskCompleted',
    'CwdChanged',
  ] as const)(
    '%s is not among the events that deliver it: nothing reaches Claude',
    async (event) => {
      const outcome = await viaEngine(event, [
        specific(event, { additionalContext: 'The deployment target is production' }),
      ]);
      expect(outcome.additionalContext).toEqual([]);
    },
  );

  test('when several hooks return additionalContext for the same event, Claude receives all of the values', async () => {
    const { outcome } = await fire(
      'PostToolUse',
      [hookNamed('PostToolUse', 'a'), hookNamed('PostToolUse', 'b'), hookNamed('PostToolUse', 'c')],
      [
        prints(specific('PostToolUse', { additionalContext: 'first' })),
        prints({}),
        prints(specific('PostToolUse', { additionalContext: 'third' })),
      ],
      { output: stage },
    );
    expect(outcome.additionalContext).toEqual(['first', 'third']);
  });

  test('a <system-reminder> or </system-reminder> tag in the string arrives with its < replaced by &lt;', async () => {
    const outcome = await viaEngine('PostToolUse', [
      specific('PostToolUse', {
        additionalContext: 'a <system-reminder>b</system-reminder> c <system-reminder-x> d',
      }),
    ]);
    expect(outcome.additionalContext).toEqual([
      'a &lt;system-reminder>b&lt;/system-reminder> c <system-reminder-x> d',
    ]);
  });

  test('a value over 10,000 characters is saved to a file: Claude gets the path and a preview of the first 2,000 characters', async () => {
    const scratch = memoryScratch('/session');
    const long = `${'0123456789'.repeat(1_200)}`;
    const { outcome } = await fire(
      'PostToolUse',
      [entry('PostToolUse')],
      [prints(specific('PostToolUse', { additionalContext: long }))],
      { output: createOutputStage({ scratch }) },
    );
    const [text] = outcome.additionalContext;
    expect(scratch.files.size).toBe(1);
    const [path, saved] = [...scratch.files.entries()][0] ?? [];
    expect(saved).toBe(long);
    expect(text).toContain(String(path));
    expect(text).toContain(long.slice(0, 2_000));
    expect(text).not.toContain(long.slice(0, 2_001));
  });

  test('a value of exactly 10,000 characters is delivered whole', async () => {
    const exact = 'x'.repeat(10_000);
    const outcome = await viaEngine('PostToolUse', [
      specific('PostToolUse', { additionalContext: exact }),
    ]);
    expect(outcome.additionalContext).toEqual([exact]);
  });

  test('on PreToolUse it is ignored when the permissionDecision is defer', async () => {
    const outcome = await viaEngine('PreToolUse', [
      specific('PreToolUse', { permissionDecision: 'defer', additionalContext: 'ignored' }),
    ]);
    expect(outcome.additionalContext).toEqual([]);
    const allowed = await viaEngine('PreToolUse', [
      specific('PreToolUse', { permissionDecision: 'allow', additionalContext: 'kept' }),
    ]);
    expect(allowed.additionalContext).toEqual(['kept']);
  });

  test('on Stop it keeps the conversation going so Claude can act on the feedback', async () => {
    const outcome = await viaEngine('Stop', [
      specific('Stop', { additionalContext: 'Please run the test suite before finishing' }),
    ]);
    expect(outcome.effects.continuesTurn).toBe(true);
  });

  test('a hook with no additionalContext adds nothing', async () => {
    expect((await viaEngine('PostToolUse', [{}])).additionalContext).toEqual([]);
  });
});

spec('hooks.behavior.Add context for Claude.Environment state', () => {
  const branchScript: RunnerReply = (run) => {
    const input = inputOf(run);
    return prints(
      specific('SessionStart', {
        additionalContext: `The current branch is main. The session source is ${String(input['source'])}.`,
      }),
    );
  };

  test.each(['startup', 'resume', 'fork', 'clear', 'compact'] as const)(
    'a SessionStart hook states the branch for a session that %ss, and runs again on resume and fork so it can refresh',
    async (source) => {
      const { outcome } = await fire('SessionStart', [entry('SessionStart')], [branchScript], {
        output: stage,
        facts: { source },
      });
      expect(outcome.additionalContext).toEqual([
        `The current branch is main. The session source is ${source}.`,
      ]);
    },
  );

  test('a hook for the resume and fork matchers refreshes the state and stays out of a fresh start', async () => {
    const hooks = [entry('SessionStart', { matcher: 'resume|fork' })];
    const fresh = await fire('SessionStart', hooks, [branchScript], {
      output: stage,
      facts: { source: 'startup' },
    });
    expect(fresh.outcome.additionalContext).toEqual([]);
    const resumed = await fire('SessionStart', hooks, [branchScript], {
      output: stage,
      facts: { source: 'resume' },
    });
    expect(resumed.outcome.additionalContext).toHaveLength(1);
    const forked = await fire('SessionStart', hooks, [branchScript], {
      output: stage,
      facts: { source: 'fork' },
    });
    expect(forked.outcome.additionalContext).toHaveLength(1);
  });
});

spec('hooks.behavior.Add context for Claude.Conditional project rules', () => {
  /** "which test command applies to the file just edited": the hook reads the edited path. */
  const ruleScript: RunnerReply = (run) => {
    const path = String((inputOf(run)['tool_input'] as { file_path?: string }).file_path);
    return path.endsWith('.ts')
      ? prints(
          specific('PostToolUse', { additionalContext: 'For TypeScript files run `bun test`.' }),
        )
      : prints({});
  };
  const edit = (file_path: string) => ({
    ...FACTS.PostToolUse,
    tool_name: 'Edit',
    tool_input: { file_path },
  });

  test('the context depends on the file just edited', async () => {
    const hooks = [entry('PostToolUse', { matcher: 'Edit|Write' })];
    const ts = await fire('PostToolUse', hooks, [ruleScript], {
      output: stage,
      facts: edit('/work/app/src/a.ts'),
    });
    expect(ts.outcome.additionalContext).toEqual(['For TypeScript files run `bun test`.']);
    const md = await fire('PostToolUse', hooks, [ruleScript], {
      output: stage,
      facts: edit('/work/app/README.md'),
    });
    expect(md.outcome.additionalContext).toEqual([]);
  });

  test('an `if` rule can keep the hook from running for other files, and the matcher for other tools', async () => {
    const guarded = entry('PostToolUse', {
      matcher: 'Edit',
      handler: { type: 'command', command: './rules.sh', if: 'Edit(src/**)' },
    });
    const inside = await fire('PostToolUse', [guarded], [ruleScript], {
      output: stage,
      facts: edit('/work/app/src/a.ts'),
    });
    expect(inside.runner.calls).toHaveLength(1);
    const outside = await fire('PostToolUse', [guarded], [ruleScript], {
      output: stage,
      facts: edit('/work/app/docs/a.ts'),
    });
    expect(outside.runner.calls).toHaveLength(0);
    const other = await fire('PostToolUse', [guarded], [ruleScript], {
      output: stage,
      facts: { ...edit('/work/app/src/a.ts'), tool_name: 'Read' },
    });
    expect(other.runner.calls).toHaveLength(0);
  });
});
