/**
 * hooks.md, the "<Event> input" section of Elicitation, ElicitationResult and Notification: the
 * documented JSON examples (form mode, URL mode, a result with content, a notification with a
 * title) are what the kit builds, optional fields are absent when not given, and a wrong type or
 * value is refused with an error naming the field.
 */
import { expect, test } from 'bun:test';
import { builtFromExample, builtInput } from '../../support/hooks-doc-input.ts';
import { spec } from '../../support/spec.ts';

const TRANSCRIPT = '/Users/me/.claude/projects/p/00893aaf-19fa-41d2-8238-13269b9b3ca0.jsonl';
const head = { session_id: 'abc123', transcript_path: TRANSCRIPT, cwd: '/Users/me' };

spec('hooks.behavior.Elicitation input', () => {
  const form = {
    ...head,
    hook_event_name: 'Elicitation',
    mcp_server_name: 'my-mcp-server',
    message: 'Please provide your credentials',
    mode: 'form',
    requested_schema: {
      type: 'object',
      properties: { username: { type: 'string', title: 'Username' } },
    },
  };
  const url = {
    ...head,
    hook_event_name: 'Elicitation',
    mcp_server_name: 'my-mcp-server',
    message: 'Please authenticate',
    mode: 'url',
    url: 'https://auth.example.com/login',
  };

  test('the documented form-mode example', () => {
    expect(builtFromExample('Elicitation', form).wire).toEqual(form);
  });

  test('the documented URL-mode example: the url, and no requested_schema', () => {
    const { wire } = builtFromExample('Elicitation', url);
    expect(wire).toEqual(url);
    expect(wire).not.toHaveProperty('requested_schema');
  });

  test('mode, url, elicitation_id and requested_schema are optional', () => {
    const { wire } = builtInput('Elicitation', { mcp_server_name: 's', message: 'm' });
    expect(Object.keys(wire ?? {})).toEqual([
      'session_id',
      'transcript_path',
      'cwd',
      'hook_event_name',
      'mcp_server_name',
      'message',
    ]);
  });

  test('elicitation_id arrives when the server gave one', () => {
    const { wire } = builtInput('Elicitation', {
      mcp_server_name: 's',
      message: 'm',
      mode: 'url',
      url: 'https://x.test',
      elicitation_id: 'e-1',
    });
    expect(wire?.['elicitation_id']).toBe('e-1');
  });

  test.each([
    ['mode', { mode: 'popup' }],
    ['requested_schema', { requested_schema: 'object' }],
    ['message', { message: undefined }],
    ['mcp_server_name', { mcp_server_name: 4 }],
  ])('a bad %s is refused, naming the field', (field, bad) => {
    const refused = builtInput('Elicitation', { mcp_server_name: 's', message: 'm', ...bad });
    expect(refused.wire).toBeUndefined();
    expect(refused.errors).toEqual([`hooks.Elicitation.input.${field}`]);
  });
});

spec('hooks.behavior.ElicitationResult input', () => {
  const example = {
    ...head,
    hook_event_name: 'ElicitationResult',
    mcp_server_name: 'my-mcp-server',
    action: 'accept',
    content: { username: 'alice' },
    mode: 'form',
  };

  test('the documented example', () => {
    expect(builtFromExample('ElicitationResult', example).wire).toEqual(example);
  });

  test.each(['accept', 'decline', 'cancel'])(
    'the action %s arrives, and a declined or cancelled one has no content',
    (action) => {
      const { wire } = builtInput('ElicitationResult', { mcp_server_name: 's', action });
      expect(wire?.['action']).toBe(action);
      expect(wire).not.toHaveProperty('content');
    },
  );

  test('an action outside accept, decline and cancel is refused', () => {
    const refused = builtInput('ElicitationResult', { mcp_server_name: 's', action: 'skip' });
    expect(refused.errors).toEqual(['hooks.ElicitationResult.input.action']);
  });

  test('content must be an object of field values', () => {
    const refused = builtInput('ElicitationResult', {
      mcp_server_name: 's',
      action: 'accept',
      content: 'alice',
    });
    expect(refused.errors).toEqual(['hooks.ElicitationResult.input.content']);
  });
});

spec('hooks.behavior.Notification input', () => {
  const example = {
    ...head,
    hook_event_name: 'Notification',
    message: 'Claude needs your permission',
    title: 'Permission needed',
    notification_type: 'permission_prompt',
  };

  test('the documented example', () => {
    expect(builtFromExample('Notification', example).wire).toEqual(example);
  });

  test('title is optional', () => {
    const { title: _omitted, ...without } = example;
    const { wire } = builtFromExample('Notification', without);
    expect(wire).toEqual(without);
    expect(wire).not.toHaveProperty('title');
  });

  test('message and notification_type are required', () => {
    expect(builtInput('Notification', { notification_type: 'idle_prompt' }).errors).toEqual([
      'hooks.Notification.input.message',
    ]);
    expect(builtInput('Notification', { message: 'm' }).errors).toEqual([
      'hooks.Notification.input.notification_type',
    ]);
  });

  test('a notification type the table does not list still arrives: a plugin raises its own', () => {
    // judgment (spec/judgments.md): the SDK types `notification_type` as a string
    expect(
      builtInput('Notification', { message: 'm', notification_type: 'plugin_notification' }).wire,
    ).toBeDefined();
  });
});
