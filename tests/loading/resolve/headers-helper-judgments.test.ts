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
      serverOf({ url: 'https://h.test/?t=a%20b%2Fc', expandedVariables: ['MY_REGISTRY_TOKEN'] }),
      'plugin',
      TRUSTED,
      contextOf({ environment }),
    );
    expect(ran(plan).environment.CLAUDE_CODE_MCP_SERVER_URL).toBe('https://h.test/?t=REDACTED');
  });

  test('the longer of two overlapping values is replaced first', () => {
    const environment = { SHORT_TOKEN: 'abc', LONG_TOKEN: 'abcdef' };
    const plan = planHeadersHelper(
      serverOf({
        url: 'https://h.test/?a=abcdef&b=abc',
        expandedVariables: ['SHORT_TOKEN', 'LONG_TOKEN'],
      }),
      'plugin',
      TRUSTED,
      contextOf({ environment }),
    );
    expect(ran(plan).environment.CLAUDE_CODE_MCP_SERVER_URL).toBe(
      'https://h.test/?a=REDACTED&b=REDACTED',
    );
  });
});

describe('REDACTED touches only what the URL expanded (judgment)', () => {
  test('a short removed value the URL did not expand never touches the URL', () => {
    const environment = { SOME_API_KEY: '8', FLAG_AUTH: 'true', PROXY_TOKEN: 'http' };
    const plan = planHeadersHelper(
      serverOf({ url: 'https://h:8/x?on=true' }),
      'plugin',
      TRUSTED,
      contextOf({ environment }),
    );
    expect(ran(plan).environment.CLAUDE_CODE_MCP_SERVER_URL).toBe('https://h:8/x?on=true');
  });

  test('only the expanded variable is redacted when another removed one holds the same text', () => {
    const environment = { USED_TOKEN: 'abc', OTHER_TOKEN: 'abc', UNUSED_TOKEN: 'xyz' };
    const plan = planHeadersHelper(
      serverOf({ url: 'https://h.test/abc/xyz', expandedVariables: ['USED_TOKEN'] }),
      'plugin',
      TRUSTED,
      contextOf({ environment }),
    );
    expect(ran(plan).environment.CLAUDE_CODE_MCP_SERVER_URL).toBe('https://h.test/REDACTED/xyz');
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
