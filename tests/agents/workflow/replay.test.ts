/**
 * workflows.md § Resume after a pause > Which agents run again: "Claude Code replays the run in the
 * order agents start, and each agent either returns its saved result or runs again": Completed returns
 * its saved result, "the first agent whose prompt differs from the previous run ... runs again, and so
 * does every agent after it, even ones that completed"; Still running when you stopped "starts over.
 * Stopping the whole run doesn't count any agent as failed"; Failed "runs again, and so does every agent
 * the script starts after it, even ones that completed. Stopping one agent alone ... counts as failing".
 * The doc's own examples: A, B, C, D with B failed; A, C, B, D after an edit. What the docs leave open
 * (a running agent does not drag the agents after it along) is a judgment, tested outside spec().
 */
import { describe, expect, test } from 'bun:test';
import {
  RECORDED_WHEN_STOPPED,
  REPLAY_START,
  planReplay,
  replayAgent,
  type AgentCall,
  type Replay,
  type SavedAgent,
} from '../../../src/agents/workflow/index.ts';
import { spec } from '../../support/spec.ts';

const done = (prompt: string, result: unknown = `${prompt}-result`): SavedAgent => ({
  prompt,
  status: 'completed',
  result,
});
const failed = (prompt: string): SavedAgent => ({ prompt, status: 'failed' });
const running = (prompt: string): SavedAgent => ({ prompt, status: 'running' });

const saved = (replay: Replay): boolean => replay.saved;
const calls = (prompts: readonly string[]): AgentCall[] => prompts.map((prompt) => ({ prompt }));

spec('workflows.behavior.Which agents run again.Completed', () => {
  test('an unedited script gets every saved result back, in the saved order', () => {
    const run = [done('A'), done('B'), done('C')];
    const plan = planReplay(run, calls(['A', 'B', 'C']));
    expect(plan).toEqual([
      { saved: true, result: 'A-result' },
      { saved: true, result: 'B-result' },
      { saved: true, result: 'C-result' },
    ]);
  });

  test('the result returned is the saved one, whatever its shape, null included', () => {
    const run = [done('A', { files: ['x.ts'] }), done('B', null)];
    expect(planReplay(run, calls(['A', 'B']))).toEqual([
      { saved: true, result: { files: ['x.ts'] } },
      { saved: true, result: null },
    ]);
  });

  test('the doc example: A, B, C, D started as A, C, B, D returns A and runs C, B and D again', () => {
    const run = [done('A'), done('B'), done('C'), done('D')];
    const plan = planReplay(run, calls(['A', 'C', 'B', 'D']));
    expect(plan.map(saved)).toEqual([true, false, false, false]);
    expect(plan[1]).toEqual({ saved: false, cause: 'prompt-differs' });
  });

  test('the first agent whose prompt differs runs again, and so does every agent after it, even completed ones with the same prompt', () => {
    const run = [done('A'), done('B'), done('C'), done('D')];
    const plan = planReplay(run, calls(['A', 'B edited', 'C', 'D']));
    expect(plan.map(saved)).toEqual([true, false, false, false]);
    expect(plan[2]).toEqual({ saved: false, cause: 'after-change' });
    expect(plan[3]).toEqual({ saved: false, cause: 'after-change' });
  });

  test('an earlier agent that returns something different changes the prompts after it: asked one agent at a time, the next prompt decides', () => {
    const run = [done('A'), done('B'), done('C')];
    let state = REPLAY_START;
    const first = replayAgent(run, state, { prompt: 'A' });
    state = first.state;
    expect(first.replay).toEqual({ saved: true, result: 'A-result' });
    const second = replayAgent(run, state, { prompt: 'B built from a new A' });
    state = second.state;
    expect(second.replay).toEqual({ saved: false, cause: 'prompt-differs' });
    expect(replayAgent(run, state, { prompt: 'C' }).replay).toEqual({
      saved: false,
      cause: 'after-change',
    });
  });

  test('the same prompt with other options is another call: it runs again and so does every agent after it', () => {
    const run = [
      { ...done('A'), options: 'schema:1' },
      { ...done('B'), options: 'schema:1' },
      { ...done('C'), options: 'schema:1' },
    ];
    const same = { prompt: 'A', options: 'schema:1' };
    const edited = { prompt: 'B', options: 'schema:2' };
    const plan = planReplay(run, [same, edited, { prompt: 'C', options: 'schema:1' }]);
    expect(plan).toEqual([
      { saved: true, result: 'A-result' },
      { saved: false, cause: 'options-differ' },
      { saved: false, cause: 'after-change' },
    ]);
  });

  test('a record with no options fingerprint compares the prompt alone, and one side without it differs', () => {
    expect(planReplay([done('A')], [{ prompt: 'A' }]).map(saved)).toEqual([true]);
    expect(planReplay([done('A')], [{ prompt: 'A', options: 'x' }]).map(saved)).toEqual([false]);
    const withOptions = [{ ...done('A'), options: 'x' }];
    expect(planReplay(withOptions, [{ prompt: 'A' }]).map(saved)).toEqual([false]);
  });

  test('an agent the script starts beyond the saved record runs: there is nothing saved for it', () => {
    const plan = planReplay([done('A')], calls(['A', 'B']));
    expect(plan).toEqual([
      { saved: true, result: 'A-result' },
      { saved: false, cause: 'not-saved' },
    ]);
  });

  test('a script that starts fewer agents than the record returns saved results for the ones it starts', () => {
    expect(planReplay([done('A'), done('B')], calls(['A'])).map(saved)).toEqual([true]);
  });
});

spec('workflows.behavior.Which agents run again.Failed', () => {
  test('the doc example: A, B, C, D with B failed returns A from cache and runs B, C and D again', () => {
    const run = [done('A'), failed('B'), done('C'), done('D')];
    const plan = planReplay(run, calls(['A', 'B', 'C', 'D']));
    expect(plan).toEqual([
      { saved: true, result: 'A-result' },
      { saved: false, cause: 'failed' },
      { saved: false, cause: 'after-failed' },
      { saved: false, cause: 'after-failed' },
    ]);
  });

  test('a failed agent runs again even when it is the first, and drags every agent after it', () => {
    const plan = planReplay([failed('A'), done('B')], calls(['A', 'B']));
    expect(plan.map(saved)).toEqual([false, false]);
  });

  test('the agents before the failed one are untouched by it', () => {
    const run = [done('A'), done('B'), failed('C')];
    expect(planReplay(run, calls(['A', 'B', 'C'])).map(saved)).toEqual([true, true, false]);
  });
});

spec('workflows.behavior.Which agents run again.Still running when you stopped', () => {
  test('an agent that was running when the run was stopped starts over', () => {
    const run = [done('A'), running('B')];
    const plan = planReplay(run, calls(['A', 'B']));
    expect(plan).toEqual([
      { saved: true, result: 'A-result' },
      { saved: false, cause: 'was-running' },
    ]);
  });

  test('stopping the whole run does not count it as failed: the completed agents after it keep their results', () => {
    // Agents run concurrently, so an agent that started later can have finished before one still running.
    const run = [done('A'), running('B'), done('C')];
    const plan = planReplay(run, calls(['A', 'B', 'C']));
    expect(plan.map(saved)).toEqual([true, false, true]);
    expect(plan[1]).toEqual({ saved: false, cause: 'was-running' });
  });

  test('the same script stopped as a whole run and as one agent differs: only the second reruns what follows', () => {
    const whole = [
      done('A'),
      { prompt: 'B', status: RECORDED_WHEN_STOPPED['whole-run'] },
      done('C'),
    ];
    const one = [done('A'), { prompt: 'B', status: RECORDED_WHEN_STOPPED['one-agent'] }, done('C')];
    const prompts = ['A', 'B', 'C'];
    expect(planReplay(whole, calls(prompts)).map(saved)).toEqual([true, false, true]);
    expect(planReplay(one, calls(prompts)).map(saved)).toEqual([true, false, false]);
  });
});

describe('judgment: a running agent whose prompt or options changed', () => {
  test('changed options of a running agent are a change like a changed prompt', () => {
    const run = [{ ...running('B'), options: 'x' }, done('C')];
    const plan = planReplay(run, [{ prompt: 'B', options: 'y' }, { prompt: 'C' }]);
    expect(plan.map((each) => (each.saved ? 'saved' : each.cause))).toEqual([
      'was-running',
      'after-change',
    ]);
  });

  test('a changed prompt is a change like any other: every agent after it runs again', () => {
    const run = [running('B'), done('C')];
    const plan = planReplay(run, calls(['B edited', 'C']));
    expect(plan).toEqual([
      { saved: false, cause: 'was-running' },
      { saved: false, cause: 'after-change' },
    ]);
  });
});
