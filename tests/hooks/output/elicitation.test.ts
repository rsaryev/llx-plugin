/**
 * hooks.md § "Elicitation output", § "Other ways to decline an elicitation" and § "ElicitationResult
 * output": one test per row of the two tables, through the real engine (stdout, exit code, merge,
 * outcome). What the MCP server finally receives is the host's: the outcome's `effects.elicitation`
 * is the action and content the host sends it.
 */
import { describe, expect, test } from 'bun:test';
import { fire } from '../../support/hooks-fire.ts';
import { stage, specific } from '../../support/hooks-output.ts';
import { command, entry } from '../../support/hooks-select.ts';
import type { RunnerReply } from '../../support/runner.ts';
import { spec } from '../../support/spec.ts';

type Event = 'Elicitation' | 'ElicitationResult';

const FACTS = {
  Elicitation: { mcp_server_name: 'auth', message: 'Enter a username', mode: 'form' },
  ElicitationResult: { mcp_server_name: 'auth', action: 'accept', content: { username: 'alice' } },
} as const;

/** One hook per reply, in registry order. */
async function run(event: Event, replies: readonly RunnerReply[]) {
  const hooks = replies.map((_reply, index) =>
    entry(event, { handler: command(`./hook-${index}.sh`) }),
  );
  const { outcome } =
    event === 'Elicitation'
      ? await fire(event, hooks, replies, { output: stage, facts: FACTS.Elicitation })
      : await fire(event, hooks, replies, { output: stage, facts: FACTS.ElicitationResult });
  return outcome;
}

const answer = (event: Event, action: string, content?: object): RunnerReply => ({
  exitCode: 0,
  stdout: JSON.stringify(
    specific(event, { action, ...(content === undefined ? {} : { content }) }),
  ),
});
const exit2: RunnerReply = { exitCode: 2, stderr: 'url mode is not allowed' };
const block: RunnerReply = {
  exitCode: 0,
  stdout: JSON.stringify({ decision: 'block', reason: 'no' }),
};
const silent: RunnerReply = { exitCode: 0 };

spec('hooks.output.Elicitation.Answer for the user', () => {
  test('accept with the form values: the server receives accept with the content, and no dialog appears', async () => {
    const outcome = await run('Elicitation', [
      answer('Elicitation', 'accept', { username: 'alice' }),
    ]);
    expect(outcome.effects.elicitation).toEqual({
      action: 'accept',
      content: { username: 'alice' },
    });
  });

  test('a content that is not an object fails validation: the hook leaves the request to the user', async () => {
    const outcome = await run('Elicitation', [
      {
        exitCode: 0,
        stdout: JSON.stringify(specific('Elicitation', { action: 'accept', content: 'alice' })),
      },
    ]);
    expect(outcome.effects.elicitation).toBeUndefined();
    expect(outcome.runs[0]?.status).toBe('non-blocking-error');
  });

  test('reason, systemMessage and continue are discarded, whichever action', async () => {
    const stdout = JSON.stringify({
      ...specific('Elicitation', { action: 'accept', content: { a: 1 } }),
      reason: 'r',
      systemMessage: 'warn',
      continue: false,
    });
    const outcome = await run('Elicitation', [{ exitCode: 0, stdout }]);
    expect(outcome.continue).toBe(true);
    expect(outcome.systemMessages).toEqual([]);
    expect(outcome.effects.elicitation).toEqual({ action: 'accept', content: { a: 1 } });
  });
});

spec('hooks.output.Elicitation.Decline the request', () => {
  test('action decline: the server receives decline', async () => {
    const outcome = await run('Elicitation', [answer('Elicitation', 'decline')]);
    expect(outcome.effects.elicitation).toEqual({ action: 'decline' });
  });

  test('exit 2 declines, and the stderr is shown to no one', async () => {
    const outcome = await run('Elicitation', [exit2]);
    expect(outcome.effects.elicitation).toEqual({ action: 'decline' });
    expect(outcome.block).toMatchObject({ to: 'none', reason: '' });
  });

  test('exit 2 ignores a hookSpecificOutput the same hook printed', async () => {
    const outcome = await run('Elicitation', [
      {
        ...exit2,
        stdout: JSON.stringify(specific('Elicitation', { action: 'accept', content: { a: 1 } })),
      },
    ]);
    expect(outcome.effects.elicitation).toEqual({ action: 'decline' });
  });

  test('a top-level decision: block declines, and overrides an action in the same output', async () => {
    const stdout = JSON.stringify({
      decision: 'block',
      ...specific('Elicitation', { action: 'accept', content: { a: 1 } }),
    });
    const outcome = await run('Elicitation', [{ exitCode: 0, stdout }]);
    expect(outcome.effects.elicitation).toEqual({ action: 'decline' });
    expect(outcome.block).toMatchObject({ via: 'decision' });
    const topLevel = await run('Elicitation', [block]);
    expect(topLevel.effects.elicitation).toEqual({ action: 'decline' });
  });

  test('when several hooks match, a decline from one overrides an accept or cancel from another', async () => {
    for (const others of [
      ['accept', { a: 1 }],
      ['cancel', undefined],
    ] as const) {
      const first = await run('Elicitation', [
        answer('Elicitation', others[0], others[1]),
        answer('Elicitation', 'decline'),
      ]);
      expect(first.effects.elicitation).toEqual({ action: 'decline' });
      const last = await run('Elicitation', [
        answer('Elicitation', 'decline'),
        answer('Elicitation', others[0], others[1]),
      ]);
      expect(last.effects.elicitation).toEqual({ action: 'decline' });
    }
  });

  test('an exit-2 decline of one hook overrides the accept of another', async () => {
    const outcome = await run('Elicitation', [answer('Elicitation', 'accept', { a: 1 }), exit2]);
    expect(outcome.effects.elicitation).toEqual({ action: 'decline' });
  });
});

spec('hooks.output.Elicitation.Cancel the request', () => {
  test('action cancel: the server receives cancel', async () => {
    const outcome = await run('Elicitation', [answer('Elicitation', 'cancel')]);
    expect(outcome.effects.elicitation).toEqual({ action: 'cancel' });
  });

  test('an action outside accept, decline and cancel fails validation', async () => {
    const outcome = await run('Elicitation', [answer('Elicitation', 'dismiss')]);
    expect(outcome.effects.elicitation).toBeUndefined();
  });

  test('judgment: between an accept and a cancel the first hook in registry order wins', async () => {
    const outcome = await run('Elicitation', [
      answer('Elicitation', 'cancel'),
      answer('Elicitation', 'accept', { a: 1 }),
    ]);
    expect(outcome.effects.elicitation).toEqual({ action: 'cancel' });
  });
});

spec('hooks.output.Elicitation.Leave the request to the user', () => {
  test("no output with exit code 0: the user's dialog answers", async () => {
    const outcome = await run('Elicitation', [silent]);
    expect(outcome.effects.elicitation).toBeUndefined();
    expect(outcome.block).toBeUndefined();
  });

  test('the documented script: exit 2 for a URL-mode request, silence for a form request', async () => {
    const urlMode = await run('Elicitation', [exit2]);
    expect(urlMode.effects.elicitation).toEqual({ action: 'decline' });
    const form = await run('Elicitation', [silent]);
    expect(form.effects.elicitation).toBeUndefined();
  });

  test('a hookSpecificOutput with no action leaves it to the user', async () => {
    const outcome = await run('Elicitation', [
      { exitCode: 0, stdout: JSON.stringify(specific('Elicitation', { content: { a: 1 } })) },
    ]);
    expect(outcome.effects.elicitation).toBeUndefined();
  });
});

spec('hooks.output.ElicitationResult.Let the response through', () => {
  test('no output with exit code 0: the response goes through unchanged', async () => {
    const outcome = await run('ElicitationResult', [silent]);
    expect(outcome.effects.elicitation).toBeUndefined();
    expect(outcome.proceed).toBe(true);
  });

  test('a hookSpecificOutput that has no action is ignored', async () => {
    const outcome = await run('ElicitationResult', [
      {
        exitCode: 0,
        stdout: JSON.stringify(specific('ElicitationResult', { content: { username: 'x' } })),
      },
    ]);
    expect(outcome.effects.elicitation).toBeUndefined();
  });
});

spec('hooks.output.ElicitationResult.Change the submitted values', () => {
  test("accept with the new values: the server receives them in place of the user's", async () => {
    const outcome = await run('ElicitationResult', [
      answer('ElicitationResult', 'accept', { username: 'alice@example.com' }),
    ]);
    expect(outcome.effects.elicitation).toEqual({
      action: 'accept',
      content: { username: 'alice@example.com' },
    });
  });

  test('the content replaces the whole content object: a field the hook leaves out is gone', async () => {
    const outcome = await run('ElicitationResult', [
      answer('ElicitationResult', 'accept', { role: 'admin' }),
    ]);
    expect(outcome.effects.elicitation?.content).toEqual({ role: 'admin' });
  });
});

spec('hooks.output.ElicitationResult.Block the response', () => {
  test("action decline: the server receives decline without the user's values", async () => {
    const outcome = await run('ElicitationResult', [answer('ElicitationResult', 'decline')]);
    expect(outcome.effects.elicitation).toEqual({ action: 'decline' });
  });

  test('exit code 2 and a top-level decision: block also block the response', async () => {
    for (const reply of [exit2, block]) {
      const outcome = await run('ElicitationResult', [reply]);
      expect(outcome.effects.elicitation).toEqual({ action: 'decline' });
    }
  });

  test('reason, systemMessage and continue are discarded, whichever action', async () => {
    const stdout = JSON.stringify({
      ...specific('ElicitationResult', { action: 'decline' }),
      reason: 'r',
      systemMessage: 'w',
      continue: false,
    });
    const outcome = await run('ElicitationResult', [{ exitCode: 0, stdout }]);
    expect(outcome.continue).toBe(true);
    expect(outcome.systemMessages).toEqual([]);
  });
});

spec('hooks.output.ElicitationResult.Cancel the request', () => {
  test('action cancel: the server receives cancel (with the values the user submitted, which the host keeps)', async () => {
    const outcome = await run('ElicitationResult', [answer('ElicitationResult', 'cancel')]);
    expect(outcome.effects.elicitation).toEqual({ action: 'cancel' });
  });

  test('to withhold the values the hook returns decline, which wins over a cancel', async () => {
    const outcome = await run('ElicitationResult', [
      answer('ElicitationResult', 'cancel'),
      answer('ElicitationResult', 'decline'),
    ]);
    expect(outcome.effects.elicitation).toEqual({ action: 'decline' });
  });
});

describe('an Elicitation output on the wrong event', () => {
  test('is a validation failure: the hook event name must match', async () => {
    const outcome = await run('ElicitationResult', [answer('Elicitation', 'accept')]);
    expect(outcome.runs[0]?.status).toBe('non-blocking-error');
  });
});
