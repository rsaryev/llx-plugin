/**
 * workflows.md § What the saved script looks like: "Claude Code checks the schema before starting the
 * subagent: when it can prove the schema contradicts itself, the call fails with an error naming the
 * contradiction, and the subagent never starts. One contradiction it can prove is a `required` key that
 * `additionalProperties: false` rules out"; "If the subagent's output still fails validation after five
 * attempts, the call fails with an error that includes the last validation failure. To change the attempt
 * count, set `MAX_STRUCTURED_OUTPUT_RETRIES`" (env-vars.md: "Defaults to 5, a first attempt plus four
 * retries"). What the docs leave open (what else is provable, a bad value) is a judgment.
 */
import { describe, expect, test } from 'bun:test';
import {
  afterInvalidOutput,
  checkAgentSchema,
  structuredOutputAttempts,
} from '../../../src/agents/workflow/index.ts';
import { spec } from '../../support/spec.ts';

const ID = 'workflows.behavior.What the saved script looks like';

spec(ID, () => {
  test('a required key that additionalProperties: false rules out is a contradiction naming the key', () => {
    const issues = checkAgentSchema({
      type: 'object',
      required: ['files', 'count'],
      properties: { files: { type: 'array' } },
      additionalProperties: false,
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe('error');
    expect(issues[0]?.message).toContain('"count"');
  });

  test('the docs schema shape (a required key that is a property) is consistent', () => {
    const schema = {
      type: 'object',
      required: ['files'],
      properties: { files: { type: 'array', items: { type: 'string' } } },
    };
    expect(checkAgentSchema(schema)).toEqual([]);
    expect(checkAgentSchema({ ...schema, additionalProperties: false })).toEqual([]);
  });

  test('output that fails validation five times fails the call with the last validation failure', () => {
    const failures = ['f1', 'f2', 'f3', 'f4'];
    expect(afterInvalidOutput(failures, {})).toEqual({ retry: true });
    const verdict = afterInvalidOutput([...failures, 'missing "files"'], {});
    expect(verdict.retry).toBe(false);
    if (verdict.retry) throw new Error('the call failed');
    expect(verdict.issue.severity).toBe('error');
    expect(verdict.issue.message).toContain('missing "files"');
    expect(verdict.issue.message).not.toContain('f4');
  });

  test('MAX_STRUCTURED_OUTPUT_RETRIES changes that attempt count', () => {
    expect(structuredOutputAttempts({})).toBe(5);
    expect(structuredOutputAttempts({ MAX_STRUCTURED_OUTPUT_RETRIES: '2' })).toBe(2);
    const env = { MAX_STRUCTURED_OUTPUT_RETRIES: '2' };
    expect(afterInvalidOutput(['a'], env)).toEqual({ retry: true });
    expect(afterInvalidOutput(['a', 'b'], env).retry).toBe(false);
    expect(
      afterInvalidOutput(['a', 'b', 'c', 'd', 'e'], { MAX_STRUCTURED_OUTPUT_RETRIES: '7' }),
    ).toEqual({
      retry: true,
    });
  });
});

describe('the schema check and the attempt count (judgments)', () => {
  test('a contradiction is looked for in nested properties and items, with the path of the schema', () => {
    const nested = {
      type: 'object',
      properties: {
        list: {
          type: 'array',
          items: { type: 'object', required: ['a'], properties: {}, additionalProperties: false },
        },
      },
    };
    expect(checkAgentSchema(nested).map((found) => found.path)).toEqual([
      'schema.properties.list.items',
    ]);
  });

  test('only a proof counts: a pattern that may match, a missing type, or additionalProperties other than false is no contradiction', () => {
    const base = { required: ['x'], properties: {}, additionalProperties: false };
    expect(checkAgentSchema({ ...base, type: 'object', patternProperties: { '^x$': {} } })).toEqual(
      [],
    );
    expect(
      checkAgentSchema({ ...base, type: 'object', patternProperties: { '^y$': {} } }),
    ).toHaveLength(1);
    expect(checkAgentSchema({ ...base, type: 'object', patternProperties: { '(': {} } })).toEqual(
      [],
    );
    expect(checkAgentSchema(base)).toEqual([]);
    expect(checkAgentSchema({ ...base, type: 'object', additionalProperties: true })).toEqual([]);
    expect(checkAgentSchema('not a schema')).toEqual([]);
    expect(checkAgentSchema(undefined)).toEqual([]);
  });

  test('an attempt count that is not a positive whole number is no value: the default of five applies', () => {
    for (const value of ['0', '-1', '2.5', 'many', '', '1e3']) {
      expect(structuredOutputAttempts({ MAX_STRUCTURED_OUTPUT_RETRIES: value })).toBe(5);
    }
  });
});
