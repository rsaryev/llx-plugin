/**
 * workflows.md § When an agent stalls and restarts ("starts over from the same prompt"; `(retry 1)` and
 * `attempt 2 (stalled)`; "at most five times, counting any restart you ask for with `r`"; the three
 * errors and how each starts; `stallMs` on one agent, `CLAUDE_ASYNC_AGENT_STALL_TIMEOUT_MS` for every
 * agent; time waiting on tool calls or a usage-limit reset "doesn't count toward the stall window";
 * inside `parallel()` or `pipeline()` the run carries on with `null`, awaited directly it ends with the
 * error), env-vars.md (`CLAUDE_ASYNC_AGENT_STALL_TIMEOUT_MS`, default 600000). What follows the quoted
 * start of an error is the kit's judgment, tested outside spec().
 */
import { describe, expect, test } from 'bun:test';
import {
  afterAgentFailure,
  afterAttempt,
  attemptLabels,
  canRestartOnRequest,
  hasStalled,
  stallWindowMs,
  type AttemptEnding,
} from '../../../src/agents/workflow/index.ts';
import { spec } from '../../support/spec.ts';

const endings = (...list: AttemptEnding[]) => list;
const failureOf = (...list: AttemptEnding[]) => {
  const verdict = afterAttempt(list);
  if (verdict.restart) throw new Error('the agent restarted');
  return verdict;
};
const STALLED: AttemptEnding[] = Array.from({ length: 6 }, () => 'stalled');
const LOST: AttemptEnding[] = Array.from({ length: 6 }, () => 'lost-reply');

spec('workflows.behavior.When an agent stalls and restarts', () => {
  test('an agent whose attempt stalls starts over, up to the sixth attempt', () => {
    for (let ended = 1; ended <= 5; ended++) {
      const verdict = afterAttempt(Array.from({ length: ended }, () => 'stalled' as const));
      expect(verdict).toMatchObject({ restart: true, attempt: ended + 1 });
    }
  });

  test('"at most five times": the sixth attempt that stalls fails the agent() call', () => {
    expect(afterAttempt(STALLED).restart).toBe(false);
    expect(
      afterAttempt(endings('stalled', 'stalled', 'stalled', 'stalled', 'stalled')).restart,
    ).toBe(true);
  });

  test('a restart you ask for with r counts toward the five', () => {
    expect(canRestartOnRequest(1)).toBe(true);
    expect(canRestartOnRequest(5)).toBe(true);
    expect(canRestartOnRequest(6)).toBe(false);
    const mixed = endings('restarted', 'restarted', 'stalled', 'restarted', 'stalled', 'stalled');
    expect(afterAttempt(mixed).restart).toBe(false);
  });

  test('the name gains a (retry 1) suffix and the detail shows attempt 2 (stalled)', () => {
    expect(attemptLabels(1, undefined)).toEqual({ nameSuffix: '', detail: '' });
    expect(attemptLabels(2, 'stalled')).toEqual({
      nameSuffix: ' (retry 1)',
      detail: 'attempt 2 (stalled)',
    });
    expect(attemptLabels(4, 'stalled')).toEqual({
      nameSuffix: ' (retry 3)',
      detail: 'attempt 4 (stalled)',
    });
    const verdict = afterAttempt(endings('stalled'));
    expect(verdict.restart ? verdict.labels.detail : '').toBe('attempt 2 (stalled)');
  });

  test('time spent waiting on its own tool calls or a usage-limit reset does not count toward the window', () => {
    const window = 600_000;
    expect(
      hasStalled({ sinceOutputMs: 600_000, toolWaitMs: 0, usageLimitWaitMs: 0, windowMs: window }),
    ).toBe(true);
    expect(
      hasStalled({ sinceOutputMs: 599_999, toolWaitMs: 0, usageLimitWaitMs: 0, windowMs: window }),
    ).toBe(false);
    expect(
      hasStalled({
        sinceOutputMs: 900_000,
        toolWaitMs: 400_000,
        usageLimitWaitMs: 0,
        windowMs: window,
      }),
    ).toBe(false);
    expect(
      hasStalled({
        sinceOutputMs: 900_000,
        toolWaitMs: 0,
        usageLimitWaitMs: 300_001,
        windowMs: window,
      }),
    ).toBe(false);
    expect(
      hasStalled({
        sinceOutputMs: 1_500_000,
        toolWaitMs: 400_000,
        usageLimitWaitMs: 400_000,
        windowMs: window,
      }),
    ).toBe(true);
  });
});

spec('workflows.behavior.When an agent stalls and restarts.agent stalled on all 6 attempts', () => {
  test('every attempt went the whole window without output', () => {
    const failure = failureOf(...STALLED);
    expect(failure.cause).toBe('stalled');
    expect(failure.issue.message.startsWith('agent stalled on all 6 attempts')).toBe(true);
    expect(failure.issue.severity).toBe('error');
  });

  test('the advice is to lengthen the window', () => {
    expect(failureOf(...STALLED).issue.message).toContain('lengthen the window');
  });
});

spec(
  'workflows.behavior.When an agent stalls and restarts.agent lost its reply on all 6 attempts',
  () => {
    test('every attempt lost its reply: the error starts with the docs wording', () => {
      const failure = failureOf(...LOST);
      expect(failure.cause).toBe('lost-reply');
      expect(failure.issue.message.startsWith('agent lost its reply on all 6 attempts')).toBe(true);
    });

    test('lengthening the stall window does not help; CLAUDE_STREAM_IDLE_TIMEOUT_MS sets the watchdog', () => {
      const message = failureOf(...LOST).issue.message;
      expect(message).toContain('does not help');
      expect(message).toContain('CLAUDE_STREAM_IDLE_TIMEOUT_MS');
    });
  },
);

spec(
  'workflows.behavior.When an agent stalls and restarts.agent abandoned after 6 attempts',
  () => {
    test('attempts that ended in different ways: the error lists them in order', () => {
      const failure = failureOf(
        ...endings('stalled', 'lost-reply', 'stalled', 'stalled', 'lost-reply', 'stalled'),
      );
      expect(failure.cause).toBe('abandoned');
      expect(failure.issue.message.startsWith('agent abandoned after 6 attempts')).toBe(true);
      expect(failure.issue.message).toContain(
        'stalled, lost its reply, stalled, stalled, lost its reply, stalled',
      );
    });

    test('one different ending among six stalls is enough, in either position', () => {
      for (const odd of [0, 5]) {
        const list = STALLED.map((each, index): AttemptEnding =>
          index === odd ? 'lost-reply' : each,
        );
        expect(failureOf(...list).cause).toBe('abandoned');
      }
    });
  },
);

spec('workflows.behavior.When an agent stalls and restarts.One agent', () => {
  test('stallMs on the agent() call is the stall window, in milliseconds', () => {
    expect(stallWindowMs({ stallMs: 1_800_000, env: {} })).toBe(1_800_000);
  });

  test('it wins over the environment variable that applies to every agent', () => {
    const env = { CLAUDE_ASYNC_AGENT_STALL_TIMEOUT_MS: '900000' };
    expect(stallWindowMs({ stallMs: 1_800_000, env })).toBe(1_800_000);
    expect(stallWindowMs({ env })).toBe(900_000);
  });
});

spec('workflows.behavior.When an agent stalls and restarts.Every agent', () => {
  test('CLAUDE_ASYNC_AGENT_STALL_TIMEOUT_MS sets the window of every agent', () => {
    expect(stallWindowMs({ env: { CLAUDE_ASYNC_AGENT_STALL_TIMEOUT_MS: '1200000' } })).toBe(
      1_200_000,
    );
  });

  test('unset, the default is 600000 (10 minutes)', () => {
    expect(stallWindowMs({ env: {} })).toBe(600_000);
  });
});

spec('workflows.behavior.When an agent stalls and restarts.Awaited directly', () => {
  const failure = failureOf(...STALLED);

  test('awaited directly, the run ends with the error', () => {
    expect(afterAgentFailure('awaited', failure)).toEqual({
      runContinues: false,
      error: failure.issue,
    });
  });

  test('inside parallel() or pipeline(), the run carries on with null in place of the result', () => {
    for (const site of ['parallel', 'pipeline'] as const) {
      expect(afterAgentFailure(site, failure)).toEqual({ runContinues: true, result: null });
    }
  });
});

describe('the labels and messages of the endings (judgments)', () => {
  test('the detail line of the attempt after a lost reply or a requested restart reads in the kit words', () => {
    expect(attemptLabels(2, 'lost-reply').detail).toBe('attempt 2 (lost reply)');
    expect(attemptLabels(3, 'restarted').detail).toBe('attempt 3 (restarted)');
  });

  test('the abandoned list reads every ending, the requested restart as restarted on request', () => {
    const verdict = failureOf(
      'stalled',
      'lost-reply',
      'restarted',
      'stalled',
      'lost-reply',
      'stalled',
    );
    expect(verdict.issue.message).toContain(
      'stalled, lost its reply, restarted on request, stalled, lost its reply, stalled',
    );
  });
});

describe('the stall window (judgments)', () => {
  test('the default the host raises with the stream idle timeout loses to the environment variable and to stallMs', () => {
    const env = { CLAUDE_ASYNC_AGENT_STALL_TIMEOUT_MS: '900000' };
    expect(stallWindowMs({ defaultMs: 1_200_000, env: {} })).toBe(1_200_000);
    expect(stallWindowMs({ defaultMs: 1_200_000, env })).toBe(900_000);
    expect(stallWindowMs({ defaultMs: 1_200_000, stallMs: 1_800_000, env })).toBe(1_800_000);
    expect(stallWindowMs({ defaultMs: 0, env: {} })).toBe(600_000);
  });

  test('a value that is not a positive whole number is no value: the next source applies', () => {
    for (const stallMs of [0, -5, 1.5, Number.NaN]) {
      expect(stallWindowMs({ stallMs, env: {} })).toBe(600_000);
    }
    for (const value of ['0', '-1', '10.5', 'ten', '', '1e6']) {
      expect(stallWindowMs({ env: { CLAUDE_ASYNC_AGENT_STALL_TIMEOUT_MS: value } })).toBe(600_000);
    }
  });
});
