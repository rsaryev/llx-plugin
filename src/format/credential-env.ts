import { readsAsEmptyInRemoteMcp } from './remote-mcp-credentials.ts';
import { removedFromHeadersHelper } from './helper-credentials.ts';
/**
 * The credential variables of mcp.md ("Credential variables that read as empty"): in a remote MCP
 * server's `url` and `headers` they read as empty, set or not, and a `:-default` on them is ignored,
 * so a project's `.mcp.json` or a plugin cannot send them to the server it names. The single home of
 * the list: plugin servers (`loading/resolve/surfaces`) and servers of the settings scopes
 * (`mcp-env`) read it here.
 *
 * The page lists names only "such as"; remote-mcp-credentials owns the oracle-proven full set.
 * The five names below are the documented examples, not the complete classifier.
 */
export const CREDENTIAL_ENV_NAMES = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'AWS_BEARER_TOKEN_BEDROCK',
  'HTTPS_PROXY',
  'NPM_TOKEN',
] as const;

/** True for a name that reads as empty in the `url` and `headers` of a remote server. */
export const readsAsEmptyTowardRemote = (name: string): boolean => readsAsEmptyInRemoteMcp(name);

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
    Object.entries(environment).filter(([name]) => !removedFromHeadersHelper(name)),
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

/**
 * The scrub's rules (env-vars.md, "What the subprocess environment scrub removes"): the table is the
 * docs', the rest is oracle 2.1.321, a hook printing its environment under the scrub
 * (spec/judgments.md). Every name compares without regard to case.
 * - A name is a credential when a `_`-separated word of it is one of `CREDENTIAL_WORDS`: `MY_AUTH`,
 *   `FOO_KEY`, `MY_PASS`, `SSH_AUTH_SOCK` go, `MONKEY`, `TOKENIZER`, `TOKENS`, `OAUTH`, `KEYCHAIN` stay.
 * - A value is a credential when it holds a URL with a password, a PEM private key or a JWT; a token
 *   by its prefix alone (`ghp_`, `sk-ant-`, `AKIA`) and a public key stay.
 * - The registry URLs keep the URL without its userinfo, a bare token as the username included.
 */
const CREDENTIAL_WORDS: ReadonlySet<string> = new Set([
  'TOKEN',
  'PASS',
  'PASSWD',
  'PASSWORD',
  'SECRET',
  'SECRETS',
  'CREDENTIAL',
  'CREDENTIALS',
  'KEY',
  'APIKEY',
  'PRIVATEKEY',
  'ACCESSKEY',
  'AUTH',
]);

/** "Leaves it in place": the GitHub tokens, so `gh` keeps working, and the proxies. */
const KEPT_NAMES: ReadonlySet<string> = new Set([
  'GITHUB_TOKEN',
  'GH_TOKEN',
  'GH_ENTERPRISE_TOKEN',
  'GITHUB_ENTERPRISE_TOKEN',
  'HTTP_PROXY',
  'HTTPS_PROXY',
]);

/** "Keeps the URL and cuts the username and password from it". */
const REGISTRY_URL_NAMES: ReadonlySet<string> = new Set([
  'PIP_INDEX_URL',
  'PIP_EXTRA_INDEX_URL',
  'NPM_CONFIG_REGISTRY',
  'UV_INDEX_URL',
  'UV_EXTRA_INDEX_URL',
  'YARN_REGISTRY',
]);

const REMOVED_NAMES: ReadonlySet<string> = new Set([
  'CLAUDE_CONFIG_DIR',
  ...FIXED_CREDENTIAL_NAMES,
]);
const GIT_CONFIG_ENTRY = /^GIT_CONFIG_(?:COUNT|KEY_\d+|VALUE_\d+)$/;
const PRIVATE_KEY_BLOCK = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/;
const JWT = /\beyJ[\w-]+\.eyJ[\w-]+\.[\w-]*/;

const nameIsCredential = (key: string): boolean =>
  key.split('_').some((word) => CREDENTIAL_WORDS.has(word));

const valueIsCredential = (value: string): boolean =>
  hasUrlPassword(value) || PRIVATE_KEY_BLOCK.test(value) || JWT.test(value);

type ScrubRule = (key: string, value: string) => ScrubAction | undefined;

/** First rule that decides wins: what the docs leave in place whatever it holds comes first. */
const SCRUB_RULES: readonly ScrubRule[] = [
  (key) => (GIT_CONFIG_ENTRY.test(key) || KEPT_NAMES.has(key) ? 'keep' : undefined),
  (key) => (REMOVED_NAMES.has(key) || nameIsCredential(key) ? 'remove' : undefined),
  (key, value) =>
    REGISTRY_URL_NAMES.has(key) && withoutUserinfo(value) !== value ? 'cut-userinfo' : undefined,
  (_key, value) => (valueIsCredential(value) ? 'remove' : undefined),
];

/** What the scrub does to the variable `name` holding `value`; a variable no rule names is kept. */
export function scrubAction(name: string, value: string): ScrubAction {
  const key = name.toUpperCase();
  for (const rule of SCRUB_RULES) {
    const decided = rule(key, value);
    if (decided !== undefined) return decided;
  }
  return 'keep';
}
