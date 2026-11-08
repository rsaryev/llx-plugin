/**
 * The `http` handler: hooks.md § "HTTP hook fields" ("Claude Code sends the hook's JSON input as
 * the POST request body with `Content-Type: application/json`"; `headers` values "support
 * environment variable interpolation using `$VAR_NAME` or `${VAR_NAME}` syntax. Only variables
 * listed in `allowedEnvVars` are resolved"; "References to unlisted variables are replaced with
 * empty strings. Required for any env var interpolation to work") and § "HTTP response handling"
 * (raw only: what a status or a body means is the interpreter's, P5). `onFailure` is P5's.
 * Rows outside `spec(...)` are judgments (spec/judgments.md).
 */
import { describe, expect, test } from 'bun:test';
import { runHandler } from '../../../../src/hooks/handlers/index.ts';
import { httpEntry, remoteContext } from '../../../support/hooks-remote.ts';
import type { HttpReply } from '../../../support/http.ts';
import { fakeEnvironment, recordingHttp } from '../../../support/ports.ts';
import { spec } from '../../../support/spec.ts';

const INPUT = '{"hook_event_name":"PreToolUse","tool_name":"Bash"}';

const post = async (
  hook: {
    url: string;
    headers?: Record<string, string>;
    allowedEnvVars?: string[];
    timeout?: number;
  },
  variables: Record<string, string> = {},
  reply: HttpReply = { body: '' },
) => {
  const http = recordingHttp(reply);
  const result = await runHandler(
    httpEntry(hook, 'PreToolUse'),
    remoteContext({ http, input: INPUT, environment: fakeEnvironment(variables) }),
  );
  return { request: http.requests[0], result };
};

spec('hooks.handler.http.url', () => {
  test('POSTs the hook input JSON to the url with Content-Type application/json', async () => {
    const { request } = await post({ url: 'http://localhost:8080/hooks/pre-tool-use' });
    expect(request?.method).toBe('POST');
    expect(request?.url).toBe('http://localhost:8080/hooks/pre-tool-use');
    expect(request?.body).toBe(INPUT);
    expect(request?.headers['content-type']).toBe('application/json');
  });

  test('the url is sent as written: only headers interpolate variables', async () => {
    const { request } = await post(
      { url: 'http://localhost:8080/$MY_TOKEN/${MY_TOKEN}', allowedEnvVars: ['MY_TOKEN'] },
      { MY_TOKEN: 'secret' },
    );
    expect(request?.url).toBe('http://localhost:8080/$MY_TOKEN/${MY_TOKEN}');
  });

  test('the hook timeout reaches the port in milliseconds, 600 s by default', async () => {
    const own = await post({ url: 'http://h/x', timeout: 30 });
    expect(own.request?.timeoutMs).toBe(30_000);
    const none = await post({ url: 'http://h/x' });
    expect(none.request?.timeoutMs).toBe(600_000);
  });

  test('a response is reported raw: status and body, nothing interpreted', async () => {
    const ok = await post({ url: 'http://h/x' }, {}, { status: 200, body: '{"decision":"block"}' });
    expect(ok.result.run).toEqual({ kind: 'http', status: 200, body: '{"decision":"block"}' });
    const refused = await post({ url: 'http://h/x' }, {}, { status: 503, body: 'down' });
    expect(refused.result.run).toEqual({ kind: 'http', status: 503, body: 'down' });
  });

  test('a connection failure, a timeout and an abort are runs, never throws', async () => {
    const down = await post(
      { url: 'http://h/x' },
      {},
      { failure: 'connection', message: 'refused' },
    );
    expect(down.result.run).toEqual({ kind: 'http-failed', message: 'refused' });
    const slow = await post({ url: 'http://h/x' }, {}, { failure: 'timeout', message: 'late' });
    expect(slow.result.run).toEqual({ kind: 'timed-out' });
    const stopped = await post({ url: 'http://h/x' }, {}, { failure: 'aborted', message: 'stop' });
    expect(stopped.result.run).toEqual({ kind: 'cancelled' });
  });
});

spec('hooks.handler.http.headers', () => {
  test('sends the additional headers, names lower case', async () => {
    const { request } = await post({ url: 'http://h/x', headers: { 'X-Team': 'platform' } });
    expect(request?.headers['x-team']).toBe('platform');
    expect(request?.headers['content-type']).toBe('application/json');
  });

  test('the docs example: Authorization: Bearer $MY_TOKEN with MY_TOKEN allowed', async () => {
    const { request } = await post(
      {
        url: 'http://localhost:8080/hooks/pre-tool-use',
        timeout: 30,
        headers: { Authorization: 'Bearer $MY_TOKEN' },
        allowedEnvVars: ['MY_TOKEN'],
      },
      { MY_TOKEN: 's3cret' },
    );
    expect(request?.headers.authorization).toBe('Bearer s3cret');
  });

  test('both $VAR_NAME and ${VAR_NAME} interpolate, several times in one value', async () => {
    const { request } = await post(
      { url: 'http://h/x', headers: { 'X-Id': '$A-${B}-${A}x' }, allowedEnvVars: ['A', 'B'] },
      { A: 'one', B: 'two' },
    );
    expect(request?.headers['x-id']).toBe('one-two-onex');
  });

  test('a value with no reference is sent unchanged, a lone $ stays', async () => {
    const { request } = await post({
      url: 'http://h/x',
      headers: { 'X-Price': 'USD $5 and $', 'X-Plain': 'abc' },
      allowedEnvVars: ['A'],
    });
    expect(request?.headers['x-price']).toBe('USD $5 and $');
    expect(request?.headers['x-plain']).toBe('abc');
  });
});

spec('hooks.handler.http.allowedEnvVars', () => {
  test('a variable not listed is replaced with an empty string', async () => {
    const { request } = await post(
      {
        url: 'http://h/x',
        headers: { Authorization: 'Bearer $SECRET', 'X-User': '$USER_NAME' },
        allowedEnvVars: ['USER_NAME'],
      },
      { SECRET: 'must-not-leak', USER_NAME: 'ada' },
    );
    expect(request?.headers.authorization).toBe('Bearer ');
    expect(request?.headers['x-user']).toBe('ada');
  });

  test('without allowedEnvVars no interpolation works', async () => {
    const { request } = await post(
      { url: 'http://h/x', headers: { Authorization: 'Bearer $MY_TOKEN and ${MY_TOKEN}' } },
      { MY_TOKEN: 'secret' },
    );
    expect(request?.headers.authorization).toBe('Bearer  and ');
  });

  test('an empty list resolves nothing', async () => {
    const { request } = await post(
      { url: 'http://h/x', headers: { 'X-T': '$MY_TOKEN' }, allowedEnvVars: [] },
      { MY_TOKEN: 'secret' },
    );
    expect(request?.headers['x-t']).toBe('');
  });

  test('a listed variable the environment does not have is an empty string', async () => {
    const { request } = await post({
      url: 'http://h/x',
      headers: { 'X-T': 'a${MY_TOKEN}b' },
      allowedEnvVars: ['MY_TOKEN'],
    });
    expect(request?.headers['x-t']).toBe('ab');
  });
});

describe('judgments (spec/judgments.md)', () => {
  test('the kit sets Content-Type: a header of the same name in the config does not replace it', async () => {
    const { request } = await post({
      url: 'http://h/x',
      headers: { 'Content-Type': 'text/plain' },
    });
    expect(request?.headers['content-type']).toBe('application/json');
  });

  test('a value is read once: the text of a variable is not interpolated again', async () => {
    const { request } = await post(
      { url: 'http://h/x', headers: { 'X-T': '$A' }, allowedEnvVars: ['A', 'B'] },
      { A: '$B', B: 'second' },
    );
    expect(request?.headers['x-t']).toBe('$B');
  });

  test('a line break in a variable is dropped, so it cannot add a header', async () => {
    const { request } = await post(
      { url: 'http://h/x', headers: { 'X-T': 'a$A' }, allowedEnvVars: ['A'] },
      { A: 'b\r\nX-Evil: 1' },
    );
    expect(request?.headers['x-t']).toBe('abX-Evil: 1');
    expect(Object.keys(request?.headers ?? {})).not.toContain('x-evil');
  });

  test('without the http port the hook does not run and says why', async () => {
    const result = await runHandler(httpEntry({ url: 'http://h/x' }), remoteContext({}));
    expect(result.run.kind).toBe('skipped');
    expect(result.issues[0]?.severity).toBe('error');
    expect(result.issues[0]?.path).toBe('hooks.PostToolUse.type');
  });

  test('the abort signal of the session reaches the request', async () => {
    const controller = new AbortController();
    const http = recordingHttp({});
    await runHandler(
      httpEntry({ url: 'http://h/x' }),
      remoteContext({ http, signal: controller.signal }),
    );
    expect(http.requests[0]?.signal).toBe(controller.signal);
  });
});
