import type { PermissionBehavior } from '../../protocol/official.ts';
import type { PermissionRule } from '../types.ts';

/**
 * MCP rules (permissions.md, "MCP"). A tool's callable name is `mcp__<server>__<tool>`, where the
 * server is the name Claude Code gives it (mcp.md: every character outside `A-Z`, `a-z`, `0-9`,
 * `_` and `-` becomes `_`). A rule names the server (`mcp__puppeteer`, `mcp__puppeteer__*`) or one
 * tool (`mcp__puppeteer__puppeteer_navigate`).
 */

const PREFIX = 'mcp__';
const SEPARATOR = '__';

/** `my.server` is `my_server`: the characters outside `A-Za-z0-9_-` become `_`. */
export const normalizeMcpServerName = (name: string): string =>
  name.replace(/[^A-Za-z0-9_-]/g, '_');

/**
 * The server name of a plugin's MCP server (mcp.md, "Plugin-provided MCP servers"): the plugin name
 * and the server key under one prefix, normalised as a whole, so `database-tools` of `my-plugin` is
 * `plugin_my-plugin_database-tools`.
 */
export const pluginMcpServerName = (pluginName: string, serverKey: string): string =>
  normalizeMcpServerName(`plugin_${pluginName}_${serverKey}`);

/** The callable name of a tool of `server`. */
export const mcpToolName = (server: string, tool: string): string =>
  `${PREFIX}${normalizeMcpServerName(server)}${SEPARATOR}${tool}`;

/**
 * An allow rule reads `mcp__<name>` as a server only when the name holds no `__` and does not end
 * in `_`: `mcp__reports__v2` is the tool `v2` of the server `reports`, and a trailing `_` would run
 * into the separator ("A `<server>` that contains `__` or ends in `_`: write the wildcard form").
 */
const isServerForm = (ruleToolName: string): boolean => {
  const server = ruleToolName.slice(PREFIX.length);
  return !server.includes(SEPARATOR) && !server.endsWith('_');
};

/**
 * Whether `toolName` is a tool of the server a bare allow rule names. The call carries no separate
 * server name, so a tool counts only when what follows the rule's name and `__` is a plain tool
 * name: `mcp__reports` does not cover `mcp__reports__v2__x`, which belongs to `reports__v2`.
 */
function allowCoversServer(ruleToolName: string, toolName: string): boolean {
  const start = `${ruleToolName}${SEPARATOR}`;
  return (
    isServerForm(ruleToolName) &&
    toolName.startsWith(start) &&
    !toolName.slice(start.length).includes(SEPARATOR)
  );
}

type Covers = (ruleToolName: string, toolName: string) => boolean;

/** A deny or ask rule also covers every tool whose name starts with the rule's name and `__`. */
const coversByPrefix: Covers = (ruleToolName, toolName) =>
  toolName.startsWith(`${ruleToolName}${SEPARATOR}`);

const BEYOND_THE_EXACT_NAME: { readonly [B in PermissionBehavior]: Covers } = {
  allow: allowCoversServer,
  deny: coversByPrefix,
  ask: coversByPrefix,
};

/**
 * Whether a rule's tool name, written without a `*`, covers the call of `toolName`. The name itself
 * always does. An `mcp__` name also covers the tools of the server it names; the three behaviours
 * differ for a server whose name holds `__` (permissions.md: as a deny or ask rule `mcp__reports`
 * and `mcp__reports__v2` also cover every tool of `reports__v2`, as an allow rule they do not).
 */
export function mcpToolRuleMatches(
  ruleToolName: string,
  toolName: string,
  behavior: PermissionBehavior,
): boolean {
  if (ruleToolName === toolName) return true;
  return ruleToolName.startsWith(PREFIX) && BEYOND_THE_EXACT_NAME[behavior](ruleToolName, toolName);
}

/**
 * The Cowork tools a bare `Bash` or `WebFetch` deny rule also blocks (permissions.md, "MCP"): in a
 * Cowork session Claude runs commands and fetches through these, and "Allow rules don't carry over".
 */
const COWORK_TOOL_OF: ReadonlyMap<string, string> = new Map([
  ['mcp__workspace__bash', 'Bash'],
  ['mcp__workspace__web_fetch', 'WebFetch'],
]);

/** Whether `rule` is a deny rule that names a whole built-in tool and `toolName` is that tool's Cowork twin. */
export function denyCoversCoworkTool(rule: PermissionRule, toolName: string): boolean {
  return (
    rule.behavior === 'deny' &&
    rule.specifier === undefined &&
    COWORK_TOOL_OF.get(toolName) === rule.value.toolName
  );
}
