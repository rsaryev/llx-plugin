import { matchesWildcard } from '../../format/wildcard.ts';
/**
 * The URL pattern of `allowedHttpHookUrls` (settings-reference.md: "array of URL patterns, with `*` as a
 * wildcard"; "Hostname matching is case-insensitive and treats `hooks.example.com.`, with the trailing
 * dot that marks a fully qualified domain name, the same as `hooks.example.com`").
 *
 * The pattern and the address are compared as text after one normalization, which is the kit's
 * judgment where the docs are silent (spec/judgments.md): the scheme and the host are lower case, a
 * trailing dot on the host is dropped, and an address whose path is empty or a lone `/` is tried in
 * both spellings. The path, the port and the user information are compared as written, with one
 * exception: a pattern whose port is the wildcard (`http://localhost:*`) also matches the same host
 * with no port, because the docs read that example as "any `http://localhost` URL". `*` stands for
 * any run of characters, `/` included, and every other character matches itself.
 */
const ADDRESS = /^([a-z][a-z0-9+.-]*:\/\/)([^/?#]*)([\s\S]*)$/i;

/** `[::1]:80` or `host:80` as a host and the rest, which holds the port. */
const HOST_AND_PORT = /^(\[[^\]]*\]|[^:]*)([\s\S]*)$/;

function normalizeAuthority(authority: string): string {
  const at = authority.lastIndexOf('@');
  const userInformation = authority.slice(0, at + 1);
  const [, host = '', port = ''] = HOST_AND_PORT.exec(authority.slice(at + 1)) ?? [];
  return `${userInformation}${host.toLowerCase().replace(/\.$/, '')}${port}`;
}

/** The text with its scheme and host normalized; text that is no address is returned as it is. */
function normalize(text: string): { readonly text: string; readonly path: string | undefined } {
  const [, scheme, authority, path] = ADDRESS.exec(text) ?? [];
  if (scheme === undefined || authority === undefined || path === undefined) {
    return { text, path: undefined };
  }
  return { text: `${scheme.toLowerCase()}${normalizeAuthority(authority)}${path}`, path };
}

/** The spellings of an address to try: the root path is written with or without its slash. */
function spellings(text: string): readonly string[] {
  const normalized = normalize(text);
  if (normalized.path === '') return [normalized.text, `${normalized.text}/`];
  if (normalized.path === '/') return [normalized.text, normalized.text.slice(0, -1)];
  return [normalized.text];
}

/** `scheme://[user@]host`, then a port that is a lone `*`, then the rest of the pattern. */
const PORT_WILDCARD = /^([a-z][a-z0-9+.-]*:\/\/(?:[^/?#@]*@)?(?:\[[^\]]*\]|[^/?#:]+)):\*([\s\S]*)$/;

/** The patterns that stand for the host with no port: the `*` of the port then stood for a path. */
function withoutPort(pattern: string): readonly string[] {
  const [, origin, rest] = PORT_WILDCARD.exec(pattern) ?? [];
  if (origin === undefined || rest === undefined) return [];
  return [`${origin}${rest}`, `${origin}/*${rest}`];
}

export function matchUrlPattern(pattern: string, url: string): boolean {
  const wanted = normalize(pattern).text;
  const addresses = spellings(url);
  return [wanted, ...withoutPort(wanted)].some((each) =>
    addresses.some((address) => matchesWildcard(each, address)),
  );
}
