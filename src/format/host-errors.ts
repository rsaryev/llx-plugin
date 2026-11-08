/**
 * The notices, warnings and errors Claude Code prints for the failures errors.md documents, each in
 * the wording the page quotes (docs/SPEC.md: message wording comes from the docs). Pure string
 * builders: the host decides when a failure happened and shows the text where the page says it
 * appears (conversation notice, stderr, debug log, `/status`).
 */

/** `~16.2k`: a token count as the notice shows it, one decimal in thousands. */
const thousands = (tokens: number): string => `${(tokens / 1000).toFixed(1)}k`;

/** The startup notice for a skill, command or workflow whose name uses `anthropic-skills`. */
export function reservedSkillNameNotice(input: {
  /** What to rename: a folder or file path, or the `name:` line to edit, as the first refused item shows it. */
  readonly rename: string;
  /** The reserved name the item uses: `anthropic-skills` or a name that starts with `anthropic-skills:`. */
  readonly name: string;
  /** How many more items were refused. */
  readonly more?: number;
}): string {
  const more = input.more !== undefined && input.more > 0 ? ` · ${input.more} more` : '';
  return `Not loaded: rename ${input.rename}, then restart — its name uses "${input.name}", a name reserved for the skills synced from your claude.ai account${more}`;
}

/** The startup notice when the agents' names and descriptions exceed 15,000 tokens. */
export function agentDescriptionsOverLimit(estimatedTokens: number, folder: string): string {
  return `Agent descriptions are over the 15.0k-token limit (~${thousands(estimatedTokens)} tokens) · ask Claude to trim agent descriptions in ${folder}`;
}

/** The size above which `.mcp.json` is refused: 2 MiB. */
export const MCP_JSON_LIMIT_BYTES = 2_097_152;

/** The error of a command that finds `.mcp.json` is not a regular file or is over 2 MiB. */
export const mcpJsonUnreadable = (): string =>
  `Can't read .mcp.json: it isn't a regular file or is larger than ${MCP_JSON_LIMIT_BYTES} bytes. Fix or remove it, then run the command again.`;

/** `claude mcp add` and `add-json` with `--scope managed`. */
export const cannotAddMcpToManagedScope = (): string => 'Cannot add MCP server to scope: managed';

/** The reasons the page lists for organization settings that could not load, as it names them. */
export function organizationSettingsUnavailable(reason: string, organization: string): string {
  return `Claude Code couldn't reach Anthropic to load your organization's settings (${reason}). ${organization} requires them before a session can start.`;
}

/** What the `Remote managed settings failed to load` warning says about the policy the session runs on. */
export type RemotePolicy = 'cached' | 'none';

const REMOTE_POLICY_TEXT: { readonly [P in RemotePolicy]: string } = {
  cached: 'using cached policy',
  none: 'no remote policy applied',
};

/** The warning when server-managed settings could not be fetched or applied; `cause` names what failed. */
export const remoteManagedSettingsFailed = (cause: string, policy: RemotePolicy): string =>
  `Remote managed settings failed to load (${cause}): ${REMOTE_POLICY_TEXT[policy]}`;

/** The state lines of the fetch that appear in the Code tab. */
export const REMOTE_MANAGED_SETTINGS_STILL_LOADING = 'Remote managed settings are still loading';
export const REMOTE_MANAGED_SETTINGS_DID_NOT_LOAD = 'Remote managed settings did not load';

/** The line when the settings loaded after one of the warnings; `applies` says whether a remote policy applies. */
export const remoteManagedSettingsLoaded = (applies: boolean): string =>
  `Remote managed settings have now loaded: ${applies ? 'remote policy applied' : 'no remote policy applied'}`;

/** The error of a name that imitates an official marketplace, on every plugin it affects. */
export const marketplaceNameRefused = (name: string): string =>
  `Claude Code refuses the marketplace name "${name}"`;

/** The marketplace's own error for an imitating name. */
export const MARKETPLACE_NAME_LOOKS_OFFICIAL =
  "Claude Code refuses this marketplace's name: it looks like one of Anthropic's own";

/** What `claude plugin marketplace add` says for an impersonating name. */
export const MARKETPLACE_NAME_IMPERSONATES =
  'Marketplace name impersonates an official Anthropic/Claude marketplace';

/** The refusal to add a marketplace whose name is another spelling of a reserved name. */
export function reservedSpellingRefusal(
  name: string,
  reserved: string,
  needsQuoting: boolean,
): string {
  return needsQuoting
    ? `This marketplace's name is another spelling of "${reserved}", a reserved marketplace name. It is not exactly the reserved name it appears to be.`
    : `Failed to add marketplace: "${name}" is another spelling of "${reserved}", a reserved marketplace name.`;
}

/** The warning for a registered entry whose name is another spelling of a reserved name. */
export const reservedSpellingIgnored = (name: string, reserved: string): string =>
  `known_marketplaces.json has an entry named "${name}", another spelling of the reserved marketplace name "${reserved}", so it is ignored. Remove it with: claude plugin marketplace remove ${name}`;

/** The stderr warning when denying the whole Bash tool leaves a Windows session with no shell tool. */
export const BASH_DENY_TURNS_OFF_POWERSHELL =
  'Denying Bash also turns off the PowerShell tool, so Claude has neither. To use PowerShell, set CLAUDE_CODE_USE_POWERSHELL_TOOL=1.';

/** The notification for an `asyncRewake` shell-form hook whose script path has a space and no quotes. */
export const hookNeedsQuotes = (event: string, script: string): string =>
  `${event} hook needs quotes around a path with a space (${script})`;

/** The startup banner row for a deny or ask rule of a file tool that file checks never consult. */
export const fileToolRuleBannerRow = (
  behavior: 'deny' | 'ask',
  rule: string,
  use: string,
): string => `⚠ ${behavior === 'deny' ? 'Deny' : 'Ask'} rule ${rule} never matches · use ${use}`;

/** The full warning for such a rule: `source` is a settings file path or the flag. */
export function fileToolRuleWarning(input: {
  readonly behavior: 'allow' | 'deny' | 'ask';
  readonly source: string;
  readonly rule: string;
  /** `Edit` or `Read`, the rule kind to write instead. */
  readonly use: string;
  /** `Write(docs/**)` becomes `Edit(docs/**)`. */
  readonly replacement: string;
}): string {
  return `Permission ${input.behavior} rule (${input.source}): ${input.rule} is not matched by file permission checks — only ${input.use}(path) rules are. Use ${input.replacement} instead (Edit rules cover all file-editing tools).`;
}

/** The startup banner row for a deny or ask rule whose tool name is unknown. */
export const matchesNoToolBannerRow = (behavior: 'deny' | 'ask', rule: string): string =>
  `⚠ ${behavior === 'deny' ? 'Deny' : 'Ask'} rule ${rule} matches no tool · check for typos`;

/** The error when a `claude plugin` command cannot ask for approval of managed settings. */
export const MANAGED_SETTINGS_NEED_APPROVAL =
  "Your organization's managed settings need your approval, which couldn't be asked for here. Run `claude` in a terminal and approve them, then run this command again.";

/** What Claude Code prints when the security approval dialog is declined. */
export const MANAGED_SETTINGS_NOT_APPROVED =
  'Managed settings were not approved; exiting without applying them.';

/** The result an MCP tool call gets when the server is turned off. */
export const mcpServerDisabled = (name: string): string =>
  `MCP server "${name}" is disabled — re-enable it via /mcp to use its tools`;

/** The warning for an MCP server whose name Claude Code reserves. */
export const mcpServerNameReserved = (name: string): string =>
  `"${name}" is a reserved MCP server name and was not loaded`;

/** The message for a Java MCP SDK server that rejects the elicitation capability. */
export const ELICITATION_REJECTED =
  'This server (Java MCP SDK 0.17.0 or older) rejected Claude Code\'s elicitation capability. Set "bareElicitationCapability": true for it, or upgrade to Java MCP SDK 0.17.1+ (Spring AI 1.0.7+ or 1.1.6+).';

/** The error result for a call to a tool that is not in the session's tool list; `hint` follows the name. */
export const noSuchTool = (name: string, hint?: string): string =>
  `Error: No such tool available: ${name}${hint === undefined ? '' : `.${hint.startsWith(' ') ? '' : ' '}${hint}`}`;

/** `/plugin` Errors tab: a path the operating system could not check (any error but "not found"). */
export const pathCouldNotBeChecked = (component: string, path: string, code: string): string =>
  `${component} path could not be checked: ${path} (${code})`;

/** The same error as `claude plugin list` prints it. */
export const pathCouldNotBeCheckedInList = (
  component: string,
  path: string,
  code: string,
): string => `Path not found: ${path} (${component}, ${code})`;

/** Where a marketplace plugin's manifest resolves when it is not inside the plugin or its marketplace. */
export function manifestNotRead(manifest: string, reason: string): string {
  return `Plugin not loaded: its manifest ${manifest} was not read, because ${reason}`;
}

/** The `/status` warning for `allowRead` or `allowedDomains` entries a managed lock ignores. */
export function sandboxAllowIgnored(input: {
  readonly lock: 'read' | 'domains';
  readonly count: number;
  readonly file: string;
}): string {
  const read = input.lock === 'read';
  const key = read ? 'sandbox.filesystem.allowRead' : 'sandbox.network.allowedDomains';
  const lock = read ? 'allowManagedReadPathsOnly' : 'allowManagedDomainsOnly';
  const honored = read
    ? 'only allowRead paths from managed settings are honored'
    : 'only allowed domains (and WebFetch domain rules) from managed settings are honored';
  const entries = input.count === 1 ? 'entry' : 'entries';
  return `${key} is ignored — managed settings set ${lock}, so ${honored}. The ${input.count} ${entries} in ${input.file} will NOT apply (see https://code.claude.com/docs/en/settings#sandbox-settings).`;
}

/** The startup notice for skill or command names Claude Code refused; `names` is the count. */
export const skillNamesRefused = (count: number): string =>
  `${count} skill or command name${count === 1 ? '' : 's'} refused: run with --debug to see which ([names]), rename, then restart — a name may not hold hidden, direction-changing or blank-like characters, < or >, or be over 256 characters`;
