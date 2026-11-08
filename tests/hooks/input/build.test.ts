/**
 * What `buildHookInput` decides where the docs are silent (spec/judgments.md), and its guarantees
 * that no single requirement owns: every event builds from its documented facts, the transports share
 * one JSON, a host's stray or `undefined` fact never reaches a hook, facts never overwrite the session.
 * None of this is `spec(...)`: it is not compatibility.
 */
import { describe, expect, test } from 'bun:test';
import { serializeHookInput, buildHookInput } from '../../../src/hooks/input/index.ts';
import { HOOK_EVENTS } from '../../../src/protocol/hook-events.ts';
import type { PermissionMode } from '../../../src/protocol/official.ts';
import { build, facts, session } from '../../support/hooks-input.ts';

describe('every event', () => {
  test.each(HOOK_EVENTS)('%s builds from its sample facts with no issue', (event) => {
    const { input, issues } = build(event);
    expect(issues).toEqual([]);
    expect(input).toBeDefined();
  });
});

describe('the two transports', () => {
  test('stdin and the HTTP body are one JSON text of the input', () => {
    const built = buildHookInput('PostToolUse', facts('PostToolUse'), session({ promptId: 'p1' }));
    expect(built.input).toBeDefined();
    if (built.input === undefined) return;
    const text = serializeHookInput(built.input);
    expect(JSON.parse(text)).toEqual(built.input);
    expect(text).not.toContain('undefined');
  });
});

describe("facts that are not the event's own", () => {
  test('a fact the host leaves undefined is as absent as one it never set', () => {
    const { wire, issues } = build('StopFailure', { error_details: undefined });
    expect(issues).toEqual([]);
    expect(wire).not.toHaveProperty('error_details');
  });
  test('a field the event does not have is dropped and the host is told', () => {
    const { wire, issues } = build('FileChanged', { extra_field: 1 });
    expect(wire).not.toHaveProperty('extra_field');
    expect(issues.map((issue) => [issue.severity, issue.path])).toEqual([
      ['warning', 'hooks.FileChanged.input.extra_field'],
    ]);
  });
  test('a common field in the facts never overrides the session', () => {
    const { wire } = build(
      'FileChanged',
      { session_id: 'forged', cwd: '/forged' },
      { cwd: '/real' },
    );
    expect(wire?.['session_id']).toBe('s1');
    expect(wire?.['cwd']).toBe('/real');
  });
  test('each mistyped fact is its own error and no input is built', () => {
    const { input, issues } = build('PreModelSwitch', { cache_ttl: '10m', pricing: 'list' });
    expect(input).toBeUndefined();
    expect(issues.map((issue) => issue.path).sort()).toEqual([
      'hooks.PreModelSwitch.input.cache_ttl',
      'hooks.PreModelSwitch.input.pricing',
    ]);
  });
});

describe('judgments', () => {
  test('permission_mode is sent on the events whose docs example shows it', () => {
    const withMode = HOOK_EVENTS.filter(
      (event) => build(event, {}, { permissionMode: 'plan' }).wire?.['permission_mode'] === 'plan',
    );
    expect(withMode).toEqual([
      'PreToolUse',
      'PostToolUse',
      'PostToolUseFailure',
      'PostToolBatch',
      'UserPromptSubmit',
      'UserPromptExpansion',
      'Stop',
      'SubagentStop',
      'PermissionRequest',
      'PermissionDenied',
      'TeammateIdle',
      'TaskCompleted',
    ]);
  });
  test('a text that is not a permission mode is not sent and the host is told', () => {
    const { wire, issues } = build('PreToolUse', {}, { permissionMode: 'yolo' as PermissionMode });
    expect(wire).not.toHaveProperty('permission_mode');
    expect(issues.map((issue) => [issue.severity, issue.path])).toEqual([
      ['warning', 'hooks.PreToolUse.input.permission_mode'],
    ]);
  });
  test('effort is sent on the tool-call events beside the four the docs name', () => {
    const withEffort = HOOK_EVENTS.filter(
      (event) => build(event, {}, { effort: { level: 'high' } }).wire?.['effort'] !== undefined,
    );
    expect(withEffort).toEqual([
      'PreToolUse',
      'PostToolUse',
      'PostToolUseFailure',
      'PostToolBatch',
      'Stop',
      'SubagentStop',
      'PermissionRequest',
      'PermissionDenied',
    ]);
  });
  test("the SDK error type verification_required is accepted beside the docs' twelve", () => {
    expect(build('StopFailure', { error: 'verification_required' }).issues).toEqual([]);
  });
  test('a task of a type the docs do not list carries none of the per-type fields', () => {
    const { wire } = build('Stop', {
      background_tasks: [
        { id: '1', type: 'local_agent', status: 'running', description: 'd', command: 'ls' },
      ],
    });
    expect(wire?.['background_tasks']).toEqual([
      { id: '1', type: 'local_agent', status: 'running', description: 'd' },
    ]);
  });
  test('a model on SessionStart is passed whatever the source', () => {
    expect(build('SessionStart', { source: 'clear', model: 'claude-opus-5' }).wire?.['model']).toBe(
      'claude-opus-5',
    );
  });
  test('PostModelSwitch also accepts the source values of switches Claude Code makes itself', () => {
    expect(build('PostModelSwitch', { source: 'auto', requested_model: null }).issues).toEqual([]);
    expect(build('PostModelSwitch', { source: 'resume' }).issues).toEqual([]);
  });
  test('an empty prompt id, scratchpad or agent id counts as none', () => {
    const { wire } = build(
      'PreToolUse',
      {},
      {
        promptId: '',
        scratchpadDir: '',
        agent: { id: '', type: '' },
      },
    );
    for (const key of ['prompt_id', 'scratchpad_dir', 'agent_id', 'agent_type']) {
      expect(wire).not.toHaveProperty(key);
    }
  });
});
