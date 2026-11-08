import { BRACED_REFERENCE, isVariableName, splitDefault } from '../../format/mcp-env.ts';

/**
 * A `serverUrl` pattern against a server URL (managed-mcp.md, "How `serverUrl` entries match"):
 * `*` wildcards in the scheme, host, port and path; scheme and host case-insensitive and a trailing
 * FQDN dot ignored; paths case-sensitive; a pattern with no path matches any path. With no port, a
 * host written out in full allows the scheme's default port only (443 for `https`, 80 for `http`),
 * and a host with a `*` in it allows every port; `:*` allows every port and `:8443` that port.
 *
 * Judgments (spec/judgments.md): the server URL is read with the URL parser, so userinfo is never
 * part of the host, the default port written out equals no port and an IPv6 host keeps its brackets;
 * the path compared is the path and the query string (a fragment is never sent); a pattern or URL that
 * does not parse matches nothing; the glob is matched without backtracking blow-up, since the server's
 * URL is text a user controls.
 */

interface PatternParts {
  readonly scheme: string;
  readonly host: string;
  /** `undefined` when the pattern gives no port (an empty `:` counts as none). */
  readonly port: string | undefined;
  /** `undefined` when the pattern gives no path. */
  readonly path: string | undefined;
}

const PATTERN = /^([^:/]+):\/\/(\[[^\]]*\]|[^/:]*)(?::([^/]*))?(\/.*)?$/;

function parsePattern(text: string): PatternParts | undefined {
  const [, scheme, host, port, path] = PATTERN.exec(text) ?? [];
  if (scheme === undefined || host === undefined || host === '') return undefined;
  return { scheme, host, port: port === '' ? undefined : port, path };
}

/** The ports a URL without one is on; a scheme not listed has no default. */
const DEFAULT_PORTS: ReadonlyMap<string, string> = new Map([
  ['http', '80'],
  ['https', '443'],
  ['ws', '80'],
  ['wss', '443'],
]);

interface UrlParts {
  readonly scheme: string;
  readonly host: string;
  /** The port the server is on: the written one, or the scheme's default. */
  readonly port: string;
  /** Whether the URL names no port other than the scheme's default. */
  readonly defaultPort: boolean;
  readonly path: string;
}

function parseUrl(text: string): UrlParts | undefined {
  if (!URL.canParse(text)) return undefined;
  const url = new URL(text);
  const scheme = url.protocol.slice(0, -1);
  return {
    scheme,
    host: url.hostname,
    port: url.port === '' ? (DEFAULT_PORTS.get(scheme) ?? '') : url.port,
    defaultPort: url.port === '',
    path: url.pathname + url.search,
  };
}

/** `*` matches any run of characters, everything else is literal; two pointers, no recursion. */
function globMatches(pattern: string, text: string): boolean {
  let p = 0;
  let t = 0;
  let star = -1;
  let resume = 0;
  while (t < text.length) {
    if (pattern[p] === '*') {
      star = p;
      resume = t;
      p += 1;
    } else if (p < pattern.length && pattern[p] === text[t]) {
      p += 1;
      t += 1;
    } else if (star >= 0) {
      resume += 1;
      t = resume;
      p = star + 1;
    } else {
      return false;
    }
  }
  return pattern.slice(p).replaceAll('*', '') === '';
}

const withoutDot = (host: string): string => host.toLowerCase().replace(/\.$/, '');

/** Hostname rule: no port in the pattern allows every port only for a host with a `*` in it. */
function portMatches(want: PatternParts, have: UrlParts): boolean {
  if (want.port !== undefined) return globMatches(want.port, have.port);
  return want.host.includes('*') || have.defaultPort;
}

const pathMatches = (want: PatternParts, have: UrlParts): boolean =>
  want.path === undefined || globMatches(want.path, have.path);

export function urlPatternMatches(pattern: string, url: string): boolean {
  const want = parsePattern(pattern.trim());
  const have = parseUrl(url.trim());
  if (want === undefined || have === undefined) return false;
  return (
    globMatches(want.scheme.toLowerCase(), have.scheme) &&
    globMatches(withoutDot(want.host), withoutDot(have.host)) &&
    portMatches(want, have) &&
    pathMatches(want, have)
  );
}

/** Stands for a `${VAR}` while the shape of an entry is read; no URL holds it. */
const HOLE = '\u0000';

/**
 * Whether a `${VAR}` reference of an entry written as `template` sits in the scheme, host or path: the
 * "expansion that would change a URL entry's scheme, host, or path scope" that makes an allowlist
 * entry ignored (managed-mcp.md, "Environment variables in `serverCommand` and `serverUrl` entries").
 * A reference in the port or anywhere else leaves the scope as written. Judgment (spec/judgments.md):
 * the docs name the three parts without saying how an expansion "would change" one, so a reference
 * in any of them counts, and an entry that does not parse around its references (`${BASE}/*`) counts.
 */
export function referenceInUrlScope(template: string): boolean {
  const masked = template.replace(BRACED_REFERENCE, (raw, inner: string) =>
    isVariableName(splitDefault(inner).name) ? HOLE : raw,
  );
  if (!masked.includes(HOLE)) return false;
  const parts = parsePattern(masked);
  return parts === undefined || [parts.scheme, parts.host, parts.path ?? ''].some(has);
}

const has = (part: string): boolean => part.includes(HOLE);
