/**
 * The request-routing and client-identity header names a catalog entry may not set
 * (plugins/host-marketplace.md, "When Claude Code skips a headersHelper command or drops its
 * output": "Claude Code drops request-routing and client-identity names such as `Host`, `Cookie`,
 * and `X-Forwarded-*` ... and keeps authentication names such as `Authorization`").
 *
 * The docs say "such as": the kit drops exactly the names they give (spec/judgments.md).
 */
const EXACT = new Set(['host', 'cookie']);
const FORWARDED_PREFIX = 'x-forwarded-';

/** True for `Host`, `Cookie` and any `X-Forwarded-*`, in any letter case. */
export function isRoutingHeader(name: string): boolean {
  const lower = name.toLowerCase();
  return EXACT.has(lower) || lower.startsWith(FORWARDED_PREFIX);
}
