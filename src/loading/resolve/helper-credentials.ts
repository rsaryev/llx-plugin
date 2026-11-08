import { readsAsEmptyInRemoteMcp } from './remote-mcp-credentials.ts';

/**
 * The variables Claude Code removes from the environment of a `headersHelper` that a project
 * `.mcp.json` or a plugin supplies (mcp.md, "Which variables a helper can read": "every variable
 * ... whose name looks like a credential, such as a name with `TOKEN`, `SECRET`, `PASSWORD`, `KEY`,
 * or `AUTH` in it in either letter case", Git's `GIT_CONFIG_KEY_<n>` apart, and "a fixed list of
 * credential variables whose names don't follow that pattern"). The page gives the rule only by
 * example; this is Claude Code's, observed with `bun run oracle:headers-helper-env`
 * (spec/judgments.md, "headersHelper credential names") and checked against the recorded result by
 * tests/loading/helper-credentials.test.ts.
 */

/**
 * A name looks like a credential, without regard to case, when a part between underscores is one
 * of the words, when a part ends in `TOKEN`, `SECRET`, `PASSWORD` or `PASSWD` (`FOOSECRET`, not
 * `TOKENIZER`), or when `PASS` or `JWT` is a part after the first (`SERVICE_JWT`, not `JWT`).
 */
const CREDENTIAL_LIKE =
  /(?:^|_)(?:KEYS?|APIKEY|AUTH|CREDENTIALS?|CREDS|COOKIE|PAT|SECRETS|PASSWORDS)(?:_|$)|(?:TOKEN|SECRET|PASSWORD|PASSWD)(?:_|$)|_(?:PASS|JWT)(?:_|$)/i;

/** Git's configuration by environment, `GIT_CONFIG_KEY_<n>` in capitals as Git reads it, stays. */
const GIT_CONFIG_KEY = /^GIT_CONFIG_KEY_\d+$/;

/**
 * Of the names a remote server's `url` and `headers` read as empty, the ones a helper still
 * receives: the proxies and the package index addresses.
 */
const HELPER_KEEPS: ReadonlySet<string> = new Set([
  'ALL_PROXY',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'CLAUDE_CODE_CLIENT_CERT',
  'GOPROXY',
  'PIP_EXTRA_INDEX_URL',
  'PIP_INDEX_URL',
  'UV_DEFAULT_INDEX',
  'UV_EXTRA_INDEX_URL',
  'UV_INDEX',
  'UV_INDEX_URL',
]);

/** Whether a supplied `headersHelper` runs without `name` in its environment. */
export function removedFromHeadersHelper(name: string): boolean {
  if (GIT_CONFIG_KEY.test(name)) return false;
  if (CREDENTIAL_LIKE.test(name)) return true;
  return readsAsEmptyInRemoteMcp(name) && !HELPER_KEEPS.has(name.toUpperCase());
}
