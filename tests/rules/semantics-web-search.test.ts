/**
 * tools-reference.md § WebSearch tool behavior ("Claude can scope results with `allowed_domains`
 * to include only certain hosts, or `blocked_domains` to exclude them. The two lists can't be
 * combined in a single call.") and hooks.md § WebSearch (`allowed_domains` "only include results
 * from these domains", `blocked_domains` "exclude results from these domains"). The docs do not
 * say how an entry matches a result's host, so the kit claims only the combination rule; the
 * meaning of an empty list and the wording of the refusal are judgments, tested outside spec().
 */
import { describe, expect, test } from 'bun:test';
import { validateWebSearchDomains } from '../../src/rules/index.ts';
import { spec } from '../support/spec.ts';

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
});
