/** One request of a `$.http.fetch` call, as it is sent. Header names are lower case. */
export interface Hop {
  readonly url: string;
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
}

const REDIRECTS: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);

/**
 * The request headers a redirect to a different origin keeps (api.md, "Reach files, processes, and
 * the network"): "it keeps only the `accept`, `accept-language`, `content-type`, and `user-agent`
 * request headers you set and drops the rest".
 */
const CROSS_ORIGIN_HEADERS: ReadonlySet<string> = new Set([
  'accept',
  'accept-language',
  'content-type',
  'user-agent',
]);

/**
 * The method a redirect continues with. Judgment: the docs name no rule, so this is the fetch
 * standard's: 303 turns anything but `HEAD` into `GET`, 301 and 302 turn `POST` into `GET`, and 307
 * and 308 keep the method and the body.
 */
function methodAfter(status: number, method: string): string {
  if (status === 303) return method === 'HEAD' ? method : 'GET';
  return (status === 301 || status === 302) && method === 'POST' ? 'GET' : method;
}

/** The URL `location` points to from `from`, or `undefined` when it is not one. */
function resolveLocation(location: string, from: string): string | undefined {
  try {
    return new URL(location, from).href;
  } catch {
    return undefined;
  }
}

const originOf = (url: string): string | undefined => {
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
};

/** The request a redirect leads to, or `undefined` when `status` is not a redirect or its `location` is no URL. */
export function followHop(hop: Hop, status: number, location: string | undefined): Hop | undefined {
  if (!REDIRECTS.has(status) || location === undefined) return undefined;
  const url = resolveLocation(location, hop.url);
  if (url === undefined) return undefined;
  const method = methodAfter(status, hop.method);
  const crossOrigin = originOf(url) !== originOf(hop.url);
  const headers = crossOrigin
    ? Object.fromEntries(
        Object.entries(hop.headers).filter(([name]) => CROSS_ORIGIN_HEADERS.has(name)),
      )
    : hop.headers;
  const keepsBody = method === hop.method && hop.body !== undefined;
  return { url, method, headers, ...(keepsBody ? { body: hop.body } : {}) };
}
