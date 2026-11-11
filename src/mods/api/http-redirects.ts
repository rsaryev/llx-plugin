/** One request of a `$.http.fetch` call, as it is sent. Header names are lower case. */
export interface Hop {
  readonly url: string;
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly auth?: string;
  readonly socketPath?: string;
}

const REDIRECTS: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);

/** Whether `url` is one `$.http.fetch` may request: `http` or `https`, the first request and every redirect. */
export const isWeb = (url: string): boolean => /^https?:\/\//i.test(url);

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
  if (!isWeb(url))
    throw new Error(`$.http.fetch: a redirect to ${url} is not an http or https URL`);
  const method = methodAfter(status, hop.method);
  const crossOrigin = originOf(url) !== originOf(hop.url);
  const headers = crossOrigin
    ? Object.fromEntries(
        Object.entries(hop.headers).filter(([name]) => CROSS_ORIGIN_HEADERS.has(name)),
      )
    : hop.headers;
  return { url, method, headers, ...carried(hop, method, crossOrigin) };
}

/**
 * What a redirect keeps besides the headers: the body when the method stays, the `auth` handle on
 * the same origin (a credential goes where the headers that may hold one go), and the socket always
 * ("redirects stay on it", claude-code/index.d.ts:5556).
 */
function carried(hop: Hop, method: string, crossOrigin: boolean): Partial<Hop> {
  const keepsBody = method === hop.method && hop.body !== undefined;
  const keepsAuth = !crossOrigin && hop.auth !== undefined;
  return {
    ...(keepsBody ? { body: hop.body } : {}),
    ...(keepsAuth ? { auth: hop.auth } : {}),
    ...(hop.socketPath === undefined ? {} : { socketPath: hop.socketPath }),
  };
}
