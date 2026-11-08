/**
 * hooks.md § the input section of each event ("DirectoryAdded input", "FileChanged input",
 * "InstructionsLoaded input", "MessageDisplay input", "PermissionDenied input", "PostToolUse input",
 * "PostToolUseFailure input", "PreModelSwitch input", "SessionStart input", "StopFailure input",
 * "TaskCreated input", "TaskCompleted input", "TeammateIdle input"): the event's own fields, the
 * type and values the tables give each, and which of them the docs call optional or "may be absent".
 *
 * Most of these fields are values the host knows and the kit only carries, so what is proven is typed
 * delivery: the documented value arrives in the JSON a hook reads, a value of another type or outside
 * the documented values is refused as an error issue (and no input is built), a required field that
 * is missing is refused, and an optional one that is missing is absent from the JSON. The rules that
 * depend on another field (cost fields by `source`, `globs` by `load_reason`) are in conditional.test.ts.
 */
import { describe, expect, test } from 'bun:test';
import type { HookEvent } from '../../../src/protocol/official.ts';
import { spec } from '../../support/spec.ts';
import { build } from '../../support/hooks-input.ts';

interface Field {
  readonly event: HookEvent;
  readonly name: string;
  /** Values the docs give the field; each must arrive unchanged. */
  readonly good: readonly unknown[];
  /** Values the docs rule out. */
  readonly bad: readonly unknown[];
  /** The docs call it optional or say it may be absent. */
  readonly optional?: true;
  /** Other facts the field needs to be sent at all. */
  readonly given?: Readonly<Record<string, unknown>>;
}

const FIELDS: readonly Field[] = [
  { event: 'DirectoryAdded', name: 'directory', good: ['/Users/my-other-repo'], bad: [7, null] },
  {
    event: 'DirectoryAdded',
    name: 'source',
    good: ['slash_command', 'register_repo_root'],
    bad: ['add-dir', 1],
  },
  { event: 'FileChanged', name: 'file_path', good: ['/Users/my-project/.envrc'], bad: [7, null] },
  { event: 'FileChanged', name: 'event', good: ['change', 'add', 'unlink'], bad: ['rename', 0] },
  {
    event: 'InstructionsLoaded',
    name: 'file_path',
    good: ['/Users/my-project/CLAUDE.md'],
    bad: [7, null],
  },
  {
    event: 'InstructionsLoaded',
    name: 'memory_type',
    good: ['User', 'Project', 'Local', 'Managed'],
    bad: ['project', 'Team'],
  },
  {
    event: 'InstructionsLoaded',
    name: 'load_reason',
    good: ['session_start', 'nested_traversal', 'path_glob_match', 'include', 'compact'],
    bad: ['startup', 3],
  },
  {
    event: 'InstructionsLoaded',
    name: 'globs',
    good: [['src/**/*.ts', 'lib/*.js'], []],
    bad: ['src/**', [1]],
    optional: true,
    given: { load_reason: 'path_glob_match' },
  },
  {
    event: 'InstructionsLoaded',
    name: 'trigger_file_path',
    good: ['/Users/my-project/src/a.ts'],
    bad: [7],
    optional: true,
    given: { load_reason: 'nested_traversal' },
  },
  {
    event: 'InstructionsLoaded',
    name: 'parent_file_path',
    good: ['/Users/my-project/CLAUDE.md'],
    bad: [7],
    optional: true,
    given: { load_reason: 'include' },
  },
  {
    event: 'MessageDisplay',
    name: 'turn_id',
    good: ['0c9e6a2f-7d41-4f4e-9a15-3f4f7c2b8d10'],
    bad: [1, null],
  },
  {
    event: 'MessageDisplay',
    name: 'message_id',
    good: ['5b2a9c8e-1f63-4d8a-b7c4-9e0d2a6f1c3b'],
    bad: [1, null],
  },
  { event: 'MessageDisplay', name: 'index', good: [0, 3], bad: [-1, 1.5, '0'] },
  { event: 'MessageDisplay', name: 'final', good: [true, false], bad: ['true', 1] },
  {
    event: 'MessageDisplay',
    // "the final batch's delta is empty when the message ends on a newline".
    name: 'delta',
    good: ['Here is the plan:\n', ''],
    bad: [1, null],
  },
  {
    event: 'PermissionDenied',
    name: 'reason',
    good: ['[Irreversible Local Destruction]', 'Classifier unavailable'],
    bad: [7, null],
  },
  {
    event: 'PostToolUse',
    name: 'duration_ms',
    good: [12, 0],
    bad: ['12', -1],
    optional: true,
  },
  {
    event: 'PostToolUseFailure',
    name: 'duration_ms',
    good: [4187],
    bad: ['4187', -1],
    optional: true,
  },
  {
    event: 'PostToolUseFailure',
    name: 'error',
    good: ["Exit code 1\nError: Cannot find module 'express'"],
    bad: [1, null],
  },
  {
    event: 'PostToolUseFailure',
    name: 'is_interrupt',
    good: [true, false],
    bad: ['false', 0],
    optional: true,
  },
  { event: 'PreModelSwitch', name: 'from_model', good: ['claude-sonnet-5'], bad: [1, null] },
  { event: 'PreModelSwitch', name: 'to_model', good: ['claude-opus-5'], bad: [1, null] },
  {
    event: 'PreModelSwitch',
    // "string or null": an alias, a full id, or null for the default model.
    name: 'requested_model',
    good: ['opus', 'claude-opus-5', null],
    bad: [5, undefined],
  },
  {
    event: 'PreModelSwitch',
    name: 'source',
    // PostModelSwitch has two more values ("auto", "resume"); PreModelSwitch does not.
    good: ['command', 'picker', 'sdk'],
    bad: ['auto', 'resume'],
  },
  { event: 'PreModelSwitch', name: 'context_tokens', good: [182340, 0], bad: [-1, 1.5, '1'] },
  {
    event: 'PreModelSwitch',
    name: 'prompt_cache_warm',
    good: [true, false],
    bad: ['yes', 1],
  },
  { event: 'PreModelSwitch', name: 'cache_ttl', good: ['5m', '1h'], bad: ['10m', 300] },
  {
    event: 'PreModelSwitch',
    name: 'estimated_cache_write_usd',
    good: [1.1396, 0],
    bad: ['1.13', -0.5],
  },
  {
    event: 'PreModelSwitch',
    name: 'pricing',
    good: ['configured', 'catalog', 'default'],
    bad: ['list', 1],
  },
  {
    event: 'SessionStart',
    name: 'source',
    good: ['startup', 'resume', 'clear', 'compact', 'fork'],
    bad: ['launch', 1],
  },
  {
    event: 'SessionStart',
    name: 'model',
    good: ['claude-opus-5'],
    bad: [1],
    optional: true,
  },
  {
    event: 'SessionStart',
    name: 'session_title',
    good: ['Refactor auth'],
    bad: [1],
    optional: true,
  },
  {
    event: 'StopFailure',
    name: 'error',
    good: [
      'rate_limit',
      'overloaded',
      'authentication_failed',
      'oauth_org_not_allowed',
      'account_on_hold',
      'billing_error',
      'invalid_request',
      'model_not_found',
      'server_error',
      'max_output_tokens',
      'cloud_credential_error',
      'unknown',
    ],
    bad: ['teapot', 429],
  },
  {
    event: 'StopFailure',
    name: 'error_details',
    good: ['429 Too Many Requests'],
    bad: [429],
    optional: true,
  },
  {
    event: 'StopFailure',
    name: 'last_assistant_message',
    good: ['API Error: Rate limit reached'],
    bad: [1],
    optional: true,
  },
  ...(['TaskCreated', 'TaskCompleted'] as const).flatMap((event): Field[] => [
    { event, name: 'task_id', good: ['task-001'], bad: [1, null] },
    { event, name: 'task_subject', good: ['Implement user authentication'], bad: [1, null] },
    {
      event,
      name: 'task_description',
      good: ['Add login and signup endpoints'],
      bad: [1],
      optional: true,
    },
    { event, name: 'teammate_name', good: ['implementer'], bad: [1], optional: true },
    { event, name: 'team_name', good: ['session-a1b2c3d4'], bad: [1], optional: true },
  ]),
  { event: 'TeammateIdle', name: 'teammate_name', good: ['researcher'], bad: [1, null] },
  { event: 'TeammateIdle', name: 'team_name', good: ['session-a1b2c3d4'], bad: [1, null] },
];

/** The issue is about the field itself or an element inside it. */
const underPath = (issuePath: string, path: string): boolean =>
  issuePath === path || issuePath.startsWith(`${path}.`);

for (const field of FIELDS) {
  const id = `hooks.input.${field.event}.${field.name}`;
  const path = `hooks.${field.event}.input.${field.name}`;
  spec(id, () => {
    test.each(field.good.map((value) => [value]))('the value %p arrives in the input', (value) => {
      const { wire, issues } = build(field.event, { ...field.given, [field.name]: value });
      expect(issues).toEqual([]);
      expect(wire?.[field.name]).toEqual(value);
    });
    test.each(field.bad.map((value) => [value]))('the value %p is refused', (value) => {
      const { input, issues } = build(field.event, { ...field.given, [field.name]: value });
      expect(input).toBeUndefined();
      expect(
        issues.some((issue) => issue.severity === 'error' && underPath(issue.path, path)),
      ).toBe(true);
    });
    if (field.optional === true) {
      test('is absent from the input when the event has none', () => {
        const { wire, issues } = build(field.event, { ...field.given, [field.name]: undefined });
        expect(issues).toEqual([]);
        expect(wire).toBeDefined();
        expect(wire).not.toHaveProperty(field.name);
      });
    } else {
      test('is required: an input without it is refused', () => {
        const { input, issues } = build(field.event, { ...field.given, [field.name]: undefined });
        expect(input).toBeUndefined();
        expect(issues.map((issue) => issue.path)).toContain(path);
      });
    }
  });
}

describe('the sample input of each event in this file', () => {
  test('builds with no issue', () => {
    for (const event of new Set(FIELDS.map((field) => field.event))) {
      expect(build(event).issues).toEqual([]);
    }
  });
});
