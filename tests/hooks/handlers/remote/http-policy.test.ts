/**
 * The two outer limits on `http` hooks: hooks.md § "Hook locations" ("`allowedHttpHookUrls`: when
 * defined at any settings level, Claude Code runs an HTTP hook handler only if its URL matches the
 * merged allowlist"; "`httpHookAllowedEnvVars`: when defined, Claude Code interpolates only the
 * environment variables on that list into hook headers") and settings-reference.md (URL patterns
 * "with `*` as a wildcard", "an empty array blocks every HTTP hook", hostnames case-insensitive with
 * a trailing dot ignored; "a hook can use a variable only if both its own `allowedEnvVars` and this
 * key name it"). The requirements of these keys belong to the settings stream, so every row here is
 * a judgment of how the run applies them (spec/judgments.md), outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import { runHandler } from '../../../../src/hooks/handlers/index.ts';
import type { HttpHookPolicy } from '../../../../src/hooks/handlers/index.ts';
import { urlAllowed } from '../../../../src/hooks/handlers/remote/http-policy.ts';
import { httpEntry, remoteContext } from '../../../support/hooks-remote.ts';
import { fakeEnvironment, recordingHttp } from '../../../support/ports.ts';

const send = async (
  hook: { url: string; headers?: Record<string, string>; allowedEnvVars?: string[] },
  httpPolicy: HttpHookPolicy | undefined,
  variables: Record<string, string> = {},
) => {
  const http = recordingHttp({ body: '' });
  const result = await runHandler(
    httpEntry(hook, 'PreToolUse'),
    remoteContext({
      http,
      environment: fakeEnvironment(variables),
      ...(httpPolicy === undefined ? {} : { httpPolicy }),
    }),
  );
  return { requests: http.requests, result };
};

describe('allowedHttpHookUrls (judgments)', () => {
  test('a URL that matches no pattern is skipped with a warning and never sent', async () => {
    const { requests, result } = await send(
      { url: 'https://evil.example.net/hook' },
      { allowedUrls: ['https://hooks.example.com/*'] },
    );
    expect(requests).toHaveLength(0);
    expect(result.run.kind).toBe('skipped');
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.severity).toBe('warning');
    expect(result.issues[0]?.path).toBe('hooks.PreToolUse.url');
    expect(result.issues[0]?.message).toContain('allowedHttpHookUrls');
  });

  test('a URL under a pattern runs; the docs example patterns', async () => {
    const policy = { allowedUrls: ['https://hooks.example.com/*', 'http://localhost:*'] };
    for (const url of ['https://hooks.example.com/a/b', 'http://localhost:8080/x']) {
      expect((await send({ url }, policy)).requests).toHaveLength(1);
    }
    expect((await send({ url: 'http://localhost/x' }, policy)).requests).toHaveLength(0);
  });

  test('an empty list blocks every HTTP hook; no list allows every URL', async () => {
    expect((await send({ url: 'http://h/x' }, { allowedUrls: [] })).requests).toHaveLength(0);
    expect((await send({ url: 'http://h/x' }, {})).requests).toHaveLength(1);
    expect((await send({ url: 'http://h/x' }, undefined)).requests).toHaveLength(1);
  });

  test('hostnames match without case and without a trailing dot; the path stays exact', () => {
    const patterns = ['https://hooks.example.com/*'];
    expect(urlAllowed('https://HOOKS.Example.COM/x', patterns)).toBe(true);
    expect(urlAllowed('https://hooks.example.com./x', patterns)).toBe(true);
    expect(
      urlAllowed('https://hooks.example.com.:8443/x', ['https://hooks.example.com:8443/*']),
    ).toBe(true);
    expect(urlAllowed('https://hooks.example.com/x', ['https://hooks.example.com/X'])).toBe(false);
  });

  test('the whole URL must match: a pattern is not a prefix, and regex characters are literal', () => {
    expect(urlAllowed('https://hooks.example.com/x', ['https://hooks.example.com'])).toBe(false);
    expect(urlAllowed('https://hooksXexample.com/x', ['https://hooks.example.com/*'])).toBe(false);
    expect(urlAllowed('https://h/a?b=1', ['https://h/a?b=1'])).toBe(true);
    expect(urlAllowed('https://h/aab', ['https://h/a?b'])).toBe(false);
  });

  test('a host cannot hide behind a wildcard host suffix it does not match', () => {
    expect(
      urlAllowed('https://hooks.example.com.evil.net/x', ['https://hooks.example.com/*']),
    ).toBe(false);
  });
});

describe('httpHookAllowedEnvVars (judgments)', () => {
  const headers = { 'X-A': '$A', 'X-B': '$B' };

  test('a variable needs both the hook list and the settings list', async () => {
    const { requests } = await send(
      { url: 'http://h/x', headers, allowedEnvVars: ['A', 'B'] },
      { allowedEnvVars: ['B', 'C'] },
      { A: 'one', B: 'two', C: 'three' },
    );
    expect(requests[0]?.headers['x-a']).toBe('');
    expect(requests[0]?.headers['x-b']).toBe('two');
  });

  test('a settings list does not widen the hook list', async () => {
    const { requests } = await send(
      { url: 'http://h/x', headers, allowedEnvVars: ['A'] },
      { allowedEnvVars: ['A', 'B'] },
      { A: 'one', B: 'two' },
    );
    expect(requests[0]?.headers['x-a']).toBe('one');
    expect(requests[0]?.headers['x-b']).toBe('');
  });

  test('an empty settings list resolves nothing; no settings list leaves the hook list', async () => {
    const variables = { A: 'one', B: 'two' };
    const none = await send(
      { url: 'http://h/x', headers, allowedEnvVars: ['A', 'B'] },
      { allowedEnvVars: [] },
      variables,
    );
    expect(none.requests[0]?.headers['x-a']).toBe('');
    const unset = await send(
      { url: 'http://h/x', headers, allowedEnvVars: ['A', 'B'] },
      {},
      variables,
    );
    expect(unset.requests[0]?.headers['x-a']).toBe('one');
  });

  test('a hook with no allowedEnvVars still resolves nothing under a settings list', async () => {
    const { requests } = await send(
      { url: 'http://h/x', headers },
      { allowedEnvVars: ['A'] },
      { A: 'one' },
    );
    expect(requests[0]?.headers['x-a']).toBe('');
  });
});
