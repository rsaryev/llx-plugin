/**
 * permissions.md § Allow or deny every fetch (bare `WebFetch` against `WebFetch(domain:*)`, in allow
 * and deny, and the sandbox domain list); sandboxing.md § Network isolation (the wildcard forms the
 * sandbox honors). The effect on the sandbox is returned as data: which list a rule adds which domain
 * to, or nothing.
 */
import { expect, test } from 'bun:test';
import { sandboxDomainEntry, sandboxDomainLists } from '../../src/rules/index.ts';
import { parsed } from '../support/rule-context.ts';
import { fetchCovered } from '../support/target-rules.ts';
import { spec } from '../support/spec.ts';

const BEHAVIORS = ['allow', 'ask', 'deny'] as const;

spec('permissions.rule.WebFetch', () => {
  const urls = ['https://example.com/', 'https://a.b.test/x', 'http://localhost:3000/'];

  test('a bare rule and the domain:* rule both cover every URL, for allow, ask and deny', () => {
    for (const behavior of BEHAVIORS) {
      for (const url of urls) {
        for (const rule of ['WebFetch', 'WebFetch(domain:*)']) {
          expect([rule, behavior, url, fetchCovered(rule, url, behavior)]).toEqual([
            rule,
            behavior,
            url,
            true,
          ]);
        }
      }
    }
  });

  test('they are not the same rule: bare has no specifier, domain:* is a domain pattern', () => {
    expect(parsed('WebFetch').specifier).toBe(undefined);
    expect(parsed('WebFetch(domain:*)').specifier).toEqual({ form: 'domain', pattern: '*' });
  });

  test('only the domain: form adds its domain to the sandbox list (allow: allowed, deny: denied)', () => {
    expect(sandboxDomainEntry(parsed('WebFetch(domain:*)', 'allow'))).toEqual({
      list: 'allowed',
      domain: '*',
    });
    expect(sandboxDomainEntry(parsed('WebFetch(domain:*)', 'deny'))).toEqual({
      list: 'denied',
      domain: '*',
    });
    expect(sandboxDomainEntry(parsed('WebFetch', 'allow'))).toBe(undefined);
    expect(sandboxDomainEntry(parsed('WebFetch', 'deny'))).toBe(undefined);
  });

  test('a domain rule adds its domain as written, normalised like a hostname', () => {
    expect(sandboxDomainEntry(parsed('WebFetch(domain:Example.com.)', 'allow'))).toEqual({
      list: 'allowed',
      domain: 'example.com',
    });
    expect(sandboxDomainEntry(parsed('WebFetch(domain:*.example.com)', 'allow'))).toEqual({
      list: 'allowed',
      domain: '*.example.com',
    });
  });

  test('an ask rule adds nothing to either list, and no other tool has a domain list', () => {
    expect(sandboxDomainEntry(parsed('WebFetch(domain:example.com)', 'ask'))).toBe(undefined);
    expect(sandboxDomainEntry(parsed('WebSearch', 'allow'))).toBe(undefined);
    expect(sandboxDomainEntry(parsed('Bash(curl *)', 'allow'))).toBe(undefined);
  });

  test('a wildcard the sandbox does not honor still matches fetches and adds nothing to a list', () => {
    const rule = parsed('WebFetch(domain:example.*)', 'allow');
    expect(sandboxDomainEntry(rule)).toBe(undefined);
    expect(fetchCovered('WebFetch(domain:example.*)', 'https://example.org', 'allow')).toBe(true);
    expect(sandboxDomainEntry(parsed('WebFetch(domain:a.*.example.com)', 'deny'))).toBe(undefined);
  });

  test('the lists of a rule set hold the domain: rules of allow and deny, in order', () => {
    const rules = [
      parsed('WebFetch', 'allow'),
      parsed('WebFetch(domain:github.com)', 'allow'),
      parsed('WebFetch(domain:*.npmjs.org)', 'allow'),
      parsed('WebFetch(domain:example.*)', 'allow'),
      parsed('WebFetch(domain:evil.com)', 'deny'),
      parsed('WebFetch', 'deny'),
      parsed('WebFetch(domain:ask.example.com)', 'ask'),
      parsed('Bash(curl *)', 'allow'),
    ];
    expect(sandboxDomainLists(rules)).toEqual({
      allowedDomains: ['github.com', '*.npmjs.org'],
      deniedDomains: ['evil.com'],
    });
  });
});
