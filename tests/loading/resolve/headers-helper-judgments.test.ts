/**
 * Where mcp.md is silent about the helper's environment (spec/judgments.md): how `REDACTED` matches a
 * value, and the three variables over an inherited one. Outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import { planHeadersHelper, type HeadersHelperPlan } from '../../../src/index.ts';
import { contextOf, SNAPSHOT, serverOf, TRUSTED } from '../../support/headers-helper.ts';

type Run = Extract<HeadersHelperPlan, { run: true }>;

const ran = (plan: HeadersHelperPlan): Run => {
  if (!plan.run) throw new Error('the helper did not run');
  return plan;
};

describe('REDACTED edge cases (judgment)', () => {
  test('a URL-encoded embedding is redacted too, and an empty value never matches', () => {
    const environment = { ...SNAPSHOT, MY_REGISTRY_TOKEN: 'a b/c', EMPTY_TOKEN: '' };
    const plan = planHeadersHelper(
      serverOf({ url: 'https://h.test/?t=a%20b%2Fc' }),
      'plugin',
      TRUSTED,
      contextOf({ environment }),
    );
    expect(ran(plan).environment.CLAUDE_CODE_MCP_SERVER_URL).toBe('https://h.test/?t=REDACTED');
  });

  test('the longer of two overlapping values is replaced first', () => {
    const environment = { SHORT_TOKEN: 'abc', LONG_TOKEN: 'abcdef' };
    const plan = planHeadersHelper(
      serverOf({ url: 'https://h.test/?a=abcdef&b=abc' }),
      'plugin',
      TRUSTED,
      contextOf({ environment }),
    );
    expect(ran(plan).environment.CLAUDE_CODE_MCP_SERVER_URL).toBe(
      'https://h.test/?a=REDACTED&b=REDACTED',
    );
  });
});

describe('the helper does not see what the host holds back', () => {
  test('the three variables are set over an inherited one of the same name', () => {
    const environment = {
      ...SNAPSHOT,
      CLAUDE_CODE_MCP_SERVER_NAME: 'stale',
      CLAUDE_PLUGIN_ROOT: '/stale',
    };
    const user = ran(planHeadersHelper(serverOf(), 'user', TRUSTED, contextOf({ environment })));
    expect(user.environment.CLAUDE_CODE_MCP_SERVER_NAME).toBe('internal-api');
    expect(user.environment).not.toHaveProperty('CLAUDE_PLUGIN_ROOT');
  });
});
