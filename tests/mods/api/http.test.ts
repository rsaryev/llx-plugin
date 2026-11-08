/**
 * `$.http.fetch` and its limits.
 * plugins/mods/api.md § Reach files, processes, and the network ("`fetch(url, init)` over http or
 * https. It resolves to { status, ok, headers, text } once the body is read"; "follows up to five
 * redirects"); plugins/mods/reference.md § Mods API methods. The limits are in http-limits.test.ts.
 */
import { expect, test } from 'bun:test';
import { MODS_API } from '../../../src/protocol/mods-api-names.ts';
import { apiHarness, expectMethods, reply, scripted } from '../../support/mods-api.ts';
import { rejection } from '../../support/rejection.ts';
import { spec } from '../../support/spec.ts';

spec('mods.api.$.http', () => {
  test('$.http has fetch', async () => {
    const { api } = await apiHarness();
    expectMethods(api.http, MODS_API.http);
  });

  test('fetch resolves to { status, ok, headers, text } with the body read', async () => {
    const fetcher = scripted(
      reply(200, '{"title":"Fix it"}', { 'content-type': 'application/json' }),
    );
    const h = await apiHarness({ ports: { fetcher } });
    const response = await h.api.http.fetch('https://tickets.example.com/api/42');
    expect(response).toEqual({
      status: 200,
      ok: true,
      headers: { 'content-type': 'application/json' },
      text: '{"title":"Fix it"}',
    });
    expect(fetcher.requests[0]).toMatchObject({
      method: 'GET',
      url: 'https://tickets.example.com/api/42',
    });
  });

  test('ok is false for an error status, which does not reject', async () => {
    const h = await apiHarness({ ports: { fetcher: scripted(reply(404, 'nope')) } });
    expect(await h.api.http.fetch('https://example.com/x')).toMatchObject({
      status: 404,
      ok: false,
      text: 'nope',
    });
  });

  test('init sets the method, headers (lower-cased for the port) and body', async () => {
    const fetcher = scripted(reply(201));
    const h = await apiHarness({ ports: { fetcher } });
    await h.api.http.fetch('https://example.com/x', {
      method: 'post',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer t' },
      body: '{}',
    });
    expect(fetcher.requests[0]).toMatchObject({
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer t' },
      body: '{}',
    });
  });

  test('only http and https are fetched', async () => {
    const h = await apiHarness({ ports: { fetcher: scripted() } });
    expect(await rejection(h.api.http.fetch('file:///etc/passwd'))).toContain(
      'is not an http or https URL',
    );
    expect(await rejection(h.api.http.fetch('ftp://example.com/x'))).toContain(
      'is not an http or https URL',
    );
  });

  test('a connection that fails rejects with the port message', async () => {
    const fetcher = {
      request: () => Promise.resolve({ failure: 'connection' as const, message: 'refused' }),
    };
    const h = await apiHarness({ ports: { fetcher } });
    expect(await rejection(h.api.http.fetch('https://example.com/x'))).toContain(
      '$.http.fetch: refused',
    );
  });

  test('a redirect is followed, and the hook on http.fetch sees one call, not one for each hop', async () => {
    const fetcher = scripted(reply(302, '', { location: '/final' }), reply(200, 'done'));
    const h = await apiHarness({ ports: { fetcher } });
    expect(await h.api.http.fetch('https://example.com/start')).toMatchObject({ text: 'done' });
    expect(fetcher.requests.map((request) => request.url)).toEqual([
      'https://example.com/start',
      'https://example.com/final',
    ]);
  });
});
