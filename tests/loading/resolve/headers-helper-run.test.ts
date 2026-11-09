/**
 * mcp.md § Use dynamic headers for custom authentication: the command runs in a shell, gives up
 * after 10 seconds and prints a JSON object of string pairs; "runs the helper fresh on each
 * connection ... It doesn't cache the result"; dynamic headers override static ones of the same name;
 * a 401 or 403 on a tool call re-runs the helper, reconnects and retries once, and only a failed retry
 * marks the server as needing authentication; "If the server rejects the helper's credential while
 * connecting, Claude Code reports the connection as failed rather than marking the server as needing
 * authentication"; an `Authorization` header means no fall back to OAuth (§ Sign in to an MCP server
 * behind a gateway: "If you configure an `Authorization` header, Claude Code uses it ... and doesn't
 * fall back to OAuth"). Where the helper runs and what it sees: headers-helper.test.ts.
 */
import { describe, expect, test } from 'bun:test';
import {
  attemptWithHeadersHelper,
  connectionHeaders,
  planHeadersHelper,
  runMcpHeadersHelper,
  type HeadersHelperPlan,
  type HelperRun,
} from '../../../src/entry/loading.ts';
import { scriptedRunner } from '../../support/ports.ts';
import { contextOf, serverOf, TRUSTED, trustOf } from '../../support/headers-helper.ts';
import { spec } from '../../support/spec.ts';

const planned = (): HelperRun => {
  const plan: HeadersHelperPlan = planHeadersHelper(serverOf(), 'user', TRUSTED, contextOf());
  if (!plan.run) throw new Error('no run');
  return plan;
};

const signal = new AbortController().signal;
const SERVER = 'internal-api';
const OUT = '{"Authorization": "Bearer fresh-1"}';

spec('mcp.behavior.Use dynamic headers for custom authentication', () => {
  test('the command runs in a shell, from the planned directory and environment, with a 10 second limit', async () => {
    const runner = scriptedRunner({ stdout: OUT });
    const plan = planned();
    const result = await runMcpHeadersHelper(plan, runner, { signal });
    expect(result).toEqual({ headers: { Authorization: 'Bearer fresh-1' } });
    expect(runner.calls).toHaveLength(1);
    expect(runner.calls[0]).toMatchObject({
      spec: { form: 'shell', command: '/opt/bin/get-mcp-auth-headers.sh', shell: 'bash' },
      cwd: plan.cwd,
      env: plan.environment,
      timeoutMs: 10_000,
    });
  });

  test('a command that runs over 10 seconds, fails, does not start or prints no JSON object is an issue that names the cause', async () => {
    const PATH = 'mcpServers.internal-api.headersHelper';
    const replies = [
      [{ timedOut: true, exitCode: null }, 'The headersHelper command ran longer than 10 seconds'],
      [{ exitCode: 2 }, 'The headersHelper command did not exit 0'],
      [
        { startError: 'no such program' },
        'The headersHelper command could not be run: no such program',
      ],
      [{ stdout: 'Bearer abc' }, 'The headersHelper command did not print a JSON object'],
      [{ stdout: '[]' }, 'The headersHelper command did not print a JSON object'],
      [{ stdout: 'null' }, 'The headersHelper command did not print a JSON object'],
      [
        { stdout: '{"Retry": 3}' },
        'The headersHelper command printed a header whose value is not a string',
      ],
    ] as const;
    for (const [reply, message] of replies) {
      const result = await runMcpHeadersHelper(planned(), scriptedRunner(reply), { signal });
      expect(result).toEqual({ severity: 'error', path: PATH, message });
    }
  });

  test('the helper runs fresh on each connection: nothing is cached', async () => {
    const runner = scriptedRunner(
      { stdout: '{"X-Token": "one"}' },
      { stdout: '{"X-Token": "two"}' },
    );
    const first = await runMcpHeadersHelper(planned(), runner, { signal });
    const second = await runMcpHeadersHelper(planned(), runner, { signal });
    expect(first).toEqual({ headers: { 'X-Token': 'one' } });
    expect(second).toEqual({ headers: { 'X-Token': 'two' } });
    expect(runner.calls).toHaveLength(2);
  });

  test('dynamic headers override static headers of the same name, whatever its letter case', () => {
    const merged = connectionHeaders(
      { 'x-team': 'static', 'X-Static': 'kept', authorization: 'Bearer static' },
      { 'X-Team': 'dynamic', Authorization: 'Bearer dynamic' },
    );
    expect(merged.headers).toEqual({
      'X-Static': 'kept',
      'X-Team': 'dynamic',
      Authorization: 'Bearer dynamic',
    });
  });

  test("an Authorization header from the helper is the server's credential: no fall back to OAuth", () => {
    expect(connectionHeaders({}, { Authorization: 'Bearer x' }).oauthFallback).toBe(false);
    expect(connectionHeaders({}, { authorization: 'Bearer x' }).oauthFallback).toBe(false);
  });

  test('without an Authorization header OAuth stays the fallback; a static one stops it too', () => {
    expect(connectionHeaders({ 'X-Team': 'blue' }, { 'X-Token': 't' }).oauthFallback).toBe(true);
    expect(connectionHeaders({ Authorization: 'Bearer s' }, {}).oauthFallback).toBe(false);
  });
});

const answers = (...statuses: number[]) => {
  const sent: Record<string, string>[] = [];
  let runs = 0;
  return {
    sent,
    runs: () => runs,
    produce: () => {
      runs += 1;
      return Promise.resolve({ headers: { Authorization: `Bearer fresh-${runs}` } });
    },
    send: (headers: Record<string, string>) => {
      sent.push(headers);
      return Promise.resolve({ status: statuses[sent.length - 1] ?? 200 });
    },
  };
};

describe('a call that answers 401 or 403', () => {
  spec('mcp.behavior.Use dynamic headers for custom authentication', () => {
    test('re-runs the helper once, reconnects with the fresh headers and retries the call once', async () => {
      for (const status of [401, 403]) {
        const fake = answers(status, 200);
        const result = await attemptWithHeadersHelper('call', fake.produce, fake.send, SERVER);
        expect(result).toMatchObject({ outcome: 'ok', reruns: 1, response: { status: 200 } });
        expect(fake.runs()).toBe(2);
        expect(fake.sent).toEqual([
          { Authorization: 'Bearer fresh-1' },
          { Authorization: 'Bearer fresh-2' },
        ]);
      }
    });

    test('the server needs authentication only if that retry also fails, and there is no third try', async () => {
      const fake = answers(401, 403, 200);
      const result = await attemptWithHeadersHelper('call', fake.produce, fake.send, SERVER);
      expect(result).toMatchObject({ outcome: 'needs-authentication', reruns: 1 });
      expect(fake.sent).toHaveLength(2);
    });

    test('another status is not retried', async () => {
      for (const status of [200, 404, 500]) {
        const fake = answers(status);
        const result = await attemptWithHeadersHelper('call', fake.produce, fake.send, SERVER);
        expect(result).toMatchObject({ outcome: 'ok', reruns: 0 });
        expect(fake.runs()).toBe(1);
      }
    });

    test("a server that rejects the helper's credential while connecting is failed, not needing authentication, with no re-run", async () => {
      const fake = answers(401);
      const result = await attemptWithHeadersHelper('connect', fake.produce, fake.send, SERVER);
      expect(result).toMatchObject({ outcome: 'failed', reruns: 0 });
      expect(fake.runs()).toBe(1);
    });

    test("a rejection while connecting reports errors.md's line with the status when the helper supplied Authorization", async () => {
      for (const status of [401, 403]) {
        const fake = answers(status);
        const result = await attemptWithHeadersHelper('connect', fake.produce, fake.send, SERVER);
        expect(result.issue).toEqual({
          severity: 'error',
          path: 'mcpServers.internal-api.headersHelper',
          message: `Server rejected the Authorization header minted by the configured headersHelper (HTTP ${status}). Check that the helper command returns a valid credential for this MCP endpoint — OAuth fallback is disabled when the helper supplies Authorization.`,
        });
      }
    });

    test('a rejection while connecting is not that line when the helper supplied no Authorization', async () => {
      const result = await attemptWithHeadersHelper(
        'connect',
        () => Promise.resolve({ headers: { 'X-Token': 't' } }),
        () => Promise.resolve({ status: 401 }),
        SERVER,
      );
      expect(result).toMatchObject({ outcome: 'failed', reruns: 0 });
      expect(result.issue).toBeUndefined();
    });

    test('the re-run is planned again under the same rule: trust lost since the first run leaves the static headers alone', async () => {
      let trust = TRUSTED;
      const runner = scriptedRunner({ stdout: '{"Authorization": "Bearer fresh-1"}' });
      const sent: Record<string, string>[] = [];
      const result = await attemptWithHeadersHelper(
        'call',
        async () => {
          const plan = planHeadersHelper(serverOf(), 'project', trust, contextOf());
          return plan.run ? await runMcpHeadersHelper(plan, runner, { signal }) : { headers: {} };
        },
        (helperHeaders) => {
          sent.push(connectionHeaders({ 'X-Team': 'blue' }, helperHeaders).headers);
          trust = trustOf({ source: 'none', interactive: false });
          return Promise.resolve({ status: sent.length === 1 ? 401 : 200 });
        },
        SERVER,
      );
      expect(result).toMatchObject({ outcome: 'ok', reruns: 1 });
      expect(sent).toEqual([
        { 'X-Team': 'blue', Authorization: 'Bearer fresh-1' },
        { 'X-Team': 'blue' },
      ]);
      expect(runner.calls).toHaveLength(1);
    });

    test('a helper that fails ends the attempt before anything is sent', async () => {
      const issue = { severity: 'error', path: 'headersHelper', message: 'boom' } as const;
      const sent: unknown[] = [];
      const result = await attemptWithHeadersHelper(
        'call',
        () => Promise.resolve(issue),
        (headers) => {
          sent.push(headers);
          return Promise.resolve({ status: 200 });
        },
        SERVER,
      );
      expect(result).toMatchObject({ outcome: 'failed', reruns: 0, issue });
      expect(sent).toEqual([]);
    });

    test('a helper that fails on the re-run ends the retry', async () => {
      const issue = { severity: 'error', path: 'headersHelper', message: 'boom' } as const;
      let runs = 0;
      const result = await attemptWithHeadersHelper(
        'call',
        () => {
          runs += 1;
          return Promise.resolve(runs === 1 ? { headers: { A: 'b' } } : issue);
        },
        () => Promise.resolve({ status: 401 }),
        SERVER,
      );
      expect(result).toMatchObject({ outcome: 'failed', reruns: 1, issue });
    });
  });
});
