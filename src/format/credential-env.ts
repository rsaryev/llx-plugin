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

/**
 * The credential rule of every process the kit starts for a command it did not write (mcp.md,
 * "Which variables a helper can read"; plugins/host-marketplace.md, "Variables Claude Code removes"):
 * "Apart from Git's `GIT_CONFIG_KEY_<n>` variables, Claude Code removes every variable from your
 * environment whose name looks like a credential, such as a name with `TOKEN`, `SECRET`, `PASSWORD`,
 * `KEY`, or `AUTH` in it in either letter case ... Claude Code also removes a fixed list of
 * credential variables whose names don't follow that pattern, such as `ANTHROPIC_CUSTOM_HEADERS`."
 * The pattern is the docs' own. The fixed list is only partly named: `ANTHROPIC_CUSTOM_HEADERS` is
 * the docs', the OpenTelemetry exporter headers (which carry `Authorization` values) are the kit's
 * judgment (spec/judgments.md).
 */
const CREDENTIAL_NAME_PATTERN = /TOKEN|SECRET|PASSWORD|KEY|AUTH/i;
const GIT_CONFIG_KEY = /^GIT_CONFIG_KEY_\d+$/;

export const FIXED_CREDENTIAL_NAMES = [
  'ANTHROPIC_CUSTOM_HEADERS',
  'OTEL_EXPORTER_OTLP_HEADERS',
  'OTEL_EXPORTER_OTLP_TRACES_HEADERS',
  'OTEL_EXPORTER_OTLP_METRICS_HEADERS',
  'OTEL_EXPORTER_OTLP_LOGS_HEADERS',
] as const;

const FIXED: ReadonlySet<string> = new Set(FIXED_CREDENTIAL_NAMES);

/** True for a variable name that looks like a credential, by the pattern or the fixed list. */
export function isCredentialVariable(name: string): boolean {
  if (FIXED.has(name)) return true;
  return CREDENTIAL_NAME_PATTERN.test(name) && !GIT_CONFIG_KEY.test(name);
}

/** `environment` without its credential variables. */
export function withoutCredentials(
  environment: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(environment).filter(([name]) => !isCredentialVariable(name)),
  );
}

/** `scheme://` and the userinfo up to its `@`, for each URL in a value. */
const USERINFO = /([a-z][a-z0-9+.-]*:\/\/)[^/?#@\s]*@/gi;
const PASSWORD_IN_USERINFO = /[a-z][a-z0-9+.-]*:\/\/[^/?#@\s:]*:[^/?#@\s]+@/i;

/** Whether `value` holds a URL whose userinfo carries a password: "a value that looks like a credential". */
export const hasUrlPassword = (value: string): boolean => PASSWORD_IN_USERINFO.test(value);

/** `value` with the username and password cut from every URL in it. */
export const withoutUserinfo = (value: string): string => value.replace(USERINFO, '$1');

/** What the scrub does to one variable (env-vars.md, "What the subprocess environment scrub removes"). */
export type ScrubAction = 'remove' | 'keep' | 'cut-userinfo';

interface ScrubRule {
  readonly decide: (name: string, value: string) => ScrubAction | undefined;
}

const exactly =
  (names: ReadonlySet<string>, action: ScrubAction): ScrubRule['decide'] =>
  (name) =>
    names.has(name) ? action : undefined;

/**
 * "Leaves it in place, so that `gh` and scripts that call the GitHub API keep working", and
 * "including a username and password in the URL" for the proxies. The proxies are matched in their
 * lower-case spelling too, the same variable on a Unix host (judgment).
 */
const KEPT_NAMES: ReadonlySet<string> = new Set([
  'GITHUB_TOKEN',
  'GH_TOKEN',
  'GH_ENTERPRISE_TOKEN',
  'GITHUB_ENTERPRISE_TOKEN',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'http_proxy',
  'https_proxy',
]);

/** Registry URLs: "keeps the URL and cuts the username and password from it". The list is partly judgment. */
const REGISTRY_URL_NAMES: ReadonlySet<string> = new Set([
  'PIP_INDEX_URL',
  'PIP_EXTRA_INDEX_URL',
  'NPM_CONFIG_REGISTRY',
  'npm_config_registry',
  'UV_INDEX_URL',
  'UV_EXTRA_INDEX_URL',
]);

const GIT_CONFIG_ENTRY = /^GIT_CONFIG_(?:COUNT|KEY_\d+|VALUE_\d+)$/;

/**
 * First rule that decides wins: what is kept whatever it holds comes first. A registry URL with any
 * userinfo is cut, a bare token as the username included (judgment); another URL is removed only
 * when it carries a password, so an `ssh://git@host` value stays.
 */
const SCRUB_RULES: readonly ScrubRule[] = [
  { decide: (name) => (GIT_CONFIG_ENTRY.test(name) ? 'keep' : undefined) },
  { decide: exactly(KEPT_NAMES, 'keep') },
  { decide: exactly(new Set(['CLAUDE_CONFIG_DIR']), 'remove') },
  { decide: (name) => (isCredentialVariable(name) ? 'remove' : undefined) },
  {
    decide: (name, value) =>
      REGISTRY_URL_NAMES.has(name) && withoutUserinfo(value) !== value ? 'cut-userinfo' : undefined,
  },
  { decide: (_name, value) => (hasUrlPassword(value) ? 'remove' : undefined) },
];

/** What the scrub does to the variable `name` holding `value`; a variable no rule names is kept. */
export function scrubAction(name: string, value: string): ScrubAction {
  for (const rule of SCRUB_RULES) {
    const decided = rule.decide(name, value);
    if (decided !== undefined) return decided;
  }
  return 'keep';
}
