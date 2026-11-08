/**
 * hooks.md, "TaskCreated decision control", "TaskCompleted decision control" and "TeammateIdle
 * decision control": exit code 2, `decision: block` and `continue: false` on each, with the docs'
 * scripts played as a scripted runner and the trigger of TaskCompleted the host knows.
 */
import { describe, expect, test } from 'bun:test';
import { createHookEngine, createHookRegistry } from '../../../src/hooks/index.ts';
import type { HookEvent } from '../../../src/protocol/official.ts';
import { fire } from '../../support/hooks-fire.ts';
import { stage, viaEngine } from '../../support/hooks-output.ts';
import { entry, FACTS, session } from '../../support/hooks-select.ts';
import {
  fakeEnvironment,
  locations,
  scriptedRunner,
  type RunnerReply,
} from '../../support/ports.ts';
import { spec } from '../../support/spec.ts';

const runScript = <E extends HookEvent>(event: E, script: RunnerReply, facts: object) =>
  fire(event, [entry(event)], [script], {
    output: stage,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the facts are the event's own
    facts: facts as never,
  }).then(({ outcome }) => outcome);

/** The JSON a command hook reads on stdin. */
const inputOf = (run: { readonly stdin?: string }): Record<string, unknown> =>
  JSON.parse(run.stdin ?? '{}') as Record<string, unknown>;

spec('hooks.behavior.TaskCreated decision control', () => {
  /** The docs' script: a task subject must start with a ticket number. */
  const ticketScript: RunnerReply = (run) =>
    /^\[TICKET-[0-9]+\]/.test(String(inputOf(run)['task_subject']))
      ? { exitCode: 0 }
      : {
          exitCode: 2,
          stderr: "Task subject must start with a ticket number, e.g. '[TICKET-123] Add feature'\n",
        };

  test('exit code 2 cancels the creation and the stderr text goes back to Claude as the message', async () => {
    const outcome = await runScript('TaskCreated', ticketScript, {
      task_id: 'task-001',
      task_subject: 'Add feature',
    });
    expect(outcome.proceed).toBe(false);
    expect(outcome.block).toMatchObject({ via: 'exit2', to: 'claude' });
    expect(outcome.block?.reason).toContain('Task subject must start with a ticket number');
  });

  test('a subject that follows the format is created', async () => {
    const outcome = await runScript('TaskCreated', ticketScript, {
      task_id: 'task-001',
      task_subject: '[TICKET-123] Add feature',
    });
    expect(outcome.proceed).toBe(true);
  });

  test('JSON {"decision": "block", "reason": ...} returns reason as the message', async () => {
    const outcome = await viaEngine('TaskCreated', [
      { decision: 'block', reason: 'No ticket number' },
    ]);
    expect(outcome.proceed).toBe(false);
    expect(outcome.block).toMatchObject({
      via: 'decision',
      to: 'claude',
      reason: 'No ticket number',
    });
  });

  test('continue: false is ignored and Claude keeps working', async () => {
    const outcome = await viaEngine('TaskCreated', [{ continue: false, stopReason: 'stop' }]);
    expect(outcome.continue).toBe(true);
    expect(outcome.stopReason).toBeUndefined();
    expect(outcome.proceed).toBe(true);
  });

  test('both ways at once: a block still holds when continue: false is ignored beside it', async () => {
    const outcome = await viaEngine('TaskCreated', [
      { continue: false, decision: 'block', reason: 'bad subject' },
    ]);
    expect(outcome.continue).toBe(true);
    expect(outcome.block).toMatchObject({ reason: 'bad subject' });
  });
});

spec('hooks.behavior.TaskCompleted decision control', () => {
  /** The docs' script: block completion when the tests fail. */
  const testsScript =
    (passing: boolean): RunnerReply =>
    (run) =>
      passing
        ? { exitCode: 0 }
        : {
            exitCode: 2,
            stderr: `Tests not passing. Fix failing tests before completing: ${String(inputOf(run)['task_subject'])}\n`,
          };
  const facts = { task_id: 'task-001', task_subject: 'Implement user authentication' };

  test('exit code 2: the task is not marked completed and the stderr is fed back to the model', async () => {
    const outcome = await runScript('TaskCompleted', testsScript(false), facts);
    expect(outcome.proceed).toBe(false);
    expect(outcome.block).toMatchObject({ via: 'exit2', to: 'claude' });
    expect(outcome.block?.reason).toBe(
      'Tests not passing. Fix failing tests before completing: Implement user authentication',
    );
  });

  test('exit code 0: the task is marked completed', async () => {
    expect((await runScript('TaskCompleted', testsScript(true), facts)).proceed).toBe(true);
  });

  test('{"continue": false, "stopReason": ...} stops the teammate entirely and the stopReason is shown to the user', async () => {
    const outcome = await viaEngine('TaskCompleted', [
      { continue: false, stopReason: 'Teammate has no budget left' },
    ]);
    expect(outcome.continue).toBe(false);
    expect(outcome.stopReason).toBe('Teammate has no budget left');
  });

  test('it holds only when a teammate finishing its turn fired the event: the TaskUpdate tool ignores it, exit code 2 still blocks', async () => {
    const stops = await viaEngine('TaskCompleted', [{ continue: false, stopReason: 'x' }]);
    expect(stops.effects.stopCondition).toBe('teammate-finished-its-turn');
    const blocked = await runScript('TaskCompleted', testsScript(false), facts);
    expect(blocked.proceed).toBe(false);
    expect(blocked.effects.stopCondition).toBeUndefined();
  });
});

describe('TaskCompleted with the trigger the host knows', () => {
  const dispatchBy = (taskCompletedBy: 'task-update' | 'teammate-turn', reply: RunnerReply) => {
    const engine = createHookEngine(
      { commands: scriptedRunner(reply), locations: locations(), environment: fakeEnvironment() },
      { output: stage },
    );
    return engine.dispatch(createHookRegistry([entry('TaskCompleted')]), {
      event: 'TaskCompleted',
      facts: FACTS.TaskCompleted,
      session: session(),
      signal: new AbortController().signal,
      taskCompletedBy,
    });
  };
  const stops = { stdout: JSON.stringify({ continue: false, stopReason: 'Out of budget' }) };

  spec('hooks.behavior.TaskCompleted decision control', () => {
    test('when the TaskUpdate tool triggered the event, continue: false is ignored', async () => {
      const outcome = await dispatchBy('task-update', stops);
      expect(outcome.continue).toBe(true);
      expect(outcome.stopReason).toBeUndefined();
      expect(outcome.effects.stopCondition).toBeUndefined();
    });

    test('and exit code 2 still blocks the completion', async () => {
      const outcome = await dispatchBy('task-update', { exitCode: 2, stderr: 'Tests not passing' });
      expect(outcome.proceed).toBe(false);
      expect(outcome.block?.reason).toBe('Tests not passing');
    });

    test('when a teammate finishing its turn triggered it, it stops the teammate and the stopReason is shown', async () => {
      const outcome = await dispatchBy('teammate-turn', stops);
      expect(outcome.continue).toBe(false);
      expect(outcome.stopReason).toBe('Out of budget');
      expect(outcome.effects.stopCondition).toBeUndefined();
    });
  });
});

spec('hooks.behavior.TeammateIdle decision control', () => {
  /** The docs' script: a build artifact must exist before the teammate goes idle. */
  const artifactScript = (exists: boolean): RunnerReply =>
    exists
      ? { exitCode: 0 }
      : { exitCode: 2, stderr: 'Build artifact missing. Run the build before stopping.\n' };
  const facts = { teammate_name: 'researcher', team_name: 'session-a1b2c3d4' };

  test('exit code 2: the teammate receives the stderr as feedback and continues working instead of going idle', async () => {
    const outcome = await runScript('TeammateIdle', artifactScript(false), facts);
    expect(outcome.proceed).toBe(false);
    expect(outcome.block).toMatchObject({ via: 'exit2', to: 'claude' });
    expect(outcome.block?.reason).toBe('Build artifact missing. Run the build before stopping.');
  });

  test('exit code 0: the teammate goes idle', async () => {
    expect((await runScript('TeammateIdle', artifactScript(true), facts)).proceed).toBe(true);
  });

  test('{"continue": false, "stopReason": ...} stops the teammate entirely, and the stopReason is shown to the user', async () => {
    const outcome = await viaEngine('TeammateIdle', [
      { continue: false, stopReason: 'Work is complete' },
    ]);
    expect(outcome.continue).toBe(false);
    expect(outcome.stopReason).toBe('Work is complete');
    expect(outcome.block).toBeUndefined();
  });

  test('the script reads the teammate from the input', async () => {
    let read: Record<string, unknown> = {};
    await runScript(
      'TeammateIdle',
      (run) => {
        read = inputOf(run);
        return {};
      },
      facts,
    );
    expect(read).toMatchObject({ teammate_name: 'researcher', team_name: 'session-a1b2c3d4' });
  });
});
