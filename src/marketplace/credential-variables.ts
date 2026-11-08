/**
 * The environment variables Claude Code removes before it runs a helper command it did not write
 * (plugins/host-marketplace.md, "Write the headersHelper command", "Variables Claude Code
 * removes": "by the same rule it applies to an MCP `headersHelper`"; mcp.md, "Which variables a
 * helper can read"): "Apart from Git's `GIT_CONFIG_KEY_<n>` variables, Claude Code removes every
 * variable ... whose name looks like a credential, such as a name with `TOKEN`, `SECRET`,
 * `PASSWORD`, `KEY`, or `AUTH` in it in either letter case ... Claude Code also removes a fixed
 * list of credential variables whose names don't follow that pattern, such as
 * `ANTHROPIC_CUSTOM_HEADERS`." The pattern is the docs' own; the fixed list is only partly named,
 * so it holds only the names the docs give (spec/judgments.md).
 */
const CREDENTIAL_PATTERN = /TOKEN|SECRET|PASSWORD|KEY|AUTH/i;
const GIT_CONFIG_KEY = /^GIT_CONFIG_KEY_\d+$/;
const FIXED_LIST: ReadonlySet<string> = new Set(['ANTHROPIC_CUSTOM_HEADERS']);

export function isCredentialVariable(name: string): boolean {
  if (FIXED_LIST.has(name)) return true;
  return CREDENTIAL_PATTERN.test(name) && !GIT_CONFIG_KEY.test(name);
}

/** `environment` without its credential variables. */
export function withoutCredentials(
  environment: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(environment).filter(([name]) => !isCredentialVariable(name)),
  );
}
