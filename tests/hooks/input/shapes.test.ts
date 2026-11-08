/**
 * hooks.md § "PreToolUse input" (`mcp_server` with `name` and `source`), "PermissionRequest input"
 * (`permission_suggestions`), "PostToolBatch input" (`tool_calls[]` with `tool_name`, `tool_input`,
 * `tool_use_id` and `tool_response`), "Notification input" (`title`), "UserPromptSubmit input"
 * (`session_title`), "UserPromptExpansion input" (`command_source`), "Elicitation input",
 * "ElicitationResult input" and "ConfigChange input". No requirement id covers these fields, so the
 * tests sit outside `spec(...)` and never count as compatibility; they keep the schema fields from
 * being removed unseen (an unknown key is stripped, so a dropped field would pass silently). What a
 * permission suggestion entry must hold, and that a batch call's `tool_response` may be missing, are
 * rows in spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import type { HookEvent } from '../../../src/protocol/official.ts';
import { build } from '../../support/hooks-input.ts';

const failed = (event: HookEvent, overrides: Record<string, unknown>) => {
  const { input, issues } = build(event, overrides);
  return { input, paths: issues.filter((i) => i.severity === 'error').map((i) => i.path) };
};

describe('judgment: mcp_server on the events with a tool', () => {
  const events = [
    'PreToolUse',
    'PostToolUse',
    'PostToolUseFailure',
    'PermissionRequest',
    'PermissionDenied',
  ] as const;
  const server = { name: 'github', source: 'user' };
  test.each(events)('%s carries the server name and source', (event) => {
    const { wire, issues } = build(event, { mcp_server: server });
    expect(issues).toEqual([]);
    expect(wire?.['mcp_server']).toEqual(server);
  });
  test.each(events)('%s has none for a tool that is not an MCP tool', (event) => {
    expect(build(event).wire).not.toHaveProperty('mcp_server');
  });
  test.each(events)('%s refuses a server without a name or a source', (event) => {
    for (const bad of [{ name: 'github' }, { source: 'user' }, { name: 1, source: 'user' }, 'x']) {
      expect(failed(event, { mcp_server: bad }).paths[0]).toStartWith(
        `hooks.${event}.input.mcp_server`,
      );
    }
  });
});

describe('judgment: permission_suggestions of PermissionRequest', () => {
  const suggestion = {
    type: 'addRules',
    rules: [{ toolName: 'Bash', ruleContent: 'git push:*' }],
    behavior: 'allow',
    destination: 'localSettings',
  };
  test('entries arrive unchanged', () => {
    const { wire, issues } = build('PermissionRequest', { permission_suggestions: [suggestion] });
    expect(issues).toEqual([]);
    expect(wire?.['permission_suggestions']).toEqual([suggestion]);
  });
  test('is absent when Claude Code offers none', () => {
    expect(build('PermissionRequest').wire).not.toHaveProperty('permission_suggestions');
  });
  test('an entry without a string type is refused, and the issue names its index', () => {
    for (const bad of [{}, 'addRules', { type: 1 }, null]) {
      const { input, paths } = failed('PermissionRequest', {
        permission_suggestions: [suggestion, bad],
      });
      expect(input).toBeUndefined();
      expect(paths).toEqual(['hooks.PermissionRequest.input.permission_suggestions[1]']);
    }
  });
});

describe('judgment: tool_calls of PostToolBatch', () => {
  const call = { tool_name: 'Read', tool_input: { file_path: '/a' }, tool_use_id: 'toolu_1' };
  test('a call with its response arrives whole', () => {
    const entry = { ...call, tool_response: 'contents' };
    const { wire, issues } = build('PostToolBatch', { tool_calls: [entry] });
    expect(issues).toEqual([]);
    expect(wire?.['tool_calls']).toEqual([entry]);
  });
  test('a call without a response arrives without the key', () => {
    const { wire, issues } = build('PostToolBatch', { tool_calls: [call] });
    expect(issues).toEqual([]);
    expect(wire?.['tool_calls']).toEqual([call]);
    expect(JSON.stringify(wire?.['tool_calls'])).not.toContain('tool_response');
  });
  test.each(['tool_name', 'tool_input', 'tool_use_id'] as const)(
    'a call without %s is refused, and the issue names the entry',
    (field) => {
      const entry: Record<string, unknown> = { ...call };
      delete entry[field];
      const { input, paths } = failed('PostToolBatch', { tool_calls: [call, entry] });
      expect(input).toBeUndefined();
      expect(paths).toEqual([`hooks.PostToolBatch.input.tool_calls[1].${field}`]);
    },
  );
});

describe('judgment: optional text fields', () => {
  const cases = [
    ['Notification', 'title', 'Permission needed'],
    ['UserPromptSubmit', 'session_title', 'Refactor auth'],
    ['UserPromptExpansion', 'command_source', 'plugin'],
  ] as const;
  test.each(cases)('%s: %s arrives when given and is absent when not', (event, field, value) => {
    expect(build(event, { [field]: value }).wire?.[field]).toBe(value);
    expect(build(event).wire).not.toHaveProperty(field);
  });
  test.each(cases)('%s: %s of another type is refused', (event, field) => {
    expect(failed(event, { [field]: 7 }).paths).toEqual([`hooks.${event}.input.${field}`]);
  });
});

describe('judgment: Elicitation, ElicitationResult and ConfigChange', () => {
  test.each(['form', 'url'])('Elicitation and ElicitationResult accept the mode %s', (mode) => {
    expect(build('Elicitation', { mode }).wire?.['mode']).toBe(mode);
    expect(build('ElicitationResult', { mode }).wire?.['mode']).toBe(mode);
  });
  test('a mode other than form or url is refused', () => {
    expect(failed('Elicitation', { mode: 'popup' }).paths).toEqual([
      'hooks.Elicitation.input.mode',
    ]);
    expect(failed('ElicitationResult', { mode: 'popup' }).paths).toEqual([
      'hooks.ElicitationResult.input.mode',
    ]);
  });
  test('Elicitation carries its url, id and requested schema when given', () => {
    const extra = {
      url: 'https://example.com/auth',
      elicitation_id: 'e-1',
      requested_schema: { type: 'object' },
    };
    const { wire, issues } = build('Elicitation', extra);
    expect(issues).toEqual([]);
    expect(wire).toMatchObject(extra);
    expect(failed('Elicitation', { requested_schema: [] }).input).toBeUndefined();
  });
  test.each(['accept', 'decline', 'cancel'])(
    'ElicitationResult accepts the action %s',
    (action) => {
      expect(build('ElicitationResult', { action }).wire?.['action']).toBe(action);
    },
  );
  test('ElicitationResult refuses another action, and carries its content when given', () => {
    expect(failed('ElicitationResult', { action: 'ok' }).paths).toEqual([
      'hooks.ElicitationResult.input.action',
    ]);
    expect(build('ElicitationResult', { content: { name: 'x' } }).wire?.['content']).toEqual({
      name: 'x',
    });
  });
  test.each(['user_settings', 'project_settings', 'local_settings', 'policy_settings', 'skills'])(
    'ConfigChange accepts the source %s',
    (source) => {
      expect(build('ConfigChange', { source }).wire?.['source']).toBe(source);
    },
  );
  test('ConfigChange refuses another source, and its file_path is optional', () => {
    expect(failed('ConfigChange', { source: 'enterprise' }).paths).toEqual([
      'hooks.ConfigChange.input.source',
    ]);
    expect(build('ConfigChange', { file_path: '/p/settings.json' }).wire?.['file_path']).toBe(
      '/p/settings.json',
    );
    expect(build('ConfigChange').wire).not.toHaveProperty('file_path');
  });
});

describe('judgment: context_tokens is a non-negative integer', () => {
  // The tables say "number" and "Tokens"; a token count is whole and never negative (spec/judgments.md).
  const cases = [
    ['PreModelSwitch', {}],
    ['PostModelSwitch', { requested_model: null }],
    ['SessionStart', { source: 'resume' }],
  ] as const;
  test.each(cases)('%s refuses a negative or fractional count', (event, given) => {
    for (const bad of [-1, 1.5]) {
      const { input, issues } = build(event, { ...given, context_tokens: bad });
      expect(input).toBeUndefined();
      expect(issues.map((issue) => issue.path)).toContain(`hooks.${event}.input.context_tokens`);
    }
  });
});
