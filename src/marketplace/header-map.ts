import { isRoutingHeader } from '../format/marketplace/header-names.ts';
import type { HeaderMap } from './types.ts';

/**
 * Header maps as the kit passes them to a download: names lower case, as on the `HttpClient` port
 * (`HeaderMap`). HTTP header names are case-insensitive, so "a header of the same name"
 * (plugins/host-marketplace.md, "Authenticate archive downloads") is compared without regard to
 * case; of two spellings in one map the later wins (spec/judgments.md).
 */
export function normalizeHeaders(headers: Readonly<Record<string, string>>): HeaderMap {
  const lowered: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) lowered[name.toLowerCase()] = value;
  return lowered;
}

/** `later` replaces a header of the same name in `earlier`: the entry's value over the source's. */
export function mergeHeaders(earlier: HeaderMap, later: HeaderMap): HeaderMap {
  return { ...normalizeHeaders(earlier), ...normalizeHeaders(later) };
}

/** `headers` without the request-routing and client-identity names; authentication names stay. */
export function withoutRoutingHeaders(headers: HeaderMap): HeaderMap {
  return Object.fromEntries(Object.entries(headers).filter(([name]) => !isRoutingHeader(name)));
}
