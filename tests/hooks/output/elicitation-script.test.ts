/**
 * hooks.md § "Answer a form request from a script" and § "Other ways to decline an elicitation": the
 * docs' scripts played as a scripted runner through the real engine, and every way a hook declines.
 */
import { expect, test } from 'bun:test';
import { fire } from '../../support/hooks-fire.ts';
import { hookNamed, prints, runScript } from '../../support/hooks-script.ts';
import { specific, stage } from '../../support/hooks-output.ts';
import { entry } from '../../support/hooks-select.ts';
import { type RunnerReply } from '../../support/ports.ts';
import { spec } from '../../support/spec.ts';
import { recordOf, stdinJson } from '../../support/stdin.ts';

/** The docs' script: fill the project key when it is the form's single field. */
const projectKey: RunnerReply = (run) => {
  const schema = recordOf(stdinJson(run)['requested_schema']);
  const fields = Object.keys(recordOf(schema['properties']));
  return fields.length === 1 && fields[0] === 'project_key'
    ? prints(specific('Elicitation', { action: 'accept', content: { project_key: 'DOCS' } }))
    : {};
};

const issueTracker = () => entry('Elicitation', { matcher: 'issue-tracker' });

const form = (properties: object, server = 'issue-tracker') => ({
  mcp_server_name: server,
  message: 'Which project?',
  mode: 'form',
  requested_schema: { type: 'object', properties },
});

/** The docs script that declines URL-mode requests and prints nothing for a form. */
const declinesUrlMode: RunnerReply = (run) =>
  stdinJson(run)['mode'] === 'url' ? { exitCode: 2 } : {};

const withUrlDeclined = (facts: object) => runScript('Elicitation', declinesUrlMode, facts);

const askTracker = (facts: object, script: RunnerReply = projectKey) =>
  fire('Elicitation', [issueTracker()], [script], { output: stage, facts });

const asked = (
  replies: readonly RunnerReply[],
  event: 'Elicitation' | 'ElicitationResult' = 'Elicitation',
) =>
  fire(
    event,
    replies.map((_r, index) => hookNamed(event, `e${index}`)),
    replies,
    { output: stage },
  ).then(({ outcome }) => outcome);
const accept = (event: 'Elicitation' | 'ElicitationResult' = 'Elicitation') =>
  prints(specific(event, { action: 'accept', content: { username: 'alice' } }));

spec('hooks.behavior.Answer a form request from a script', () => {
  test('the form asks for the project key: the hook accepts with DOCS and no dialog appears', async () => {
    const { outcome } = await askTracker(
      form({ project_key: { type: 'string', title: 'Project key' } }),
    );
    expect(outcome.effects.elicitation).toEqual({
      action: 'accept',
      content: { project_key: 'DOCS' },
    });
    expect(outcome.proceed).toBe(true);
  });

  // hooks.md, "Elicitation output": each row of the table is what the server receives.
  test.each([
    ['decline', { action: 'decline' }],
    ['cancel', { action: 'cancel' }],
  ] as const)('the %s row: the hook answers %s and the server receives it', async (action, got) => {
    const { outcome } = await askTracker(
      form({ project_key: { type: 'string' } }),
      prints(specific('Elicitation', { action })),
    );
    expect(outcome.effects.elicitation).toEqual(got);
  });

  test('the keys of content are the property names of the requested_schema', async () => {
    const { outcome, runner } = await askTracker(form({ project_key: { type: 'string' } }));
    const schema = recordOf(stdinJson(runner.calls[0] ?? {})['requested_schema']);
    expect(Object.keys(outcome.effects.elicitation?.content ?? {})).toEqual(
      Object.keys(recordOf(schema['properties'])),
    );
  });

  test('for any other request it prints nothing, so the dialog appears', async () => {
    const two = await askTracker(
      form({ project_key: { type: 'string' }, summary: { type: 'string' } }),
    );
    expect(two.outcome.effects.elicitation).toBeUndefined();
    const other = await askTracker(form({ username: { type: 'string' } }));
    expect(other.outcome.effects.elicitation).toBeUndefined();
    const url = await askTracker({
      mcp_server_name: 'issue-tracker',
      message: 'Authenticate',
      mode: 'url',
      url: 'https://auth.example.com/login',
    });
    expect(url.outcome.effects.elicitation).toBeUndefined();
  });

  test('the matcher is the server name: a form from another server does not run the hook', async () => {
    const { runner, outcome } = await askTracker(
      form({ project_key: { type: 'string' } }, 'github'),
    );
    expect(runner.calls).toEqual([]);
    expect(outcome.effects.elicitation).toBeUndefined();
  });

  test('the script sees mcp_server_name, message, mode and the schema on stdin', async () => {
    const { runner } = await askTracker(form({ project_key: { type: 'string' } }));
    expect(stdinJson(runner.calls[0] ?? {})).toMatchObject({
      hook_event_name: 'Elicitation',
      mcp_server_name: 'issue-tracker',
      mode: 'form',
    });
  });

  test('for a URL-mode request a hook that accepts skips the dialog, so the URL never opens', async () => {
    const accepting: RunnerReply = prints(specific('Elicitation', { action: 'accept' }));
    const { outcome } = await askTracker(
      {
        mcp_server_name: 'issue-tracker',
        message: 'Authenticate',
        mode: 'url',
        url: 'https://auth.example.com/login',
      },
      accepting,
    );
    expect(outcome.effects.elicitation).toEqual({ action: 'accept' });
  });
});

spec('hooks.behavior.Other ways to decline an elicitation', () => {
  test.each(['Elicitation', 'ElicitationResult'] as const)(
    '%s: a hook that exits with code 2 declines, and a hookSpecificOutput the same hook printed is ignored',
    async (event) => {
      const outcome = await asked(
        [
          {
            exitCode: 2,
            stderr: 'no',
            stdout: JSON.stringify(specific(event, { action: 'accept' })),
          },
        ],
        event,
      );
      expect(outcome.effects.elicitation).toEqual({ action: 'decline' });
    },
  );

  test.each(['Elicitation', 'ElicitationResult'] as const)(
    '%s: a top-level decision block declines, overriding an action in the same output',
    async (event) => {
      const outcome = await asked(
        [
          prints({
            decision: 'block',
            ...specific(event, { action: 'accept', content: { a: 1 } }),
          }),
        ],
        event,
      );
      expect(outcome.effects.elicitation).toEqual({ action: 'decline' });
    },
  );

  test('when several hooks match, a decline from one overrides an accept or cancel from another', async () => {
    const cancel = prints(specific('Elicitation', { action: 'cancel' }));
    expect((await asked([accept(), { exitCode: 2 }])).effects.elicitation).toEqual({
      action: 'decline',
    });
    expect((await asked([{ exitCode: 2 }, cancel])).effects.elicitation).toEqual({
      action: 'decline',
    });
    expect(
      (await asked([cancel, prints({ decision: 'block' }), accept()])).effects.elicitation,
    ).toEqual({
      action: 'decline',
    });
  });

  test('the docs script declines URL-mode requests and leaves form requests to the dialog', async () => {
    const url = await withUrlDeclined({
      mcp_server_name: 's',
      message: 'm',
      mode: 'url',
      url: 'https://x.test',
    });
    expect(url.effects.elicitation).toEqual({ action: 'decline' });
    const dialog = await withUrlDeclined({ mcp_server_name: 's', message: 'm', mode: 'form' });
    expect(dialog.effects.elicitation).toBeUndefined();
  });

  test('neither the user nor the server sees why: stderr and reason are shown to no one', async () => {
    const stderr = await asked([{ exitCode: 2, stderr: 'because of policy' }]);
    expect(stderr.block).toMatchObject({ to: 'none', reason: '', message: '' });
    const reason = await asked([prints({ decision: 'block', reason: 'because of policy' })]);
    expect(JSON.stringify(reason.effects)).not.toContain('because of policy');
    expect(reason.systemMessages).toEqual([]);
  });
});
