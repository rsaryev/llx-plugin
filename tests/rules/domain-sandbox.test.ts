/**
 * permissions.md § Allow or deny every fetch (bare `WebFetch` against `WebFetch(domain:*)`, in allow
 * and deny, the sandbox domain list, and reads of artifacts: an `Artifact` call with `action: read`);
 * artifacts.md § Disable artifacts (a bare `WebFetch` rule does not block artifact reads);
 * sandboxing.md § Network isolation (the wildcard forms the sandbox honors). The effect on the
 * sandbox is returned as data: which list a rule adds which domain to, or nothing.
 */
import { describe, expect, test } from 'bun:test';
import { evaluateRules, sandboxDomainEntry, sandboxDomainLists } from '../../src/rules/index.ts';
import { call, matchContext, parsed } from '../support/rule-context.ts';
import { fetchCovered } from '../support/target-rules.ts';
import { spec } from '../support/spec.ts';

const BEHAVIORS = ['allow', 'ask', 'deny'] as const;

/** An artifact read as the SDK's `ArtifactInput` spells it: the Artifact tool's `read` action. */
const ARTIFACT_URL = 'https://claude.ai/artifact/0a1b2c3d';
const artifactRead = call('Artifact', { action: 'read', url: ARTIFACT_URL });
const verdict = (rule: string, behavior: 'ask' | 'deny' | 'allow', target = artifactRead) =>
  evaluateRules([parsed(rule, behavior)], target, matchContext).behavior;

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

  test('a bare WebFetch deny or ask rule does not apply to an artifact read', () => {
    expect(verdict('WebFetch', 'deny')).toBe(undefined);
    expect(verdict('WebFetch', 'ask')).toBe(undefined);
  });

  test('a domain: rule covering claude.ai or the content host denies or prompts before the read', () => {
    for (const behavior of ['deny', 'ask'] as const) {
      for (const rule of [
        'WebFetch(domain:claude.ai)',
        'WebFetch(domain:*)',
        'WebFetch(domain:*.claudeusercontent.com)',
        'WebFetch(domain:*.frame.claudeusercontent.com)',
      ]) {
        expect([rule, behavior, verdict(rule, behavior)]).toEqual([rule, behavior, behavior]);
      }
    }
    expect(verdict('WebFetch(domain:example.com)', 'deny')).toBe(undefined);
    expect(verdict('WebFetch(domain:*.example.com)', 'ask')).toBe(undefined);
  });

  test('an Artifact rule does the same, and a WebFetch rule never reaches another Artifact call', () => {
    expect(verdict('Artifact', 'deny')).toBe('deny');
    expect(verdict('Artifact', 'ask')).toBe('ask');
    const listing = call('Artifact', { action: 'list' });
    expect(verdict('WebFetch(domain:*)', 'deny', listing)).toBe(undefined);
    const publish = call('Artifact', { file_path: '/tmp/a.html', url: ARTIFACT_URL });
    expect(verdict('WebFetch(domain:claude.ai)', 'deny', publish)).toBe(undefined);
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

describe('what the docs leave open about artifact reads (spec/judgments.md)', () => {
  test('an allow rule never pre-approves an artifact read, and a call that is not a read is no read', () => {
    expect(verdict('WebFetch(domain:claude.ai)', 'allow')).toBe(undefined);
    expect(verdict('WebFetch(domain:*)', 'allow')).toBe(undefined);
    const noUrl = call('Artifact', { action: 'read' });
    expect(verdict('WebFetch(domain:*)', 'deny', noUrl)).toBe(undefined);
  });

  test('a rule for the apex claudeusercontent.com does not cover the content host', () => {
    expect(verdict('WebFetch(domain:claudeusercontent.com)', 'deny')).toBe(undefined);
  });
});
