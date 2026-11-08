/**
 * workflows.md § Resume after you leave the session: "If you background your session or exit Claude
 * Code while a workflow run is in progress, the run doesn't continue on its own. The run continues only
 * when Claude relaunches it with a `Workflow` call, which replays the run from its saved results."
 * Backgrounded or `Move to background and exit`: ask Claude in the background session; a relaunch there
 * that fails with `nothing to resume` is started over as a new run, and a script started from a path
 * outside `~/.claude/projects/` cannot be relaunched in the background session. `Exit and stop tasks`:
 * the run stopped with the session; resume with `claude --resume`, then relaunch; "In a fresh session,
 * Claude has no earlier run to relaunch and starts the workflow over". Cloud: results are saved with the
 * conversation history. When the saved results cannot be found "the relaunch fails with a `nothing to
 * resume` error instead of starting the run over on its own".
 */
import { expect, test } from 'bun:test';
import {
  LEAVE_WAYS,
  LEAVING,
  NOTHING_TO_RESUME,
  relaunch,
  type RelaunchFacts,
} from '../../../src/agents/workflow/index.ts';
import { spec } from '../../support/spec.ts';

const facts: RelaunchFacts = {
  earlierRun: true,
  resultsFound: true,
  inBackgroundSession: false,
  scriptOutsideProjects: false,
};

const outcome = (change: Partial<RelaunchFacts>) => relaunch({ ...facts, ...change });

spec('workflows.behavior.Resume after you leave the session', () => {
  test('in none of the three ways of leaving does the run continue on its own', () => {
    expect(LEAVE_WAYS).toEqual([
      'background',
      'move-to-background-and-exit',
      'exit-and-stop-tasks',
    ]);
    for (const way of LEAVE_WAYS) expect(LEAVING[way].continuesOnItsOwn).toBe(false);
  });

  test('backgrounding the session or moving to background and exit: relaunch in the background session, the run is only not running', () => {
    for (const way of ['background', 'move-to-background-and-exit'] as const) {
      expect(LEAVING[way]).toMatchObject({
        stoppedWithSession: false,
        relaunchIn: 'background-session',
        resumeCommand: undefined,
      });
    }
  });

  test('Exit and stop tasks: the run stopped with the session; claude --resume brings the session back, then Claude relaunches', () => {
    expect(LEAVING['exit-and-stop-tasks']).toMatchObject({
      stoppedWithSession: true,
      relaunchIn: 'resumed-session',
      resumeCommand: 'claude --resume',
    });
  });

  test('a relaunch with saved results replays the run from them', () => {
    expect(outcome({})).toEqual({ relaunch: 'replay' });
    expect(outcome({ inBackgroundSession: true })).toEqual({ relaunch: 'replay' });
  });

  test('in a fresh session Claude has no earlier run to relaunch and starts the workflow over as a new run', () => {
    expect(outcome({ earlierRun: false, resultsFound: false })).toEqual({ relaunch: 'new-run' });
  });

  test('saved results that cannot be found fail with nothing to resume, never a new run on its own, in a local or a cloud session', () => {
    expect(NOTHING_TO_RESUME).toBe('nothing to resume');
    expect(outcome({ resultsFound: false })).toEqual({
      relaunch: 'fail',
      error: 'nothing to resume',
    });
  });

  test('a script started from a path outside ~/.claude/projects/ cannot be relaunched in the background session, but can in the resumed one', () => {
    expect(outcome({ inBackgroundSession: true, scriptOutsideProjects: true })).toEqual({
      relaunch: 'fail',
      error: 'nothing to resume',
    });
    expect(outcome({ inBackgroundSession: false, scriptOutsideProjects: true })).toEqual({
      relaunch: 'replay',
    });
  });
});
