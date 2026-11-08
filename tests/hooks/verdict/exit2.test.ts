/**
 * What exit code 2 does on each event: hooks.md § "Exit code 2 behavior per event" (the table,
 * and the paragraph under it on `SessionStart`, `SubagentStart` and `PostModelSwitch`), with
 * § "Exit code 2" for the message ("Claude receives the hook's stderr as the tool's error,
 * prefixed with the event name, the tool name, and the hook's command") and § "Exit code output"
 * for the events' own rules (`WorktreeCreate`, `WorktreeRemove`, the missing-file exception,
 * `Elicitation`). Each event is proven by running a hook that exits 2 through the interpreter and
 * reading what it did to the action and where its stderr went.
 */
import { describe, expect, test } from 'bun:test';
import {
  EXIT2_RULES,
  type BlockInfo,
  type BlockRoute,
  type StderrChannel,
} from '../../../src/hooks/index.ts';
import { HOOK_EVENTS } from '../../../src/protocol/hook-events.ts';
import type { HookEvent } from '../../../src/protocol/official.ts';
import { entry, pluginSource } from '../../support/hooks-select.ts';
import { exited, verdictOf } from '../../support/hooks-verdict.ts';
import { spec } from '../../support/spec.ts';

/**
 * Where the stderr of an exit-2 hook goes, per the table and the event sections: Claude, the user,
 * both, only the debug log, or nowhere.
 */
type Reaches = StderrChannel;

/** What a blocked event shows, and to whom: `none` shows the stderr to no one. */
const ROUTE: { readonly [R in Reaches]: BlockRoute } = {
  claude: 'claude',
  user: 'user',
  'user-and-claude': 'user-and-claude',
  debug: 'none',
  discarded: 'none',
};

/** One row of the table: "Can block?" and "What happens on exit 2", with the event section's route for the stderr. */
const TABLE: { readonly [E in HookEvent]: { blocks: boolean; stderr: Reaches } } = {
  PreToolUse: { blocks: true, stderr: 'claude' }, // Blocks the tool call; Claude sees the stderr as the denial reason
  PermissionRequest: { blocks: false, stderr: 'discarded' }, // "isn't honored", "its stderr is discarded"
  UserPromptSubmit: { blocks: true, stderr: 'user' }, // "the block message shows the stderr text to the user"
  UserPromptExpansion: { blocks: true, stderr: 'user' },
  Stop: { blocks: true, stderr: 'claude' }, // "Claude receives the stderr message as the explanation"
  SubagentStop: { blocks: true, stderr: 'claude' }, // "delivers its stderr message the same way"
  TeammateIdle: { blocks: true, stderr: 'claude' }, // "the teammate receives the stderr message as feedback"
  TaskCreated: { blocks: true, stderr: 'claude' }, // "returns the stderr text as the message" (tool error)
  TaskCompleted: { blocks: true, stderr: 'claude' }, // "fed back to the model as feedback"
  ConfigChange: { blocks: true, stderr: 'debug' }, // "surfaces no message to you or to Claude"; "only writes a line to the debug log"
  StopFailure: { blocks: false, stderr: 'discarded' }, // "Output and exit code are ignored"
  PostToolUse: { blocks: false, stderr: 'claude' }, // "Shows stderr to Claude; the tool already ran"
  PostToolUseFailure: { blocks: false, stderr: 'claude' },
  PostToolBatch: { blocks: true, stderr: 'user-and-claude' }, // "a warning in the transcript, and it stays in the conversation"
  PermissionDenied: { blocks: false, stderr: 'discarded' }, // "Exit code and stderr are ignored"
  Notification: { blocks: false, stderr: 'discarded' },
  SubagentStart: { blocks: false, stderr: 'user' }, // "Shows stderr to user only"
  SessionStart: { blocks: false, stderr: 'user' },
  Setup: { blocks: false, stderr: 'discarded' },
  SessionEnd: { blocks: false, stderr: 'user' },
  CwdChanged: { blocks: false, stderr: 'user' },
  DirectoryAdded: { blocks: false, stderr: 'debug' }, // "Stderr goes to the debug log"
  FileChanged: { blocks: false, stderr: 'user' },
  PreCompact: { blocks: true, stderr: 'user' }, // "the stderr message is shown to the user"
  PostCompact: { blocks: false, stderr: 'user' },
  PreModelSwitch: { blocks: true, stderr: 'user' }, // "Blocks the model switch and shows stderr to the user"
  PostModelSwitch: { blocks: false, stderr: 'user' },
  Elicitation: { blocks: true, stderr: 'discarded' }, // "Claude Code doesn't show your stderr"
  ElicitationResult: { blocks: true, stderr: 'discarded' },
  WorktreeCreate: { blocks: true, stderr: 'debug' }, // judgment: the table gives the row no route (spec/judgments.md)
  WorktreeRemove: { blocks: true, stderr: 'debug' }, // "the hook's command and stderr go to the debug log"
  InstructionsLoaded: { blocks: false, stderr: 'discarded' }, // "Exit code is ignored"
  MessageDisplay: { blocks: false, stderr: 'discarded' }, // "The original text is displayed" (judgment)
};

const STDERR = 'No rm for you';
const expectStderr = (text: string | undefined) => expect(text).toContain(STDERR);

/** A block that reaches no one carries no text; the debug log gets the hook's line when the docs say so. */
function expectHidden(block: BlockInfo | undefined, logged: boolean) {
  expect(block).toMatchObject({ to: 'none', reason: '', message: '' });
  if (logged) expectStderr(block?.debug);
  else expect(block?.debug).toBeUndefined();
}

/** A block shown to Claude or the user carries the stderr as its reason and in its line. */
function expectShown(block: BlockInfo | undefined, to: BlockRoute) {
  expect(block).toMatchObject({ via: 'exit2', to, reason: STDERR });
  expectStderr(block?.message);
  expect(block?.debug).toBeUndefined();
}

for (const event of HOOK_EVENTS) {
  spec(`hooks.exit2.${event}`, () => {
    const { blocks, stderr } = TABLE[event];
    const verdict = verdictOf(event, exited(2, STDERR));

    test(blocks ? 'exit 2 stops the action the event guards' : 'exit 2 stops nothing', () => {
      if (blocks) {
        expect(verdict.status).toBe('blocked');
        expect(verdict.block?.via).toBe('exit2');
      } else {
        expect(verdict.block).toBeUndefined();
        expect(verdict.status).not.toBe('blocked');
      }
    });

    test(`the stderr reaches ${stderr}`, () => {
      const to = ROUTE[stderr];
      if (blocks) {
        if (to === 'none') expectHidden(verdict.block, stderr === 'debug');
        else expectShown(verdict.block, to);
        expect(verdict.block?.to).toBe(to);
      }
      const toClaude = to === 'claude' || to === 'user-and-claude';
      const toUser = to === 'user' || to === 'user-and-claude';
      // A blocked event shows its text through the block, except where both are told.
      const feedbackExpected = blocks ? to === 'user-and-claude' : toClaude;
      const noticeExpected = blocks ? to === 'user-and-claude' : toUser;
      if (feedbackExpected) {
        expect(verdict.feedback).toMatchObject({ to: 'claude' });
        expectStderr(verdict.feedback?.text);
      } else {
        expect(verdict.feedback).toBeUndefined();
      }
      if (noticeExpected) expectStderr(verdict.notice?.message);
      else expect(verdict.notice).toBeUndefined();
    });

    test('the rule table agrees with the docs', () => {
      expect(EXIT2_RULES[event].canBlock).toBe(blocks);
      expect(EXIT2_RULES[event].stderr).toBe(stderr);
    });

    if (blocks) {
      test('an exit code other than 0 and 2 does not block', () => {
        const other = verdictOf(event, exited(1, STDERR));
        const anyNonZero = event === 'WorktreeCreate' || event === 'WorktreeRemove';
        expect(other.block !== undefined).toBe(anyNonZero);
      });
    }
  });
}

describe('exit 2 messages, verbatim from the docs', () => {
  test('a PreToolUse hook on Bash: event, tool and command, then the stderr', () => {
    const verdict = verdictOf('PreToolUse', exited(2, 'Blocked: rm commands are not allowed\n'), {
      hook: { type: 'command', command: '${CLAUDE_PROJECT_DIR}/.claude/hooks/no-rm.sh' },
    });
    expect(verdict.block?.message).toBe(
      'PreToolUse:Bash hook error: [${CLAUDE_PROJECT_DIR}/.claude/hooks/no-rm.sh]: Blocked: rm commands are not allowed',
    );
  });

  test('an exec-form hook names its command and arguments', () => {
    const verdict = verdictOf('PreToolUse', exited(2, 'no'), {
      hook: { type: 'command', command: 'node', args: ['check.js'] },
    });
    expect(verdict.block?.message).toBe('PreToolUse:Bash hook error: [node check.js]: no');
  });
});

describe('what the docs say of particular events', () => {
  test('ConfigChange: a policy_settings change cannot be blocked', () => {
    // "`policy_settings` changes can't be blocked ... any blocking decision is ignored."
    const verdict = verdictOf('ConfigChange', exited(2, 'no'), {
      facts: { source: 'policy_settings' },
    });
    expect(verdict.block).toBeUndefined();
    const project = verdictOf('ConfigChange', exited(2, 'no'), {
      facts: { source: 'project_settings' },
    });
    expect(project.block?.via).toBe('exit2');
  });

  test('Elicitation and ElicitationResult: an exit-2 hook output is ignored', () => {
    // "On Elicitation and ElicitationResult, an exit-2 hook's hookSpecificOutput is ignored."
    const output = JSON.stringify({
      hookSpecificOutput: { hookEventName: 'Elicitation', action: 'accept' },
    });
    for (const event of ['Elicitation', 'ElicitationResult'] as const) {
      const verdict = verdictOf(event, exited(2, '', output));
      expect(verdict.block?.via).toBe('exit2');
      expect(verdict.output).toBeUndefined();
    }
  });

  test('Elicitation: the hookSpecificOutput applies on exit 0 and is ignored on any other code', () => {
    const output = JSON.stringify({ hookSpecificOutput: { action: 'decline' } });
    expect(verdictOf('Elicitation', exited(0, '', output)).output).toBeDefined();
    expect(verdictOf('Elicitation', exited(1, '', output)).output).toBeUndefined();
  });

  test('Elicitation and ElicitationResult: only hookSpecificOutput is ignored, the other fields still count', () => {
    // "applies your `hookSpecificOutput` when your hook exits 0, and ignores it on any other exit
    // code": exit 1 "the fields alone decide", exit 2 "Claude Code still reads the fields".
    const both = JSON.stringify({
      systemMessage: 'heads up',
      continue: false,
      hookSpecificOutput: { action: 'accept' },
    });
    for (const event of ['Elicitation', 'ElicitationResult'] as const) {
      for (const code of [1, 2]) {
        const verdict = verdictOf(event, exited(code, '', both));
        expect(verdict.output).toEqual({ systemMessage: 'heads up', continue: false });
      }
      const exit0 = verdictOf(event, exited(0, '', both));
      expect(exit0.output).toMatchObject({ systemMessage: 'heads up', hookSpecificOutput: {} });
    }
  });

  test('WorktreeCreate: any non-zero exit code makes worktree creation fail, whatever the JSON says', () => {
    const output = JSON.stringify({ continue: true });
    const verdict = verdictOf('WorktreeCreate', exited(1, 'git failed', output));
    expect(verdict.block?.debug).toContain('git failed');
    expect(verdict.block?.reason).toBe('');
    expect(verdictOf('WorktreeCreate', exited(0, '', '/work/wt\n')).block).toBeUndefined();
  });

  test('WorktreeRemove: a non-zero exit fails only if the directory remains', () => {
    const verdict = verdictOf('WorktreeRemove', exited(1, 'rm failed'));
    expect(verdict.block?.condition).toBe('worktree-directory-remains');
  });

  test('a valid JSON allow cannot override exit 2', () => {
    // "Even a `permissionDecision` of "allow" doesn't let the action through."
    const output = JSON.stringify({ hookSpecificOutput: { permissionDecision: 'allow' } });
    const verdict = verdictOf('PreToolUse', exited(2, 'stop', output));
    expect(verdict.block).toMatchObject({ via: 'exit2', reason: 'stop' });
  });

  test('JSON that fails validation still blocks, with the stderr as the reason', () => {
    const verdict = verdictOf('PreToolUse', exited(2, 'stop', '{"nonsense": true}'));
    expect(verdict.block).toMatchObject({ via: 'exit2', reason: 'stop' });
  });
});

describe('a missing file is not a block', () => {
  // "Stop, SubagentStop, TaskCompleted, and a plugin's UserPromptSubmit hook: when your hook exits 2
  // with nothing on stdout and its stderr says a file is missing, such as `No such file or
  // directory`, Claude Code treats the run as a non-blocking error."
  const missing = exited(2, '/bin/sh: ./check.sh: No such file or directory');

  test('on Stop, SubagentStop and TaskCompleted', () => {
    for (const event of ['Stop', 'SubagentStop', 'TaskCompleted'] as const) {
      const verdict = verdictOf(event, missing);
      expect(verdict.block).toBeUndefined();
      expect(verdict.status).toBe('non-blocking-error');
      expect(verdictOf(event, exited(2, 'tests fail')).block?.via).toBe('exit2');
    }
  });

  test('on UserPromptSubmit only for a plugin hook', () => {
    const plugin = entry('UserPromptSubmit', { source: pluginSource('guard') });
    expect(verdictOf('UserPromptSubmit', missing, { entry: plugin }).block).toBeUndefined();
    expect(verdictOf('UserPromptSubmit', missing).block?.via).toBe('exit2');
  });

  test('not when the hook printed something on stdout', () => {
    const verdict = verdictOf('Stop', exited(2, 'No such file or directory', 'text'));
    expect(verdict.block?.via).toBe('exit2');
  });

  test('not on an event the docs do not list', () => {
    expect(verdictOf('PreToolUse', missing).block?.via).toBe('exit2');
  });
});
