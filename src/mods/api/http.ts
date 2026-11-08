import { z } from 'zod';
import { MOD_LIMITS } from '../../protocol/mods-limits.ts';
import type { ModsNamespaceApi } from '../types.ts';
import { call, parse, type Deps } from './call.ts';
import { followHop, type Hop } from './http-redirects.ts';
import { cutOutput } from './output-cut.ts';
import type { FetchResponse } from './ports.ts';

const init = z
  .looseObject({
    method: z.string().optional(),
    headers: z.record(z.string(), z.string()).optional(),
    body: z.string().optional(),
  })
  .default({});

const event = z.looseObject({
  url: z.string(),
  method: z.string(),
  headers: z.record(z.string(), z.string()),
  body: z.string().optional(),
});

const lowerCased = (headers: Readonly<Record<string, string>>): Record<string, string> =>
  Object.fromEntries(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]));

const isWeb = (url: string): boolean => /^https?:\/\//i.test(url);

/** The reason a response is refused for its size: the end is the one the docs quote. */
const overLimit = (url: string, declared: string): string =>
  `${url}: Content-Length ${declared} is over the ${MOD_LIMITS.httpResponseBytes}-byte limit`;

/**
 * The body is refused when it is larger than the limit, counted in characters (reference.md,
 * "Limits"). Judgment: a character is a code point, as it is for the `drop` reason cut, so a
 * body of astral characters is measured by them and not by UTF-16 units.
 */
function checkBody(body: string | undefined): void {
  if (body === undefined || body.length <= MOD_LIMITS.httpRequestChars) return;
  const characters = Array.from(body).length;
  if (characters > MOD_LIMITS.httpRequestChars) {
    throw new Error(
      `$.http.fetch: the request body of ${characters} characters is over the ${MOD_LIMITS.httpRequestChars}-character limit`,
    );
  }
}

/** One call: up to five redirects and the body, all inside 30 seconds. */
async function send(deps: Deps, first: Hop): Promise<FetchResponse & { readonly last: Hop }> {
  const { clock, fetcher } = deps.ports;
  const started = clock.now();
  const deadline = new AbortController();
  const cancel = clock.setTimer(() => deadline.abort(), MOD_LIMITS.httpMs);
  const signal = AbortSignal.any([deps.signal, deadline.signal]);
  try {
    for (let hop = first, redirects = 0; ; redirects += 1) {
      const left = Math.max(1, MOD_LIMITS.httpMs - (clock.now() - started));
      const received = await fetcher.request({
        ...hop,
        timeoutMs: left,
        maxBytes: MOD_LIMITS.httpResponseBytes,
        signal,
      });
      if ('failure' in received) {
        const reason = deadline.signal.aborted
          ? `timed out after ${MOD_LIMITS.httpMs} ms`
          : received.message;
        throw new Error(`$.http.fetch: ${reason}`);
      }
      // Judgment: the port's header names are not trusted to be lower case, so `Content-Length` and `Location` are found whatever their case.
      const response = { ...received, headers: lowerCased(received.headers) };
      const next = followHop(hop, response.status, response.headers.location);
      if (next === undefined) return { ...response, last: hop };
      if (redirects >= MOD_LIMITS.redirects) {
        throw new Error(`$.http.fetch: more than ${MOD_LIMITS.redirects} redirects`);
      }
      hop = next;
    }
  } finally {
    cancel();
  }
}

async function fetchUrl(deps: Deps, e: unknown): Promise<unknown> {
  const { url, method, headers, body } = parse('$.http.fetch', event, e);
  if (!isWeb(url)) throw new Error(`$.http.fetch: ${url} is not an http or https URL`);
  checkBody(body);
  const hop: Hop = {
    url,
    method,
    headers: lowerCased(headers),
    ...(body === undefined ? {} : { body }),
  };
  const response = await send(deps, hop);
  const declared = response.headers['content-length'];
  // A HEAD request declares a length and sends no body, so the last request decides.
  if (
    response.last.method !== 'HEAD' &&
    declared !== undefined &&
    Number(declared) > MOD_LIMITS.httpResponseBytes
  ) {
    throw new Error(overLimit(response.last.url, declared));
  }
  return {
    status: response.status,
    ok: response.status >= 200 && response.status < 300,
    headers: response.headers,
    // The kit keeps the limit itself: the port is asked to stop at 4 MiB, and what it sends past that is cut.
    text: cutOutput(response.text, MOD_LIMITS.httpResponseBytes).text,
  };
}

/** `$.http.fetch(url, init)` over `http` or `https`: `{ status, ok, headers, text }` once the body is read. */
export const httpApi = (deps: Deps): ModsNamespaceApi<'http'> => ({
  fetch: async (...args) => {
    const url = parse('$.http.fetch', z.string(), args[0]);
    const given = parse('$.http.fetch', init, args[1]);
    checkBody(given.body);
    return call(
      deps,
      'http.fetch',
      {
        url,
        method: (given.method ?? 'GET').toUpperCase(),
        headers: lowerCased(given.headers ?? {}),
        ...(given.body === undefined ? {} : { body: given.body }),
      },
      (e) => fetchUrl(deps, e),
    );
  },
});
