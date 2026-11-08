/**
 * settings-reference.md § `allowedHttpHookUrls` ("When you define this key, Claude Code runs an HTTP
 * hook only if its URL matches one of the patterns and blocks the rest without running them; an empty
 * array blocks every HTTP hook"; Scope: Any file, "Arrays merge across settings files"; `*` as a
 * wildcard; default unset, "so any URL is allowed"; the example `https://hooks.example.com/*` and
 * `http://localhost:*`; "Hostname matching is case-insensitive and treats `hooks.example.com.`, with
 * the trailing dot ... the same as `hooks.example.com`"; "The allowlist applies to hooks from every
 * source, including managed settings"), hooks.md § "Hooks in plugins/managed policy" ("when defined at
 * any settings level, Claude Code runs an HTTP hook handler only if its URL matches the merged
 * allowlist"), managed-settings.md § "Keys that fail closed" (an unreadable managed value is an empty
 * allowlist "so an HTTP hook runs only if another settings file lists its URL"; an invalid entry is
 * stripped and the rest enforced; "entries in your user, project, or local settings still apply while
 * the managed list is empty").
 */
import { describe, expect, test } from 'bun:test';
import { matchUrlPattern } from '../../../src/settings/hooks/index.ts';
import { issuesOf, plain } from '../../support/settings-layers.ts';
import {
  fromManaged,
  fromSettings,
  hookPolicyOf,
  local,
  managed,
  project,
  runs,
  user,
} from '../../support/hook-policy.ts';
import { spec } from '../../support/spec.ts';

const docsExample = { allowedHttpHookUrls: ['https://hooks.example.com/*', 'http://localhost:*'] };
const allowed = (policy: ReturnType<typeof hookPolicyOf>, url: string): boolean =>
  policy.httpHook(url, []).run;

spec('settings.key.allowedHttpHookUrls', () => {
  describe('unset', () => {
    test('any URL is allowed', () => {
      const policy = hookPolicyOf([user({})]);
      expect(allowed(policy, 'https://anything.test/hook')).toBe(true);
      expect(allowed(policy, 'http://10.0.0.1:8080/')).toBe(true);
    });
  });

  describe('defined', () => {
    const policy = hookPolicyOf([user(docsExample)]);

    test('runs an HTTP hook whose URL matches one of the patterns', () => {
      expect(allowed(policy, 'https://hooks.example.com/notify')).toBe(true);
      expect(allowed(policy, 'https://hooks.example.com/a/b/c?token=1#x')).toBe(true);
      expect(allowed(policy, 'http://localhost:3000/hook')).toBe(true);
      expect(allowed(policy, 'http://localhost:8080')).toBe(true);
    });

    test('allows any http://localhost URL, the port or none, as the example says', () => {
      expect(allowed(policy, 'http://localhost/hook')).toBe(true);
      expect(allowed(policy, 'http://localhost')).toBe(true);
    });

    test('blocks the rest without running them', () => {
      for (const url of [
        'https://evil.example.com/notify',
        'http://hooks.example.com/notify',
        'https://hooks.example.com.evil.test/notify',
        'https://example.com/hooks.example.com/',
        'http://127.0.0.1:3000/hook',
      ]) {
        const verdict = plain(policy.httpHook(url, ['TOKEN']));
        expect(verdict).toEqual({ run: false, message: expect.any(String) });
      }
    });

    test('an empty array blocks every HTTP hook', () => {
      const none = hookPolicyOf([user({ allowedHttpHookUrls: [] })]);
      expect(allowed(none, 'https://hooks.example.com/notify')).toBe(false);
      expect(allowed(none, 'http://localhost:3000/')).toBe(false);
    });

    test('a pattern with no wildcard is an exact URL', () => {
      const exact = hookPolicyOf([user({ allowedHttpHookUrls: ['https://hooks.example.com/a'] })]);
      expect(allowed(exact, 'https://hooks.example.com/a')).toBe(true);
      expect(allowed(exact, 'https://hooks.example.com/a/b')).toBe(false);
    });

    test('a wildcard may stand in the host', () => {
      const wide = hookPolicyOf([user({ allowedHttpHookUrls: ['https://*.example.com/*'] })]);
      expect(allowed(wide, 'https://hooks.example.com/x')).toBe(true);
      expect(allowed(wide, 'https://example.org/x')).toBe(false);
    });
  });

  describe('host matching', () => {
    const policy = hookPolicyOf([user(docsExample)]);

    test('is case-insensitive', () => {
      expect(allowed(policy, 'https://HOOKS.Example.COM/notify')).toBe(true);
      const upper = hookPolicyOf([user({ allowedHttpHookUrls: ['https://HOOKS.example.com/*'] })]);
      expect(allowed(upper, 'https://hooks.example.com/notify')).toBe(true);
    });

    test('treats a trailing dot as the same host', () => {
      expect(allowed(policy, 'https://hooks.example.com./notify')).toBe(true);
      const dotted = hookPolicyOf([
        user({ allowedHttpHookUrls: ['https://hooks.example.com./*'] }),
      ]);
      expect(allowed(dotted, 'https://hooks.example.com/notify')).toBe(true);
    });

    test('does not fold the path: its case counts', () => {
      expect(allowed(policy, 'https://hooks.example.com/Notify')).toBe(true);
      const exact = hookPolicyOf([user({ allowedHttpHookUrls: ['https://hooks.example.com/a'] })]);
      expect(allowed(exact, 'https://hooks.example.com/A')).toBe(false);
    });
  });

  describe('merging across files (Scope: Any file)', () => {
    test('a list in any file is read, the entries of every file joined', () => {
      const policy = hookPolicyOf([
        managed({ allowedHttpHookUrls: ['https://hooks.example.com/*'] }),
        user({ allowedHttpHookUrls: ['http://localhost:*'] }),
        project({ allowedHttpHookUrls: ['https://ci.example.com/*'] }),
        local({ allowedHttpHookUrls: ['https://me.example.com/*'] }),
      ]);
      for (const url of [
        'https://hooks.example.com/a',
        'http://localhost:1/',
        'https://ci.example.com/a',
        'https://me.example.com/a',
      ]) {
        expect(allowed(policy, url)).toBe(true);
      }
      expect(allowed(policy, 'https://other.example.com/a')).toBe(false);
    });

    test('a developer can add to an empty managed list', () => {
      const policy = hookPolicyOf([
        managed({ allowedHttpHookUrls: [] }),
        user({ allowedHttpHookUrls: ['http://localhost:*'] }),
      ]);
      expect(allowed(policy, 'http://localhost:3000/')).toBe(true);
      expect(allowed(policy, 'https://hooks.example.com/')).toBe(false);
    });

    test('a list in one file restricts hooks configured in any other', () => {
      const policy = hookPolicyOf([
        project({}),
        user({ allowedHttpHookUrls: ['https://a.test/*'] }),
      ]);
      expect(allowed(policy, 'https://b.test/')).toBe(false);
    });
  });

  describe('applies to hooks from every source, managed settings included', () => {
    // Design: `httpHook` takes no origin, so no origin can be exempt from the allowlist. The two
    // checks compose: `runs(origin)` says whether the origin may run hooks at all, `httpHook` whether
    // the URL may be sent to.
    test('an HTTP hook of the managed origin is stopped by httpHook while runs(managed) stays true', () => {
      const policy = hookPolicyOf([
        managed({ allowManagedHooksOnly: true, allowedHttpHookUrls: ['https://a.test/*'] }),
      ]);
      expect(runs(policy, fromManaged)).toBe(true);
      expect(plain(policy.httpHook('https://managed-hook.test/', []))).toEqual({
        run: false,
        message: expect.any(String),
      });
      expect(allowed(policy, 'https://a.test/x')).toBe(true);
    });

    test('a user hook is judged by the same list as a managed one', () => {
      const policy = hookPolicyOf([managed({ allowedHttpHookUrls: ['https://a.test/*'] })]);
      expect(runs(policy, fromSettings('user'))).toBe(true);
      expect(allowed(policy, 'https://user-hook.test/')).toBe(false);
    });
  });

  describe('an unreadable value in managed settings (fails closed)', () => {
    test('a value that is not a list is an empty allowlist until it is fixed', () => {
      const raw = { allowedHttpHookUrls: 'https://hooks.example.com/*' };
      expect(issuesOf('managed', raw)).not.toEqual([]);
      const policy = hookPolicyOf([managed(raw)]);
      expect(allowed(policy, 'https://hooks.example.com/notify')).toBe(false);
    });

    test('an HTTP hook runs only if another settings file lists its URL', () => {
      const policy = hookPolicyOf([
        managed({ allowedHttpHookUrls: 42 }),
        user({ allowedHttpHookUrls: ['https://mine.test/*'] }),
      ]);
      expect(allowed(policy, 'https://mine.test/x')).toBe(true);
      expect(allowed(policy, 'https://other.test/x')).toBe(false);
    });

    test('an invalid entry is stripped and the rest enforced', () => {
      const raw = { allowedHttpHookUrls: ['https://hooks.example.com/*', 7, null] };
      expect(issuesOf('managed', raw)).toHaveLength(2);
      const policy = hookPolicyOf([managed(raw)]);
      expect(allowed(policy, 'https://hooks.example.com/a')).toBe(true);
      expect(allowed(policy, 'https://other.test/a')).toBe(false);
    });

    test('in a user file a value that is not a list is dropped and restricts nothing', () => {
      const policy = hookPolicyOf([user({ allowedHttpHookUrls: 'nope' })]);
      expect(allowed(policy, 'https://anything.test/')).toBe(true);
    });
  });
});

describe('the URL pattern matcher', () => {
  test('* stands for any run of characters, the slash included', () => {
    expect(matchUrlPattern('https://hooks.example.com/*', 'https://hooks.example.com/a/b/c')).toBe(
      true,
    );
    expect(matchUrlPattern('http://localhost:*', 'http://localhost:3000/hook')).toBe(true);
  });

  test('every other character matches itself, regular expression characters included', () => {
    expect(matchUrlPattern('https://a.test/x?y=1', 'https://a.test/x?y=1')).toBe(true);
    expect(matchUrlPattern('https://a.test/x?y=1', 'https://a.test/xxy=1')).toBe(false);
    expect(matchUrlPattern('https://a.test/(a|b)+', 'https://a.test/(a|b)+')).toBe(true);
    expect(matchUrlPattern('https://a.test/(a|b)+', 'https://a.test/ab')).toBe(false);
  });

  test('several wildcards match in order, and a long URL does not slow it down', () => {
    expect(matchUrlPattern('https://*.test/*/x/*', 'https://a.test/b/x/c')).toBe(true);
    expect(matchUrlPattern('https://*.test/*/x/*', 'https://a.test/b/y/c')).toBe(false);
    const long = `https://a.test/${'a'.repeat(50_000)}`;
    expect(matchUrlPattern('*a*a*a*a*a*a*a*a*b', long)).toBe(false);
  });

  test('* alone matches every URL', () => {
    expect(matchUrlPattern('*', 'https://anything.test/')).toBe(true);
  });
});

describe('judgments on the URL form (the docs leave them open)', () => {
  test('a message names the key and never the URL, which can hold a token', () => {
    const verdict = hookPolicyOf([user(docsExample)]).httpHook('https://x.test/?token=SECRET', []);
    expect(verdict.run).toBe(false);
    if (!verdict.run) {
      expect(verdict.message).toContain('allowedHttpHookUrls');
      expect(verdict.message).not.toContain('SECRET');
    }
  });

  test('the scheme is matched without regard to case, as a URL parser reads it', () => {
    expect(matchUrlPattern('https://a.test/*', 'HTTPS://a.test/x')).toBe(true);
  });

  test('an address with no path is the same as the one with a lone slash', () => {
    expect(matchUrlPattern('https://hooks.example.com/*', 'https://hooks.example.com')).toBe(true);
    expect(matchUrlPattern('https://hooks.example.com', 'https://hooks.example.com/')).toBe(true);
    expect(matchUrlPattern('https://hooks.example.com/', 'https://hooks.example.com')).toBe(true);
  });

  test('the default port is not folded: the text counts', () => {
    expect(matchUrlPattern('https://a.test/*', 'https://a.test:443/x')).toBe(false);
    expect(matchUrlPattern('https://a.test:443/*', 'https://a.test/x')).toBe(false);
  });

  test('a wildcard port also matches the host with no port, as the docs example reads', () => {
    expect(matchUrlPattern('http://localhost:*', 'http://localhost/x')).toBe(true);
    expect(matchUrlPattern('http://localhost:*', 'http://localhost')).toBe(true);
    expect(matchUrlPattern('http://localhost:*', 'http://LOCALHOST./x?y=1')).toBe(true);
    expect(matchUrlPattern('http://[::1]:*', 'http://[::1]/x')).toBe(true);
    expect(matchUrlPattern('http://localhost:*/hook', 'http://localhost/hook')).toBe(true);
    expect(matchUrlPattern('http://localhost:*/hook', 'http://localhost/other')).toBe(false);
  });

  test('a wildcard port does not widen the host', () => {
    expect(matchUrlPattern('http://localhost:*', 'http://localhost.evil.test/x')).toBe(false);
    expect(matchUrlPattern('http://localhost:*', 'http://localhostx/x')).toBe(false);
    expect(matchUrlPattern('http://localhost:*', 'http://localhost@evil.test/x')).toBe(false);
    expect(matchUrlPattern('http://localhost:*', 'https://localhost/x')).toBe(false);
  });

  test('user information in the address is not part of the host that is folded', () => {
    expect(
      matchUrlPattern('https://hooks.example.com/*', 'https://hooks.example.com@evil.test/x'),
    ).toBe(false);
  });

  test('text that is no URL is compared as it is', () => {
    expect(matchUrlPattern('not a url', 'not a url')).toBe(true);
    expect(matchUrlPattern('Not*', 'not a url')).toBe(false);
  });

  test('an IPv6 host keeps its brackets and port', () => {
    expect(matchUrlPattern('http://[::1]:*', 'http://[::1]:8080/x')).toBe(true);
    expect(matchUrlPattern('http://[::1]:8080/*', 'http://[::2]:8080/x')).toBe(false);
  });
});
