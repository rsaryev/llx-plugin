/**
 * Judgments of the per-event inputs (spec/judgments.md): where hooks.md is silent the kit decides,
 * and says so. None of these is `spec(...)`: a judgment never counts as compatibility.
 */
import { describe, expect, test } from 'bun:test';
import { builtInput } from '../../support/hooks-doc-input.ts';

describe('Notification: the type is a string', () => {
  test('a type the matcher table does not list still arrives: a plugin raises its own', () => {
    const { wire } = builtInput('Notification', {
      message: 'm',
      notification_type: 'plugin_notification',
    });
    expect(wire?.['notification_type']).toBe('plugin_notification');
  });
});

describe('ElicitationResult: content follows what the host gives', () => {
  test.each(['accept', 'decline', 'cancel'])(
    'the content of a %s arrives as the host passed it',
    (action) => {
      const content = { username: 'alice' };
      const { wire } = builtInput('ElicitationResult', { mcp_server_name: 's', action, content });
      expect(wire?.['content']).toEqual(content);
    },
  );
});

describe('UserPromptSubmit: the prompt is the host text', () => {
  // The expansion of `[Pasted text #N]` into `<pasted_content>` markers and of a skill typed as
  // `/deploy staging` belongs to the host: the kit's part is to leave the text it was given alone.
  test.each([
    '/deploy staging',
    'see\n<pasted_content id="1">\nlog line\n</pasted_content id="1">',
    '  padded  \n',
  ])('the prompt %j reaches the hook byte for byte', (prompt) => {
    expect(builtInput('UserPromptSubmit', { prompt }).wire?.['prompt']).toBe(prompt);
  });
});
