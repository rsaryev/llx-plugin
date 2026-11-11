/**
 * The `init` fields of `$.http.fetch` the declarations give besides `method`, `headers` and `body`
 * (claude-code/index.d.ts:5521, `HttpInit`): `auth`, the handle `$.session.authorize()` answered,
 * which "rides https only" and is refused "while `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` is set,
 * whichever plugin asks" (:5548, :3679); `socketPath`, an absolute Unix socket path, "No relative
 * path, no NUL", that "redirects stay on" (:5556); `compress` and a `{ base64 }` body, which "only
 * an engine request carries" (:5531, :5536). spec/judgments.md (`httpInit`). Outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import { apiHarness, reply, scripted } from '../../support/mods-api.ts';
import { rejection } from '../../support/rejection.ts';

const noPolicy = {
  orgPolicyDeniesWebFetch: false,
  webFetchToolOff: false,
  disableNonessentialTraffic: false,
  carriesSessionCredentials: false,
};

describe('$.http.fetch auth', () => {
  test('the handle reaches the port, which sets the credential header itself', async () => {
    const fetcher = scripted(reply(200, 'ok'));
    const h = await apiHarness({ ports: { fetcher } });
    await h.api.http.fetch('https://api.example.com/x', { auth: 'handle-1' });
    expect(fetcher.requests[0]).toMatchObject({
      url: 'https://api.example.com/x',
      auth: 'handle-1',
    });
  });

  test('over http it is refused before the port is asked', async () => {
    const fetcher = scripted(reply(200, 'ok'));
    const h = await apiHarness({ ports: { fetcher } });
    expect(await rejection(h.api.http.fetch('http://api.example.com/x', { auth: 'h' }))).toBe(
      '$.http.fetch: auth rides https only, and http://api.example.com/x is not https',
    );
    expect(fetcher.requests).toEqual([]);
  });

  test('with nonessential traffic off, a request carrying it is refused, an installed mod too', async () => {
    const fetcher = scripted(reply(200, 'ok'));
    const h = await apiHarness({
      ports: { fetcher },
      options: { fetchPolicy: () => ({ ...noPolicy, disableNonessentialTraffic: true }) },
    });
    expect(await rejection(h.api.http.fetch('https://api.example.com/x', { auth: 'h' }))).toBe(
      '$.http.fetch: refused: CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC stops this request',
    );
    expect(fetcher.requests).toEqual([]);
  });

  test('a redirect to another origin drops it, as it drops the headers that may hold a credential', async () => {
    const fetcher = scripted(
      reply(302, '', { location: 'https://api.example.com/y' }),
      reply(302, '', { location: 'https://other.example.com/z' }),
      reply(200, 'ok'),
    );
    const h = await apiHarness({ ports: { fetcher } });
    await h.api.http.fetch('https://api.example.com/x', { auth: 'h' });
    expect(fetcher.requests.map((request) => request.auth)).toEqual(['h', 'h', undefined]);
  });
});

describe('$.http.fetch socketPath', () => {
  test('an absolute path reaches the port, and every redirect stays on it', async () => {
    const fetcher = scripted(reply(302, '', { location: 'http://other/y' }), reply(200, 'ok'));
    const h = await apiHarness({ ports: { fetcher } });
    await h.api.http.fetch('http://bridge/reload', { method: 'POST', socketPath: '/run/b.sock' });
    expect(fetcher.requests.map((request) => request.socketPath)).toEqual([
      '/run/b.sock',
      '/run/b.sock',
    ]);
  });

  test('a relative path or one holding NUL is refused', async () => {
    const h = await apiHarness({ ports: { fetcher: scripted() } });
    expect(await rejection(h.api.http.fetch('http://b/', { socketPath: 'run/b.sock' }))).toBe(
      '$.http.fetch: socketPath must be an absolute path with no NUL, got "run/b.sock"',
    );
    expect(
      await rejection(h.api.http.fetch('http://b/', { socketPath: '/run/\u0000x' })),
    ).toContain('socketPath must be an absolute path with no NUL');
  });
});

describe('what only an engine request carries', () => {
  test('compress changes nothing a mod sends: the body leaves as written', async () => {
    const fetcher = scripted(reply(200, 'ok'));
    const h = await apiHarness({ ports: { fetcher } });
    await h.api.http.fetch('https://example.com/x', {
      method: 'POST',
      body: 'plain',
      compress: true,
    });
    expect(fetcher.requests[0]?.body).toBe('plain');
    expect(fetcher.requests[0]).not.toHaveProperty('compress');
  });

  test('a { base64 } body from a mod is refused', async () => {
    const h = await apiHarness({ ports: { fetcher: scripted() } });
    expect(
      await rejection(h.api.http.fetch('https://example.com/x', { body: { base64: 'AA==' } })),
    ).toContain('$.http.fetch');
  });
});
