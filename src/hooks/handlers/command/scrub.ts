/**
 * `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` (env-vars.md, "What the subprocess environment scrub removes"):
 * "Set to `1` to strip credentials from the environments of the subprocesses Claude Code starts, such
 * as Bash commands, hooks, and stdio MCP servers". "The scrub recognizes a credential by its variable
 * name or by the shape of its value", and the docs' table is the contract this file keeps:
 *
 * | variable                                                         | the scrub                    |
 * | ---------------------------------------------------------------- | ---------------------------- |
 * | `ANTHROPIC_API_KEY`, `AWS_SECRET_ACCESS_KEY`, `NPM_TOKEN`, `DB_PASSWORD` | removes it (the name)  |
 * | `DATABASE_URL` that contains a password                          | removes it (the value)       |
 * | `PIP_INDEX_URL`, `NPM_CONFIG_REGISTRY` that contain a password   | keeps the URL, cuts the credentials |
 * | `CLAUDE_CONFIG_DIR`                                              | removes it                   |
 * | GitHub tokens, `HTTP_PROXY`, `HTTPS_PROXY`, `GIT_CONFIG_*`       | leaves them in place         |
 * | a secret whose name and value do not look like one               | leaves it in place           |
 *
 * Judgments (spec/judgments.md): the docs say a name "looks like a credential" without listing the
 * words, so a name is one when a `_`-separated part of it is `TOKEN`, `SECRET`, `PASSWORD`,
 * `PASSWD`, `CREDENTIAL(S)`, `API_KEY`, `PRIVATE_KEY` or `ACCESS_KEY`; a value is one when it holds a
 * URL with a password (`scheme://user:password@host`) or a PEM private key header. The index URLs are
 * the variables whose name ends in `INDEX_URL` or `REGISTRY`. The variables the kit itself exports
 * to a hook (`CLAUDE_PLUGIN_OPTION_<KEY>`) are the plugin's own and are never scrubbed.
 */

const SCRUB_FLAG = 'CLAUDE_CODE_SUBPROCESS_ENV_SCRUB';

/** "Set to `1`": the scrub is on. */
export const scrubRequested = (env: Readonly<Record<string, string | undefined>>): boolean =>
  env[SCRUB_FLAG] === '1';

type Decision = 'keep' | 'remove' | { readonly rewrite: string };

interface Variable {
  readonly name: string;
  readonly value: string;
  /** The name as the host compares names: upper-cased where they are case-insensitive. */
  readonly key: string;
}

/** A rule decides one variable or passes; the first that decides wins. */
type Rule = (variable: Variable) => Decision | undefined;

const KEPT_NAMES: ReadonlySet<string> = new Set([
  'GITHUB_TOKEN',
  'GH_TOKEN',
  'GH_ENTERPRISE_TOKEN',
  'GITHUB_ENTERPRISE_TOKEN',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'GIT_CONFIG_COUNT',
]);
const KEPT_PATTERN = /^GIT_CONFIG_(?:KEY|VALUE)_\d+$/;

const CREDENTIAL_NAME =
  /(?:^|_)(?:TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIALS?|API_?KEY|PRIVATE_?KEY|ACCESS_?KEY)(?:_|$)/i;
const INDEX_URL_NAME = /(?:^|_)(?:INDEX_URL|REGISTRY)$/i;
const URL_PASSWORD = /([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]*:[^\s/@]+@/i;
const PRIVATE_KEY_BLOCK = /-----BEGIN [A-Z ]*PRIVATE KEY-----/;

const leaveWhatTheDocsNameAlone: Rule = ({ key }) =>
  KEPT_NAMES.has(key) || KEPT_PATTERN.test(key) ? 'keep' : undefined;

const removeConfigDir: Rule = ({ key }) => (key === 'CLAUDE_CONFIG_DIR' ? 'remove' : undefined);

const cutIndexCredentials: Rule = ({ name, value }) =>
  INDEX_URL_NAME.test(name) && URL_PASSWORD.test(value)
    ? { rewrite: value.replace(new RegExp(URL_PASSWORD, 'gi'), '$1') }
    : undefined;

const removeByName: Rule = ({ name }) => (CREDENTIAL_NAME.test(name) ? 'remove' : undefined);

const removeByValue: Rule = ({ value }) =>
  URL_PASSWORD.test(value) || PRIVATE_KEY_BLOCK.test(value) ? 'remove' : undefined;

/** In the order they apply: what is explicitly left in place wins over every name and value shape. */
const RULES: readonly Rule[] = [
  leaveWhatTheDocsNameAlone,
  removeConfigDir,
  cutIndexCredentials,
  removeByName,
  removeByValue,
];

const decide = (variable: Variable): Decision =>
  RULES.reduce<Decision | undefined>((found, rule) => found ?? rule(variable), undefined) ?? 'keep';

/** The environment with its credentials removed; `windows` compares the explicit names without case. */
export function scrubEnvironment(
  env: Readonly<Record<string, string>>,
  windows: boolean,
): Record<string, string> {
  const kept: [string, string][] = [];
  for (const [name, value] of Object.entries(env)) {
    const decision = decide({ name, value, key: windows ? name.toUpperCase() : name });
    if (decision === 'keep') kept.push([name, value]);
    else if (decision !== 'remove') kept.push([name, decision.rewrite]);
  }
  return Object.fromEntries(kept);
}
