/**
 * sub-agents.md, "Choose an effort level" (the `effort` field, the per-invocation parameter, "When
 * a subagent has no `effort` field or parameter"), the `effort` row of "Frontmatter reference";
 * model-config.md, "Adjust effort level" and "Effort level of subagents and teammates";
 * env-vars.md, `CLAUDE_CODE_EFFORT_LEVEL`. The levels a model supports are the host's.
 */
import { describe, expect, test } from 'bun:test';
import { resolveSubagentEffort } from '../../src/agents/launch-model.ts';
import { agentWith } from '../support/launch.ts';
import { spec } from '../support/spec.ts';

const same = { sameModelAsMain: true } as const;

spec('agents.frontmatter.effort', () => {
  test('the field overrides the session level', () => {
    expect(resolveSubagentEffort({ field: 'high', session: 'low', ...same })).toBe('high');
  });

  test('the invocation parameter overrides the field', () => {
    expect(
      resolveSubagentEffort({ invocation: 'max', field: 'low', session: 'medium', ...same }),
    ).toBe('max');
  });

  test('CLAUDE_CODE_EFFORT_LEVEL beats both the parameter and the field', () => {
    expect(resolveSubagentEffort({ env: 'xhigh', invocation: 'max', field: 'low', ...same })).toBe(
      'xhigh',
    );
  });

  test('with no field or parameter the subagent runs at the session level on the main conversation model', () => {
    expect(resolveSubagentEffort({ session: 'low', ...same })).toBe('low');
  });

  test('on another model the session level does not apply', () => {
    expect(resolveSubagentEffort({ session: 'low', sameModelAsMain: false })).toBeUndefined();
  });

  test('on another model the field still applies', () => {
    expect(resolveSubagentEffort({ field: 'max', session: 'low', sameModelAsMain: false })).toBe(
      'max',
    );
  });

  test('the five documented levels pass through from a file', () => {
    for (const level of ['low', 'medium', 'high', 'xhigh', 'max'] as const) {
      const field = agentWith(`effort: ${level}`).definition.effort;
      expect(resolveSubagentEffort({ field, ...same })).toBe(level);
    }
  });

  test('CLAUDE_CODE_EFFORT_LEVEL set to `auto` or `unset` sends no effort level for the session level', () => {
    for (const env of ['auto', 'unset']) {
      expect(resolveSubagentEffort({ env, session: 'high', ...same })).toBeUndefined();
    }
  });
});

describe('judgments (spec/judgments.md)', () => {
  test('CLAUDE_CODE_EFFORT_LEVEL set to `auto` or `unset` also suppresses the invocation parameter and the field', () => {
    for (const env of ['auto', 'unset']) {
      expect(
        resolveSubagentEffort({ env, invocation: 'max', field: 'low', session: 'high', ...same }),
      ).toBeUndefined();
    }
  });

  test('a variable or parameter that names no level is ignored; a numeric field is kept as the SDK allows', () => {
    expect(
      resolveSubagentEffort({ env: 'turbo', invocation: 'ludicrous', field: 'low', ...same }),
    ).toBe('low');
    expect(resolveSubagentEffort({ field: 4096, ...same })).toBe(4096);
  });

  test('a session level that is no level is not sent', () => {
    expect(resolveSubagentEffort({ session: 'ultracode', ...same })).toBeUndefined();
  });
});
