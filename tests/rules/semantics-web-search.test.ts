/**
 * tools-reference.md § WebSearch tool behavior ("Claude can scope results with `allowed_domains`
 * to include only certain hosts, or `blocked_domains` to exclude them. The two lists can't be
 * combined in a single call.") and hooks.md § WebSearch (`allowed_domains` "only include results
 * from these domains", `blocked_domains` "exclude results from these domains"). The docs do not
 * say how an entry matches a result's host, so the kit claims only the combination rule; the
 * meaning of an empty list and the wording of the refusal are judgments, tested outside spec().
 * § Session search limit ("a limit of 200 WebSearch calls"; "set `CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION`
 * to a positive whole number ... The cap can be raised but not turned off"; "refills at about 100
 * calls per hour"; "In non-interactive mode with `-p` and in the Agent SDK, the limit applies per
 * turn") and env-vars.md give the arithmetic; counting the calls is the host's.
 */
import { describe, expect, test } from 'bun:test';
import {
  validateWebSearchDomains,
  webSearchAllowance,
  webSearchLimits,
} from '../../src/rules/index.ts';
import { fakeEnvironment } from '../support/ports.ts';
import { spec } from '../support/spec.ts';

const env = (record: Record<string, string> = {}) => fakeEnvironment(record);
const interactive = { interactive: true };
const print = { interactive: false };
const HOUR = 3_600_000;

spec('tools.input.WebSearch.allowed_domains', () => {
  test('the hooks.md example alone is a valid call', () => {
    expect(
      validateWebSearchDomains({ query: 'react', allowed_domains: ['docs.example.com'] }),
    ).toEqual([]);
  });

  test('"The two lists can\'t be combined in a single call": allowed with blocked is refused', () => {
    const issues = validateWebSearchDomains({
      query: 'react',
      allowed_domains: ['docs.example.com'],
      blocked_domains: ['spam.example.com'],
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe('error');
    expect(issues[0]?.path).toBe('tool_input');
    expect(issues[0]?.message).toContain('allowed_domains');
    expect(issues[0]?.message).toContain('blocked_domains');
  });

  test('several allowed domains are one list and are valid', () => {
    expect(validateWebSearchDomains({ allowed_domains: ['a.com', 'b.org'] })).toEqual([]);
  });
});

spec('tools.input.WebSearch.blocked_domains', () => {
  test('the hooks.md example alone is a valid call', () => {
    expect(
      validateWebSearchDomains({ query: 'react', blocked_domains: ['spam.example.com'] }),
    ).toEqual([]);
  });

  test('blocked with allowed is refused, in either order', () => {
    expect(
      validateWebSearchDomains({ blocked_domains: ['b.com'], allowed_domains: ['a.com'] }),
    ).toHaveLength(1);
  });

  test('a call with neither list is valid', () => {
    expect(validateWebSearchDomains({ query: 'react hooks best practices' })).toEqual([]);
  });
});

spec('tools.tool.WebSearch', () => {
  test('a call that combines the lists is refused whatever else it carries', () => {
    expect(
      validateWebSearchDomains({
        query: 'q',
        mode: 'standard',
        allowed_domains: ['a.com'],
        blocked_domains: ['b.com'],
      }),
    ).toHaveLength(1);
  });

  test('an interactive session has a limit of 200 calls, and the allowance is what is left of it', () => {
    const limits = webSearchLimits(env(), interactive);
    expect(limits.cap).toBe(200);
    expect(webSearchAllowance(limits, { used: 0, elapsedMs: 0 })).toBe(200);
    expect(webSearchAllowance(limits, { used: 150, elapsedMs: 0 })).toBe(50);
    expect(webSearchAllowance(limits, { used: 200, elapsedMs: 0 })).toBe(0);
    expect(webSearchAllowance(limits, { used: 500, elapsedMs: 0 })).toBe(0);
  });

  test('CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION raises the cap, and anything but a positive whole number is ignored', () => {
    expect(
      webSearchLimits(env({ CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION: '500' }), interactive).cap,
    ).toBe(500);
    for (const value of ['0', '-1', '2.5', 'off', 'unlimited', '']) {
      const limits = webSearchLimits(
        env({ CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION: value }),
        interactive,
      );
      expect(limits.cap).toBe(200);
    }
  });

  test('an interactive limit refills at about 100 calls per hour', () => {
    const limits = webSearchLimits(env(), interactive);
    expect(limits.refillPerHour).toBe(100);
    expect(webSearchAllowance(limits, { used: 200, elapsedMs: HOUR })).toBe(100);
    expect(webSearchAllowance(limits, { used: 200, elapsedMs: 2 * HOUR })).toBe(200);
    expect(webSearchAllowance(limits, { used: 200, elapsedMs: 10 * HOUR })).toBe(200);
  });

  test('CLAUDE_CODE_WEB_SEARCH_REFILLS_PER_HOUR sets the rate, 0 turns the refill off, and other spellings read as unset', () => {
    const half = webSearchLimits(
      env({ CLAUDE_CODE_WEB_SEARCH_REFILLS_PER_HOUR: '50' }),
      interactive,
    );
    expect(webSearchAllowance(half, { used: 200, elapsedMs: HOUR })).toBe(50);
    const off = webSearchLimits(env({ CLAUDE_CODE_WEB_SEARCH_REFILLS_PER_HOUR: '0' }), interactive);
    expect(off.refillPerHour).toBe(0);
    expect(webSearchAllowance(off, { used: 200, elapsedMs: 5 * HOUR })).toBe(0);
    for (const value of ['1.5', 'fast', '-3']) {
      const limits = webSearchLimits(
        env({ CLAUDE_CODE_WEB_SEARCH_REFILLS_PER_HOUR: value }),
        interactive,
      );
      expect(limits.refillPerHour).toBe(100);
    }
  });

  test('with -p and in the Agent SDK the limit applies per turn, and the refill is off unless a rate is set', () => {
    const limits = webSearchLimits(env(), print);
    expect(limits.perTurn).toBe(true);
    expect(limits.cap).toBe(200);
    expect(limits.refillPerHour).toBe(0);
    expect(webSearchAllowance(limits, { used: 200, elapsedMs: 5 * HOUR })).toBe(0);
    expect(webSearchLimits(env(), interactive).perTurn).toBe(false);
    const rated = webSearchLimits(env({ CLAUDE_CODE_WEB_SEARCH_REFILLS_PER_HOUR: '20' }), print);
    expect(webSearchAllowance(rated, { used: 200, elapsedMs: HOUR })).toBe(20);
  });
});

describe('judgments (spec/judgments.md): what the docs leave open in WebSearch', () => {
  test('an empty list or an absent field is not a list: it does not combine', () => {
    expect(validateWebSearchDomains({ allowed_domains: [], blocked_domains: ['b.com'] })).toEqual(
      [],
    );
    expect(validateWebSearchDomains({ allowed_domains: ['a.com'], blocked_domains: [] })).toEqual(
      [],
    );
    expect(validateWebSearchDomains({ allowed_domains: [], blocked_domains: [] })).toEqual([]);
  });

  test('an input that is not an object, and fields that are not lists, are left to parseToolInput', () => {
    expect(validateWebSearchDomains('x')).toEqual([]);
    expect(
      validateWebSearchDomains({ allowed_domains: 'a.com', blocked_domains: 'b.com' }),
    ).toEqual([]);
  });

  test('a value below 200 lowers the cap, and a refill never gives back more than was used', () => {
    expect(
      webSearchLimits(env({ CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION: '10' }), interactive).cap,
    ).toBe(10);
    const limits = webSearchLimits(env(), interactive);
    expect(webSearchAllowance(limits, { used: 30, elapsedMs: 3 * HOUR })).toBe(200);
  });

  test('the refill is continuous and rounded down', () => {
    const limits = webSearchLimits(env(), interactive);
    expect(webSearchAllowance(limits, { used: 200, elapsedMs: HOUR / 2 })).toBe(50);
    expect(webSearchAllowance(limits, { used: 200, elapsedMs: HOUR / 100 - 1 })).toBe(0);
  });
});
