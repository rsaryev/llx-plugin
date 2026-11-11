/**
 * host-marketplace.md § Stay within the download limits for hosted files: a `marketplace.json` from a
 * `url` marketplace source is at most 5 MiB, the server has 10 seconds, "a redirect to a different
 * origin must use `https://` and can't point at a loopback, link-local, or cloud-metadata host", and
 * "a request that a redirect sends to a different origin carries none of the headers you configured".
 * Judgment (spec/judgments.md, `fetchMarketplaceFile`): the docs give no redirect count for this file,
 * so the archive's five holds; a same-origin redirect is not judged.
 */
import { describe, expect, test } from 'bun:test';
import {
  fetchMarketplaceFile,
  type HttpFilePlan,
} from '../../src/marketplace/marketplace-download.ts';
import { planMarketplaceFetch } from '../../src/marketplace/marketplace-fetch-plan.ts';
import { recordingHttp, type HttpReply } from '../support/ports.ts';
import { spec } from '../support/spec.ts';

const URL_0 = 'https://market.example.com/marketplace.json';
const signal = new AbortController().signal;
const moved = (location: string): HttpReply => ({ status: 302, headers: { location } });
const BODY = '{"name":"m","owner":{"name":"o"},"plugins":[]}';

function planFor(url = URL_0): HttpFilePlan {
  const plan = planMarketplaceFetch({ kind: 'url', url, headers: { Authorization: 'Bearer t' } });
  if (!('kind' in plan) || plan.kind !== 'http-file') throw new Error('not an http-file plan');
  return plan;
}

const run = (replies: readonly HttpReply[], plan = planFor()) => {
  const http = recordingHttp(...replies);
  return { result: fetchMarketplaceFile(plan, { http }, { signal }), http };
};

spec(['marketplace.rule.Marketplace sources.url', 'marketplace.source.url'], () => {
  test('a GET within the limits of the plan, with its headers, gives the text', async () => {
    const fetched = run([{ status: 200, body: BODY }]);
    expect(await fetched.result).toEqual({ text: BODY });
    expect(fetched.http.requests[0]).toMatchObject({
      method: 'GET',
      url: URL_0,
      headers: { authorization: 'Bearer t' },
      as: 'text',
      timeoutMs: 10_000,
      maxBytes: 5_242_880,
      redirect: 'manual',
    });
  });

  test('a file past 5 MiB, a server error and a failed connection are refused', async () => {
    expect(await run([{ status: 200, body: BODY, truncated: true }]).result).toMatchObject({
      severity: 'error',
      message: 'The marketplace file is larger than 5 MiB',
    });
    expect(await run([{ status: 404 }]).result).toMatchObject({
      message: 'The server answered 404',
    });
    expect(await run([{ failure: 'timeout', message: 't' }]).result).toMatchObject({
      message: 'The server did not respond in time',
    });
  });
});

spec(
  'marketplace.hosting.When Claude Code skips a headersHelper command or drops its output.Redirect leaves the origin',
  () => {
    test('a redirect to another origin carries no headers, nor does any hop after it', async () => {
      const fetched = run([
        moved('https://cdn.example.net/m.json'),
        moved('https://market.example.com/back.json'),
        { status: 200, body: BODY },
      ]);
      expect(await fetched.result).toEqual({ text: BODY });
      expect(fetched.http.requests.map((request) => request.headers)).toEqual([
        { authorization: 'Bearer t' },
        {},
        {},
      ]);
    });
  },
);

describe('the redirects of a marketplace file (judgment)', () => {
  test('a cross-origin redirect must use https and not point at a blocked host', async () => {
    expect(await run([moved('http://cdn.example.net/m.json')]).result).toMatchObject({
      message:
        'The redirect to "http://cdn.example.net/m.json" is refused: another origin must use https://',
    });
    expect(await run([moved('https://169.254.169.254/m.json')]).result).toMatchObject({
      message:
        'The redirect to "https://169.254.169.254/m.json" is refused: it points at a loopback, link-local or cloud-metadata host',
    });
  });

  test('a same-origin redirect is followed, even over http', async () => {
    const fetched = run(
      [moved('/v2/marketplace.json'), { status: 200, body: BODY }],
      planFor('http://127.0.0.1:8080/marketplace.json'),
    );
    expect(await fetched.result).toEqual({ text: BODY });
    expect(fetched.http.requests[1]?.url).toBe('http://127.0.0.1:8080/v2/marketplace.json');
  });

  test('a sixth redirect is refused', async () => {
    const hops = Array.from({ length: 6 }, (_, at) => moved(`/hop${at}`));
    expect(await run(hops).result).toMatchObject({
      message: 'The download was redirected more than 5 times',
    });
  });

  test('the headers a host resolved replace the plan headers', async () => {
    const http = recordingHttp({ status: 200, body: BODY });
    await fetchMarketplaceFile(planFor(), { http }, { signal, headers: { 'x-token': 'h' } });
    expect(http.requests[0]?.headers).toEqual({ 'x-token': 'h' });
  });
});
