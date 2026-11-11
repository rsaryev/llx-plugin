import { error, type PluginIssue } from '../format/issues.ts';
import type { HttpClient, HttpFailure, HttpResponse } from '../ports/http-client.ts';
import type { HeaderMap } from './types.ts';

/**
 * One download through `HttpClient` with its redirects followed by hand, so each hop is judged
 * (plugins/host-marketplace.md, "Stay within the download limits for hosted files"): at most
 * `maxRedirects` hops, each target passed to `refuseHop`, and a request sent to another origin
 * carries none of the configured headers, nor does any request after it. The one loop of the
 * `archive` zip and the `url` marketplace file; what a body must be is the caller's.
 */

export interface Download {
  readonly url: string;
  readonly headers: HeaderMap;
  readonly as: 'text' | 'bytes';
  readonly timeoutMs: number;
  readonly maxBytes: number;
  readonly maxRedirects: number;
  /** The reason a redirect from `from` to `target` is refused, or `undefined` to follow it. */
  readonly refuseHop: (target: string, from: string) => string | undefined;
  /** The issue path of every refusal. */
  readonly path: string;
}

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

const FAILURES: { readonly [F in HttpFailure['failure']]: string } = {
  connection: 'The download failed to connect',
  timeout: 'The server did not respond in time',
  aborted: 'The download was aborted',
};

export const originOf = (url: string): string | undefined => {
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
};

/** The next URL of a redirect, or the issue that refuses it. */
function followRedirect(
  response: HttpResponse,
  from: string,
  followed: number,
  download: Download,
): string | PluginIssue {
  const refuse = (message: string): PluginIssue => error(download.path, message);
  if (followed >= download.maxRedirects) {
    return refuse(`The download was redirected more than ${download.maxRedirects} times`);
  }
  const location = response.headers.location;
  if (location === undefined) return refuse('The server redirected without a location');
  let target: string;
  try {
    target = new URL(location, from).href;
  } catch {
    return refuse(`The redirect target "${location}" is not a URL`);
  }
  const refused = download.refuseHop(target, from);
  return refused === undefined ? target : refuse(refused);
}

/** The final response, a 2xx that is no redirect, or the issue that ends the download. */
export async function downloadFollowing(
  download: Download,
  http: HttpClient,
  signal: AbortSignal,
): Promise<HttpResponse | PluginIssue> {
  const start = originOf(download.url);
  let url = download.url;
  let sendHeaders = true;
  for (let followed = 0; ; followed += 1) {
    sendHeaders = sendHeaders && originOf(url) === start;
    const response = await http.request({
      method: 'GET',
      url,
      headers: sendHeaders ? download.headers : {},
      as: download.as,
      timeoutMs: download.timeoutMs,
      maxBytes: download.maxBytes,
      redirect: 'manual',
      signal,
    });
    if ('failure' in response) return error(download.path, FAILURES[response.failure]);
    if (!REDIRECTS.has(response.status)) {
      return response.status >= 200 && response.status <= 299
        ? response
        : error(download.path, `The server answered ${response.status}`);
    }
    const next = followRedirect(response, url, followed, download);
    if (typeof next !== 'string') return next;
    url = next;
  }
}
