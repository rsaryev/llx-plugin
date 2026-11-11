import type { Environment } from '../../../ports/index.ts';

/**
 * Environment variables in the headers of an `http` hook (hooks.md, "HTTP hook fields"): `headers`
 * values "support environment variable interpolation using `$VAR_NAME` or `${VAR_NAME}` syntax.
 * Only variables listed in `allowedEnvVars` are resolved", "References to unlisted variables are
 * replaced with empty strings. Required for any env var interpolation to work."
 */

/** `${NAME}` or `$NAME`; a `$` that starts neither is plain text. */
const REFERENCE = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g;

/** Header injection: a line break in a variable would end the header and start another. */
const LINE_BREAKS = /[\r\n]/g;

/**
 * One header value with its references resolved. Judgment (spec/judgments.md): the text of a
 * variable is not read again (one pass), and its line breaks are dropped.
 */
function interpolateHeader(
  value: string,
  allowed: ReadonlySet<string>,
  environment: Environment,
): string {
  return value.replace(REFERENCE, (_reference, braced?: string, bare?: string) => {
    const name = braced ?? bare ?? '';
    return allowed.has(name) ? (environment.get(name) ?? '').replace(LINE_BREAKS, '') : '';
  });
}

/** Every header of the hook with its value interpolated; names are lower case (the port's rule). */
export function interpolateHeaders(
  headers: Readonly<Record<string, string>> | undefined,
  allowedEnvVars: readonly string[] | undefined,
  environment: Environment,
): Record<string, string> {
  const allowed = new Set(allowedEnvVars ?? []);
  return Object.fromEntries(
    Object.entries(headers ?? {}).map(([name, value]) => [
      name.toLowerCase(),
      interpolateHeader(value, allowed, environment),
    ]),
  );
}
