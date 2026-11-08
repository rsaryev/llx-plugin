/**
 * The credential variables of mcp.md ("Credential variables that read as empty"): in a remote MCP
 * server's `url` and `headers` they read as empty, set or not, and a `:-default` on them is ignored,
 * so a project's `.mcp.json` or a plugin cannot send them to the server it names. The single home of
 * the list: plugin servers (`loading/resolve/surfaces`) and servers of the settings scopes
 * (`mcp-env`) read it here.
 *
 * The page lists the names with "such as", so the full set is not published. Judgment
 * (spec/judgments.md): exactly the five names the page writes, matched exactly (a pattern such as
 * `*_TOKEN` would also swallow names the page says expand: `API_KEY`).
 */
export const CREDENTIAL_ENV_NAMES = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'AWS_BEARER_TOKEN_BEDROCK',
  'HTTPS_PROXY',
  'NPM_TOKEN',
] as const;

const COVERED: ReadonlySet<string> = new Set(CREDENTIAL_ENV_NAMES);

/** True for a name that reads as empty in the `url` and `headers` of a remote server. */
export const readsAsEmptyTowardRemote = (name: string): boolean => COVERED.has(name);

/** The phrase mcp.md tells the reader to search the debug file for. */
export const NOT_EXPANDED_TOWARD_REMOTE = 'never expanded toward a remote server';

/**
 * The debug-log line for a covered variable the user has set and a remote server's `url` or
 * `headers` references. The docs give the phrase, not the whole line; the rest is a judgment. It
 * names the variable and never its value.
 */
export const credentialDebugLine = (name: string): string =>
  `Environment variable ${name} is a credential and is ${NOT_EXPANDED_TOWARD_REMOTE}`;
