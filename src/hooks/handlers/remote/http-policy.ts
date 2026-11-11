import { warning, type PluginIssue } from '../../../format/issues.ts';
import { matchesWildcard } from '../../../format/wildcard.ts';

/**
 * The two outer limits on `http` hooks (hooks.md, "Hook locations"; settings-reference.md,
 * `allowedHttpHookUrls` and `httpHookAllowedEnvVars`). They "apply to hooks from every source,
 * including managed policy settings", and the merged lists are the settings stream's: the host
 * passes them, already merged, in `RunContext.httpPolicy`.
 */
export interface HttpHookPolicy {
  /**
   * "When you define this key, Claude Code runs an HTTP hook only if its URL matches one of the
   * patterns and blocks the rest without running them; an empty array blocks every HTTP hook."
   * Patterns are URLs with `*` as a wildcard; unset allows any URL.
   */
  readonly allowedUrls?: readonly string[];
  /**
   * "A hook can use a variable only if both its own `allowedEnvVars` and this key name it." Unset
   * leaves each hook's own list.
   */
  readonly allowedEnvVars?: readonly string[];
}

const AUTHORITY = /^([a-z][a-z0-9+.-]*:\/\/)([^/?#]*)(.*)$/i;

/**
 * "Hostname matching is case-insensitive and treats `hooks.example.com.`, with the trailing dot
 * that marks a fully qualified domain name, the same as `hooks.example.com`." Judgment
 * (spec/judgments.md): the scheme is case-insensitive too (RFC 3986), and only the host is
 * normalised; a path, a query and a port stay as written.
 */
function normalizeUrl(text: string): string {
  const parts = AUTHORITY.exec(text);
  if (parts === null) return text;
  const [, scheme = '', authority = '', rest = ''] = parts;
  const host = authority.toLowerCase().replace(/\.(?=:|$)/, '');
  return `${scheme.toLowerCase()}${host}${rest}`;
}

/** Whether `url` may run under the merged allowlist; no list allows every URL. */
export function urlAllowed(url: string, allowedUrls: readonly string[] | undefined): boolean {
  if (allowedUrls === undefined) return true;
  const target = normalizeUrl(url);
  return allowedUrls.some((pattern) => matchesWildcard(normalizeUrl(pattern), target));
}

/** The variables a hook may interpolate: its own list, cut to the settings list when one is set. */
export function permittedEnvVars(
  own: readonly string[] | undefined,
  policy: HttpHookPolicy | undefined,
): readonly string[] | undefined {
  const outer = policy?.allowedEnvVars;
  if (outer === undefined) return own;
  const limit = new Set(outer);
  return (own ?? []).filter((name) => limit.has(name));
}

/** The issue of an `http` hook whose URL the allowlist blocks; the hook does not run. */
export function blockedUrlIssue(path: string, url: string): PluginIssue {
  return warning(
    path,
    `The http hook for ${url} is blocked by allowedHttpHookUrls and does not run.`,
  );
}
