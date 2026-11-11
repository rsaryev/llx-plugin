import { error, type PluginIssue } from '../format/issues.ts';
import type { HttpClient } from '../ports/http-client.ts';
import { isBlockedHost } from './blocked-hosts.ts';
import { downloadFollowing, originOf } from './http-download.ts';
import type { HeaderMap, MarketplaceFetchPlan } from './types.ts';

/**
 * Running the `http-file` plan of a `url` marketplace source (plugins/host-marketplace.md, "Stay
 * within the download limits for hosted files"): the plan's 5 MiB and 10 seconds, and a redirect to
 * a different origin "must use `https://` and can't point at a loopback, link-local, or
 * cloud-metadata host", its request carrying none of the configured headers. The docs give no
 * redirect count for this file: the archive's five holds, and a same-origin redirect is followed
 * unjudged (judgment, spec/judgments.md). `readMarketplaceText` reads what comes back.
 */

export type HttpFilePlan = Extract<MarketplaceFetchPlan, { readonly kind: 'http-file' }>;

const MAX_REDIRECTS = 5;

/** Why a redirect from `from` to `target` is refused: only one that leaves the origin is judged. */
function refuseCrossOrigin(target: string, from: string): string | undefined {
  if (originOf(target) === originOf(from)) return undefined;
  const refused = (why: string): string => `The redirect to "${target}" is refused: ${why}`;
  if (!/^https:\/\//i.test(target)) return refused('another origin must use https://');
  return isBlockedHost(new URL(target).hostname)
    ? refused('it points at a loopback, link-local or cloud-metadata host')
    : undefined;
}

/**
 * Downloads the marketplace file: its text, or the issue that refuses it. `headers` are the ones the
 * host resolved for the source (`resolveHeaders` over `urlSourceLayer`, the command's output
 * included); absent, the plan's own `headers`.
 */
export async function fetchMarketplaceFile(
  plan: HttpFilePlan,
  ports: { readonly http: HttpClient },
  options: { readonly signal: AbortSignal; readonly headers?: HeaderMap },
): Promise<{ readonly text: string } | PluginIssue> {
  const response = await downloadFollowing(
    {
      url: plan.url,
      headers: options.headers ?? plan.headers,
      as: 'text',
      timeoutMs: plan.timeoutMs,
      maxBytes: plan.maxBytes,
      maxRedirects: MAX_REDIRECTS,
      refuseHop: refuseCrossOrigin,
      path: 'url',
    },
    ports.http,
    options.signal,
  );
  if ('severity' in response) return response;
  return response.truncated
    ? error('url', `The marketplace file is larger than ${plan.maxBytes / (1024 * 1024)} MiB`)
    : { text: response.body };
}
