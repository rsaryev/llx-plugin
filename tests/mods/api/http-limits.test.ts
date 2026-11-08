/**
 * The limits of `$.http.fetch`.
 * plugins/mods/reference.md § Limits (request body 4 MiB counted in characters, a larger body
 * rejects; response body 4 MiB, `text` holds the first 4 MiB; a `Content-Length` over it rejects
 * with a reason that ends `is over the 4194304-byte limit`, except when the last request after any
 * redirects uses `HEAD`; one call 30 seconds; 5 redirects); plugins/mods/api.md § Reach files,
 * processes, and the network ("On a redirect to a different origin, it keeps only the accept,
 * accept-language, content-type, and user-agent request headers you set and drops the rest").
 */
import { expect, test } from 'bun:test';
import type { FetchRequest } from '../../../src/mods/api/index.ts';
import { MOD_LIMITS } from '../../../src/protocol/mods-limits.ts';
import { flush } from '../../support/mods-chain.ts';
import { apiHarness, field, reply, scripted } from '../../support/mods-api.ts';
import { rejection } from '../../support/rejection.ts';
import { spec } from '../../support/spec.ts';

const hops = (count: number) =>
  Array.from({ length: count }, (_, index) => reply(301, '', { location: `/r${index + 1}` }));

spec('mods.limit.$.http.fetch', () => {
  test('five redirects are followed and the sixth rejects', async () => {
    const five = await apiHarness({ ports: { fetcher: scripted(...hops(5), reply(200, 'ok')) } });
    expect(await five.api.http.fetch('https://example.com/r0')).toMatchObject({ text: 'ok' });
    const six = await apiHarness({ ports: { fetcher: scripted(...hops(6), reply(200, 'ok')) } });
    expect(await rejection(six.api.http.fetch('https://example.com/r0'))).toContain(
      'more than 5 redirects',
    );
  });

  test('a redirect to a different origin keeps only accept, accept-language, content-type and user-agent', async () => {
    const fetcher = scripted(
      reply(302, '', { location: 'https://other.example.org/x' }),
      reply(200),
    );
    const h = await apiHarness({ ports: { fetcher } });
    await h.api.http.fetch('https://example.com/x', {
      headers: {
        Accept: 'text/plain',
        'Accept-Language': 'en',
        'Content-Type': 'text/plain',
        'User-Agent': 'mod',
        Authorization: 'Bearer secret',
        'X-Api-Key': 'k',
      },
    });
    expect(fetcher.requests[1]?.headers).toEqual({
      accept: 'text/plain',
      'accept-language': 'en',
      'content-type': 'text/plain',
      'user-agent': 'mod',
    });
    expect(fetcher.requests[0]?.headers).toHaveProperty('authorization', 'Bearer secret');
  });

  test('a redirect to the same origin keeps every header', async () => {
    const fetcher = scripted(reply(302, '', { location: '/y' }), reply(200));
    const h = await apiHarness({ ports: { fetcher } });
    await h.api.http.fetch('https://example.com/x', { headers: { Authorization: 'Bearer t' } });
    expect(fetcher.requests[1]?.headers).toEqual({ authorization: 'Bearer t' });
  });

  test('a request body of 4 MiB characters is sent, one character more rejects before any request', async () => {
    const fetcher = scripted(reply(200));
    const h = await apiHarness({ ports: { fetcher } });
    await h.api.http.fetch('https://example.com/x', {
      method: 'POST',
      body: 'x'.repeat(MOD_LIMITS.httpRequestChars),
    });
    expect(
      await rejection(
        h.api.http.fetch('https://example.com/x', {
          method: 'POST',
          body: 'x'.repeat(MOD_LIMITS.httpRequestChars + 1),
        }),
      ),
    ).toContain('request body');
    expect(fetcher.requests).toHaveLength(1);
  });

  test('the body is counted in characters, not bytes', async () => {
    const fetcher = scripted(reply(200));
    const h = await apiHarness({ ports: { fetcher } });
    // two-byte characters: 4 MiB of them is 8 MiB of bytes and still allowed
    await h.api.http.fetch('https://example.com/x', {
      method: 'POST',
      body: 'é'.repeat(MOD_LIMITS.httpRequestChars),
    });
    expect(fetcher.requests).toHaveLength(1);
  });

  test('a character is a code point: 4 MiB astral characters (8 MiB of UTF-16 units) are sent, one more rejects', async () => {
    const fetcher = scripted(reply(200));
    const h = await apiHarness({ ports: { fetcher } });
    const whole = '\u{1D4B3}'.repeat(MOD_LIMITS.httpRequestChars);
    await h.api.http.fetch('https://example.com/x', { method: 'POST', body: whole });
    expect(fetcher.requests).toHaveLength(1);
    expect(
      await rejection(
        h.api.http.fetch('https://example.com/x', { method: 'POST', body: `${whole}x` }),
      ),
    ).toContain('request body');
  });

  test('the port is asked to read at most 4 MiB of the response', async () => {
    const fetcher = scripted(reply(200, 'first 4 MiB'));
    const h = await apiHarness({ ports: { fetcher } });
    await h.api.http.fetch('https://example.com/x');
    expect(fetcher.requests[0]?.maxBytes).toBe(MOD_LIMITS.httpResponseBytes);
  });

  test('text holds the first 4 MiB, in bytes, even when the port sends more', async () => {
    const four = MOD_LIMITS.httpResponseBytes;
    const whole = apiHarness({
      ports: { fetcher: scripted(reply(200, 'x'.repeat(four)), reply(200, 'x'.repeat(four + 10))) },
    });
    const h = await whole;
    const exact = await h.api.http.fetch('https://example.com/x');
    expect(field(exact, 'text')).toBe('x'.repeat(four));
    const over = await h.api.http.fetch('https://example.com/x');
    expect(field(over, 'text')).toBe('x'.repeat(four));
  });

  test('the cut counts UTF-8 bytes and leaves a character it would split out', async () => {
    const four = MOD_LIMITS.httpResponseBytes;
    // 'é' is two bytes: 4 MiB of bytes is half that many characters, so one more is cut
    const text = 'é'.repeat(four / 2 + 1);
    const h = await apiHarness({ ports: { fetcher: scripted(reply(200, text)) } });
    expect(field(await h.api.http.fetch('https://example.com/x'), 'text')).toBe(
      'é'.repeat(four / 2),
    );
  });

  test('a Content-Length header in any case rejects when it declares more than 4 MiB', async () => {
    const declared = String(MOD_LIMITS.httpResponseBytes + 1);
    for (const name of ['Content-Length', 'CONTENT-LENGTH']) {
      const h = await apiHarness({
        ports: { fetcher: scripted(reply(200, 'x', { [name]: declared })) },
      });
      expect(await rejection(h.api.http.fetch('https://example.com/big'))).toMatch(
        /is over the 4194304-byte limit$/,
      );
    }
  });

  test('the response header names reach the mod in lower case', async () => {
    const h = await apiHarness({
      ports: { fetcher: scripted(reply(200, 'x', { 'Content-Type': 'text/plain', ETag: '"a"' })) },
    });
    expect(field(await h.api.http.fetch('https://example.com/x'), 'headers')).toEqual({
      'content-type': 'text/plain',
      etag: '"a"',
    });
  });

  test('a Location header in any case is followed', async () => {
    const fetcher = scripted(reply(302, '', { Location: '/b' }), reply(200, 'done'));
    const h = await apiHarness({ ports: { fetcher } });
    expect(await h.api.http.fetch('https://example.com/a')).toMatchObject({ text: 'done' });
    expect(fetcher.requests.map((request) => request.url)).toEqual([
      'https://example.com/a',
      'https://example.com/b',
    ]);
  });

  test('a Content-Length over 4 MiB rejects with a reason that ends "is over the 4194304-byte limit"', async () => {
    const declared = String(MOD_LIMITS.httpResponseBytes + 1);
    const h = await apiHarness({
      ports: { fetcher: scripted(reply(200, 'x', { 'content-length': declared })) },
    });
    expect(await rejection(h.api.http.fetch('https://example.com/big'))).toMatch(
      /is over the 4194304-byte limit$/,
    );
  });

  test('a Content-Length of exactly 4 MiB does not reject', async () => {
    const declared = String(MOD_LIMITS.httpResponseBytes);
    const h = await apiHarness({
      ports: { fetcher: scripted(reply(200, 'x', { 'content-length': declared })) },
    });
    expect(await h.api.http.fetch('https://example.com/ok')).toMatchObject({ status: 200 });
  });

  test('a HEAD request is exempt: its Content-Length may declare more', async () => {
    const declared = String(MOD_LIMITS.httpResponseBytes * 10);
    const h = await apiHarness({
      ports: { fetcher: scripted(reply(200, '', { 'content-length': declared })) },
    });
    expect(await h.api.http.fetch('https://example.com/big', { method: 'HEAD' })).toMatchObject({
      status: 200,
    });
  });

  test('the exemption looks at the last request after the redirects', async () => {
    const declared = String(MOD_LIMITS.httpResponseBytes + 1);
    const toHead = await apiHarness({
      ports: {
        fetcher: scripted(
          reply(302, '', { location: '/b' }),
          reply(200, '', { 'content-length': declared }),
        ),
      },
    });
    expect(await toHead.api.http.fetch('https://example.com/a', { method: 'HEAD' })).toMatchObject({
      status: 200,
    });
    // a 303 turns a POST into a GET, so the last request is not HEAD
    const toGet = await apiHarness({
      ports: {
        fetcher: scripted(
          reply(303, '', { location: '/b' }),
          reply(200, 'x', { 'content-length': declared }),
        ),
      },
    });
    expect(
      await rejection(
        toGet.api.http.fetch('https://example.com/a', { method: 'POST', body: '{}' }),
      ),
    ).toContain('byte limit');
  });

  test('one call, redirects and body included, has 30 seconds', async () => {
    const asked: number[] = [];
    const fetcher = {
      request: (request: FetchRequest) => {
        asked.push(request.timeoutMs);
        return new Promise<{ failure: 'aborted'; message: string }>((resolve) =>
          request.signal.addEventListener('abort', () =>
            resolve({ failure: 'aborted', message: 'aborted' }),
          ),
        );
      },
    };
    const h = await apiHarness({ ports: { fetcher } });
    const call = Promise.resolve(h.api.http.fetch('https://example.com/slow'));
    // `expect(...).rejects` on a pending promise blocks the test runner, so the outcome is read after the clock moves
    const outcome = call.then(
      () => 'resolved',
      (error: unknown) => (error instanceof Error ? error.message : String(error)),
    );
    await flush();
    expect(asked).toEqual([30_000]);
    h.clock.advance(30_000);
    expect(await outcome).toBe('$.http.fetch: timed out after 30000 ms');
  });

  test('the time a redirect leaves is what the next request gets', async () => {
    const asked: number[] = [];
    const h = await apiHarness({
      ports: {
        fetcher: {
          request: (request: FetchRequest) => {
            asked.push(request.timeoutMs);
            h.clock.advance(12_000);
            return Promise.resolve(
              asked.length === 1 ? reply(302, '', { location: '/b' }) : reply(200),
            );
          },
        },
      },
    });
    await h.api.http.fetch('https://example.com/a');
    expect(asked).toEqual([30_000, 18_000]);
  });
});
