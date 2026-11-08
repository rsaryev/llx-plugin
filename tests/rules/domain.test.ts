/**
 * permissions.md § WebFetch (the `domain:` prefix, case, trailing dot, `*.`, bare `*`, a `*` between
 * dots) and § Allow or deny every fetch (bare `WebFetch` against `WebFetch(domain:*)`, the sandbox
 * domain list); sandboxing.md § Network isolation (the wildcard forms the sandbox honors, IPv6 in
 * brackets); hooks.md § WebFetch (`url`); tools-reference.md § Tools reference (WebFetch).
 *
 * Each documented bullet is a call the rule must (not) cover, for allow, ask and deny alike. Where
 * the docs are silent (a URL that does not parse, a specifier without `domain:`) the test sits
 * outside spec() and the choice is a row in spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import { evaluateRules, matchDomainPattern, parseRule } from '../../src/rules/index.ts';
import { call, matchContext, parsed } from '../support/rule-context.ts';
import { fetchCovered } from '../support/target-rules.ts';
import { spec } from '../support/spec.ts';

const BEHAVIORS = ['allow', 'ask', 'deny'] as const;

spec(
  [
    'permissions.rule.WebFetch(domain:example.com)',
    'permissions.reference.Permission rule syntax.WebFetch(domain:example.com)',
  ],
  () => {
    test('matches requests to example.com, whatever the scheme, port, path and query', () => {
      for (const url of [
        'https://example.com',
        'https://example.com/',
        'http://example.com/a/b?q=1#top',
        'https://example.com:8443/docs',
      ]) {
        for (const behavior of BEHAVIORS) {
          expect([
            url,
            behavior,
            fetchCovered('WebFetch(domain:example.com)', url, behavior),
          ]).toEqual([url, behavior, true]);
        }
      }
    });

    test('does not cover subdomains: example.com only', () => {
      for (const url of ['https://api.example.com', 'https://a.b.example.com/x']) {
        expect([url, fetchCovered('WebFetch(domain:example.com)', url)]).toEqual([url, false]);
      }
    });

    test('matches the hostname of the URL, not text elsewhere in it', () => {
      for (const url of [
        'https://example.com.evil.com/',
        'https://evil.com/example.com',
        'https://evil.com/?u=https://example.com',
        'https://example.com@evil.com/',
        'https://notexample.com',
      ]) {
        expect([url, fetchCovered('WebFetch(domain:example.com)', url)]).toEqual([url, false]);
      }
      expect(fetchCovered('WebFetch(domain:example.com)', 'https://evil.com@example.com/')).toBe(
        true,
      );
    });

    test('is case-insensitive in the rule and in the hostname', () => {
      expect(fetchCovered('WebFetch(domain:Example.COM)', 'https://example.com/')).toBe(true);
      expect(fetchCovered('WebFetch(domain:example.com)', 'https://EXAMPLE.com/')).toBe(true);
      expect(fetchCovered('WebFetch(domain:*.Example.com)', 'https://API.example.COM/')).toBe(true);
    });

    test('strips a trailing dot from the rule and from the hostname', () => {
      expect(fetchCovered('WebFetch(domain:example.com.)', 'https://example.com/')).toBe(true);
      expect(fetchCovered('WebFetch(domain:example.com)', 'https://example.com./')).toBe(true);
      expect(fetchCovered('WebFetch(domain:example.com.)', 'https://example.com./')).toBe(true);
      expect(fetchCovered('WebFetch(domain:*.example.com.)', 'https://api.example.com/')).toBe(
        true,
      );
    });

    test('a leading *. covers any subdomain at any depth, not the domain itself', () => {
      const rule = 'WebFetch(domain:*.example.com)';
      for (const url of [
        'https://api.example.com',
        'https://a.b.example.com',
        'https://a.b.c.example.com/x',
      ]) {
        expect([url, fetchCovered(rule, url)]).toEqual([url, true]);
      }
      for (const url of [
        'https://example.com',
        'https://notexample.com',
        'https://example.com.evil.com',
      ]) {
        expect([url, fetchCovered(rule, url)]).toEqual([url, false]);
      }
    });

    test('a bare * covers every domain', () => {
      for (const url of [
        'https://example.com',
        'https://a.b.c.d/',
        'http://localhost:3000',
        'http://[::1]/',
      ]) {
        expect([url, fetchCovered('WebFetch(domain:*)', url)]).toEqual([url, true]);
      }
    });

    test('a * in any other position stands for the text between two dots only', () => {
      const rule = 'WebFetch(domain:example.*)';
      expect(fetchCovered(rule, 'https://example.org')).toBe(true);
      expect(fetchCovered(rule, 'https://example.com/path')).toBe(true);
      expect(fetchCovered(rule, 'https://example.evil.com')).toBe(false);
      expect(fetchCovered(rule, 'https://sub.example.org')).toBe(false);
      expect(fetchCovered(rule, 'https://example')).toBe(false);

      expect(fetchCovered('WebFetch(domain:api.*.example.com)', 'https://api.eu.example.com')).toBe(
        true,
      );
      expect(
        fetchCovered('WebFetch(domain:api.*.example.com)', 'https://api.a.b.example.com'),
      ).toBe(false);
      expect(
        fetchCovered('WebFetch(domain:docs-*.example.com)', 'https://docs-v2.example.com'),
      ).toBe(true);
      expect(fetchCovered('WebFetch(domain:docs-*.example.com)', 'https://other.example.com')).toBe(
        false,
      );
      expect(fetchCovered('WebFetch(domain:*.example.*)', 'https://a.b.example.org')).toBe(true);
      expect(fetchCovered('WebFetch(domain:*.example.*)', 'https://a.example.evil.org')).toBe(
        false,
      );
    });

    test('matchDomainPattern is the same rule over a pattern and a URL', () => {
      expect(matchDomainPattern('*.example.com', 'https://a.b.example.com/x')).toBe(true);
      expect(matchDomainPattern('example.*', 'https://example.evil.com')).toBe(false);
    });

    test('whitespace around the pattern is not part of it', () => {
      expect(fetchCovered('WebFetch(domain: example.com )', 'https://example.com/')).toBe(true);
      expect(fetchCovered('WebFetch( domain : example.com)', 'https://example.com/')).toBe(true);
    });
  },
);

spec('tools.input.WebFetch.url', () => {
  test('the rule is read against the hostname of the call url', () => {
    const rule = parsed('WebFetch(domain:docs.example.com)', 'deny');
    const fetch = (url: unknown) =>
      evaluateRules([rule], call('WebFetch', { url, prompt: 'p' }), matchContext).behavior;
    expect(fetch('https://docs.example.com/guide?page=2')).toBe('deny');
    expect(fetch('https://example.com/docs.example.com')).toBe(undefined);
  });

  test('a call without a string url matches no domain rule', () => {
    for (const input of [
      { prompt: 'p' },
      { url: 5, prompt: 'p' },
      { url: null },
      'https://example.com',
      null,
    ]) {
      const rule = parsed('WebFetch(domain:*)', 'deny');
      expect(evaluateRules([rule], call('WebFetch', input), matchContext).behavior).toBe(undefined);
    }
  });

  test('a url parameter rule is ignored with a warning: the domain form is how a rule reads the url', () => {
    const { rule, issues } = parseRule('WebFetch(url:https://example.com)', {
      behavior: 'deny',
      source: { kind: 'user' },
    });
    expect(rule).toBe(undefined);
    expect(issues.map((found) => found.severity)).toEqual(['warning']);
    expect(issues[0]?.message).toContain('WebFetch(domain:host)');
  });
});

const fetch = (rules: ReturnType<typeof parsed>[], url: string) =>
  evaluateRules(rules, call('WebFetch', { url, prompt: 'p' }), matchContext).behavior;

spec('tools.tool.WebFetch', () => {
  test('deny, ask and allow rules by domain order as for every tool: a broad deny beats a narrower allow', () => {
    const rules = [
      parsed('WebFetch(domain:docs.example.com)', 'allow'),
      parsed('WebFetch(domain:*.example.com)', 'deny'),
      parsed('WebFetch(domain:example.com)', 'ask'),
    ];
    expect(fetch(rules, 'https://docs.example.com/')).toBe('deny');
    expect(fetch(rules, 'https://example.com/')).toBe('ask');
    expect(fetch(rules, 'https://other.test/')).toBe(undefined);
  });

  test('allowing github.com and denying curl is the documented setup: only that host is fetched, and curl is refused', () => {
    const rules = [parsed('WebFetch(domain:github.com)', 'allow'), parsed('Bash(curl *)', 'deny')];
    expect(fetch(rules, 'https://github.com/rsaryev/x')).toBe('allow');
    expect(fetch(rules, 'https://gist.github.com/x')).toBe(undefined);
    const bash = (command: string) =>
      evaluateRules(rules, call('Bash', { command }), matchContext).behavior;
    expect(bash('curl https://github.com/rsaryev/x')).toBe('deny');
    expect(bash('curl -L https://example.com')).toBe('deny');
    expect(bash('ls')).toBe(undefined);
  });

  test('a domain rule of WebFetch never covers another tool', () => {
    const rule = parsed('WebFetch(domain:*)', 'deny');
    expect(evaluateRules([rule], call('WebSearch', { query: 'q' }), matchContext).behavior).toBe(
      undefined,
    );
    expect(
      evaluateRules([rule], call('Bash', { command: 'curl https://example.com' }), matchContext)
        .behavior,
    ).toBe(undefined);
  });
});

describe('IPv6 addresses in a domain rule (sandboxing.md § Network isolation)', () => {
  test('[::1] matches that address on every port, [::1]:443 on port 443 only', () => {
    expect(fetchCovered('WebFetch(domain:[::1])', 'http://[::1]/')).toBe(true);
    expect(fetchCovered('WebFetch(domain:[::1])', 'http://[::1]:8080/x')).toBe(true);
    expect(fetchCovered('WebFetch(domain:[::1]:443)', 'https://[::1]/')).toBe(true);
    expect(fetchCovered('WebFetch(domain:[::1]:443)', 'https://[::1]:443/')).toBe(true);
    expect(fetchCovered('WebFetch(domain:[::1]:443)', 'https://[::1]:8443/')).toBe(false);
    expect(fetchCovered('WebFetch(domain:[::1]:443)', 'http://[::1]/')).toBe(false);
    expect(fetchCovered('WebFetch(domain:[::1])', 'http://[::2]/')).toBe(false);
  });

  test('an address is the same address however it is spelled', () => {
    expect(fetchCovered('WebFetch(domain:[0:0:0:0:0:0:0:1])', 'http://[::1]/')).toBe(true);
    expect(fetchCovered('WebFetch(domain:[::1])', 'http://[0:0:0:0:0:0:0:1]/')).toBe(true);
  });
});

describe('what the docs leave open about WebFetch rules (spec/judgments.md)', () => {
  test('a URL that does not parse has no hostname, so no domain rule matches it', () => {
    for (const url of ['not a url', 'example.com', '', 'mailto:a@example.com']) {
      expect([url, fetchCovered('WebFetch(domain:*)', url)]).toEqual([url, false]);
    }
  });

  test('a rule with non-ASCII labels meets the host as URL.hostname spells it (punycode)', () => {
    for (const rule of ['WebFetch(domain:bücher.de)', 'WebFetch(domain:xn--bcher-kva.de)']) {
      expect([rule, fetchCovered(rule, 'https://bücher.de/')]).toEqual([rule, true]);
      expect([rule, fetchCovered(rule, 'https://xn--bcher-kva.de/x')]).toEqual([rule, true]);
    }
    expect(fetchCovered('WebFetch(domain:*.bücher.de)', 'https://shop.bücher.de/')).toBe(true);
    expect(fetchCovered('WebFetch(domain:BÜCHER.de.)', 'https://bücher.de/')).toBe(true);
    expect(fetchCovered('WebFetch(domain:bücher.de)', 'https://bucher.de/')).toBe(false);
    expect(fetchCovered('WebFetch(domain:bücher.de)', 'https://evil.de/')).toBe(false);
  });

  test('a specifier without the domain: prefix matches nothing', () => {
    for (const behavior of BEHAVIORS) {
      expect(fetchCovered('WebFetch(example.com)', 'https://example.com/', behavior)).toBe(false);
    }
  });
});
