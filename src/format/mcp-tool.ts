import { isRecord } from '../protocol/is-record.ts';
/**
 * What a server's `tools/list` entry says about a tool and the name Claude sees (mcp.md, "Tools with
 * names longer than 128 characters", "Require approval for a specific tool", "Mark tools that are
 * safe to call twice", "Raise the limit for a specific tool", "Plugin-provided MCP servers"; plugins/
 * components.md, "Server names, tool names, and reloads"). Pure data: listing the tools, calling
 * them and prompting are the host's. The shapes of a tool's input schema are in `mcp-tool-schema`.
 */

const PREFIX = 'mcp__';
const SEPARATOR = '__';

/** `my.server` is `my_server`: the characters outside `A-Za-z0-9_-` become `_` (mcp.md, "Plugin MCP tool names"). */
export const normalizeMcpServerName = (name: string): string =>
  name.replace(/[^A-Za-z0-9_-]/g, '_');

/**
 * The server name of a plugin's MCP server (mcp.md, "Plugin-provided MCP servers"): the plugin name
 * and the server key under one prefix, normalised as a whole, so `database-tools` of `my-plugin` is
 * `plugin_my-plugin_database-tools`.
 */
export const pluginMcpServerName = (pluginName: string, serverKey: string): string =>
  normalizeMcpServerName(`plugin_${pluginName}_${serverKey}`);

/** The callable name of a tool of `server`: `mcp__<server>__<tool>`. */
export const mcpToolName = (server: string, tool: string): string =>
  `${PREFIX}${normalizeMcpServerName(server)}${SEPARATOR}${tool}`;

/** "Claude Code leaves an MCP tool out of the tools it sends to Claude when its full name is over 128 characters." */
export const MCP_TOOL_NAME_LIMIT = 128;

export type McpSendCheck = { readonly sent: true } | { readonly sent: false; readonly log: string };

/**
 * Whether a tool goes to the model, and the debug line when it does not (errors.md, "MCP tool name
 * over 128 characters"). The count is the name's length in UTF-16 code units, as the API counts a
 * string (spec/judgments.md: the docs say "characters").
 */
export function mcpToolSendCheck(fullName: string): McpSendCheck {
  if (fullName.length <= MCP_TOOL_NAME_LIMIT) return { sent: true };
  return {
    sent: false,
    log: `Tool "${fullName}" is not sent to Claude: its name has ${fullName.length} characters and the API accepts at most ${MCP_TOOL_NAME_LIMIT}`,
  };
}

/** What a tool's entry declares, read once. */
export interface McpToolHints {
  /** `annotations.readOnlyHint` is `true`: "the tool changes nothing". */
  readonly readOnly: boolean;
  /** `annotations.idempotentHint` is `true`: calling it again with the same arguments is safe. */
  readonly idempotent: boolean;
  /** Either hint: Claude Code can repeat a call that was pending when a connection closed. */
  readonly safeToRepeat: boolean;
  /** "Claude Code also runs the tool's calls in parallel with other read-only calls": `readOnlyHint` only. */
  readonly parallelWithReadOnly: boolean;
  /** `_meta["anthropic/maxResultSizeChars"]`, cut to the ceiling; absent when the tool declares none. */
  readonly maxResultSizeChars?: number;
  /** `_meta["anthropic/requiresUserInteraction"]` is the JSON Boolean `true`. */
  readonly requiresUserInteraction: boolean;
}

/** "Up to a hard ceiling of 500,000 characters." */
export const MCP_RESULT_SIZE_CEILING = 500_000;

const MAX_RESULT_SIZE = 'anthropic/maxResultSizeChars';
const REQUIRES_INTERACTION = 'anthropic/requiresUserInteraction';

const memberOf = (value: unknown, key: string): unknown =>
  isRecord(value) ? value[key] : undefined;

/**
 * Judgment (spec/judgments.md): a size that is not a positive finite number declares no limit and a
 * fraction is cut to a whole number of characters; the docs only describe a number up to the ceiling.
 */
function sizeOf(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) return undefined;
  return Math.min(Math.floor(value), MCP_RESULT_SIZE_CEILING);
}

/**
 * The hints of one `tools/list` entry. A hint counts only as the JSON value `true` ("The value must
 * be the JSON Boolean `true`; any other value is ignored" is said of `requiresUserInteraction`; the
 * other two are "set ... to `true`").
 */
export function readMcpToolHints(entry: unknown): McpToolHints {
  const annotations = memberOf(entry, 'annotations');
  const meta = memberOf(entry, '_meta');
  const readOnly = memberOf(annotations, 'readOnlyHint') === true;
  const idempotent = memberOf(annotations, 'idempotentHint') === true;
  const size = sizeOf(memberOf(meta, MAX_RESULT_SIZE));
  return {
    readOnly,
    idempotent,
    safeToRepeat: readOnly || idempotent,
    parallelWithReadOnly: readOnly,
    ...(size === undefined ? {} : { maxResultSizeChars: size }),
    requiresUserInteraction: memberOf(meta, REQUIRES_INTERACTION) === true,
  };
}

/**
 * Whether a server lists a tool for Claude (mcp.md, "Tool availability": "The server lists the tool for
 * its own interface and not for Claude ... add `model` to the tool's `_meta.ui.visibility` to give
 * Claude the tool"). Judgment (spec/judgments.md): an entry with no `_meta.ui.visibility` array, or
 * with a malformed one, is visible; an array without `model` hides the tool from Claude.
 */
export function modelVisibleMcpTool(entry: unknown): boolean {
  const visibility = memberOf(memberOf(memberOf(entry, '_meta'), 'ui'), 'visibility');
  return !Array.isArray(visibility) || visibility.includes('model');
}

/**
 * The callable names of the tools of one server that "require explicit approval on every call", for
 * `DecideContext.requiresUserInteraction` of the permission check. `server` is the name the tools are
 * registered under (`pluginMcpServerName` for a plugin's).
 */
export function requiringInteraction(
  server: string,
  tools: readonly unknown[],
): ReadonlySet<string> {
  return new Set(
    tools.flatMap((entry) => {
      const name = memberOf(entry, 'name');
      return typeof name === 'string' && readMcpToolHints(entry).requiresUserInteraction
        ? [mcpToolName(server, name)]
        : [];
    }),
  );
}

export type McpPromptToolAnswer =
  | { readonly behavior: 'allow' }
  | { readonly behavior: 'deny'; readonly message: string };

/** errors.md and mcp.md quote it. */
const PROMPT_TOOL_REFUSAL =
  'MCP tool requires user interaction; not supported via --permission-prompt-tool';

/**
 * What a `--permission-prompt-tool` result means for a call: "an `allow` result from the prompt tool
 * for a flagged tool is converted to a deny with the message `MCP tool requires user interaction;
 * not supported via --permission-prompt-tool`". A deny, and any call to an unflagged tool, stands.
 */
export function mcpPromptToolAnswer(
  flagged: boolean,
  answer: McpPromptToolAnswer,
): McpPromptToolAnswer {
  return flagged && answer.behavior === 'allow'
    ? { behavior: 'deny', message: PROMPT_TOOL_REFUSAL }
    : answer;
}

/**
 * The error of a run whose `--permission-prompt-tool` is not among the connected MCP tools when the
 * first permission decision is needed (errors.md, "MCP permission prompt tool not found"). The run
 * exits with code 1; `available` names the connected MCP tools, and none reads `none`.
 */
export function permissionPromptToolNotFound(tool: string, available: readonly string[]): string {
  const list = available.length === 0 ? 'none' : available.join(', ');
  return `Error: MCP tool ${tool} (passed via --permission-prompt-tool) not found. Available MCP tools: ${list}`;
}
