/**
 * The host a `hostPattern` entry is matched against (settings-reference.md, `strictKnownMarketplaces`
 * "Allowed source types", `hostPattern`): the hostname of a `url` source, and of a `git` source
 * depending on the form of the git URL.
 */
import { SCHEME_URL } from './git-url.ts';

/** `user@host:path`, the SSH address without a scheme: "the host between `@` and `:`". */
const USER_AT_HOST = /^[^@:/\s]+@([^@:/\s]+):/;

/**
 * Wider forms the blocklist reads (judgment: the docs say only that "a host from a wider set of
 * forms" is taken): `host:path`, `host/path` and `user@host/path`.
 */
const SCHEMELESS = /^(?:[^@/\s]+@)?([^@:/\s]+)[:/]/;

/** A path on this machine, which has no host. */
const LOCAL_PATH = /^[/.~]/;

/** One letter before `:` is a Windows drive, which git also reads as a path. */
const DRIVE = /^[A-Za-z]:/;

/** The hostname of a URL with a scheme; `undefined` when it has none (`file:///x`) or does not parse. */
function schemeHost(text: string): string | undefined {
  try {
    const { hostname } = new URL(text);
    return hostname === '' ? undefined : hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

/** The hostname of a `url` source (judgment: lower case, as the URL parser spells it). */
export function hostOfUrl(address: string): string | undefined {
  return SCHEME_URL.test(address) ? schemeHost(address) : undefined;
}

/**
 * The host of a `git` source's URL. `wide` is the blocklist: it also reads an address with no
 * scheme and no `user@`. Anything else has no host (`undefined`).
 */
export function hostOfGit(address: string, wide: boolean): string | undefined {
  if (SCHEME_URL.test(address)) return schemeHost(address);
  const scp = USER_AT_HOST.exec(address)?.[1];
  if (scp !== undefined) return scp.toLowerCase();
  if (!wide || LOCAL_PATH.test(address) || DRIVE.test(address)) return undefined;
  return SCHEMELESS.exec(address)?.[1]?.toLowerCase();
}
