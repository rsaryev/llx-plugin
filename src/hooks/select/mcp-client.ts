import type { HookHandlerType } from '../../protocol/hook-config.ts';
import type { HookEvent } from '../../protocol/official.ts';
import type { EventFactsOf } from '../contracts.ts';
import { targetOf } from './matcher-targets.ts';

/**
 * hooks.md, "Events that fire before MCP servers are available": `SessionStart` at launch and every
 * `Setup` event "skip their `mcp_tool` hooks without calling the tool", and "the debug log records
 * `mcp_tool hooks are not available for the 'SessionStart' hook event (no MCP client context)`".
 */

/** The handler types that call an MCP tool, so need the session's MCP servers. */
const CALLS_MCP: { readonly [T in HookHandlerType]: boolean } = {
  command: false,
  http: false,
  mcp_tool: true,
  prompt: false,
  agent: false,
};

/** Whether a handler of `type` is skipped on this occurrence of `event` for want of an MCP client. */
export const lacksMcpClient = <E extends HookEvent>(
  event: E,
  facts: EventFactsOf<E>,
  type: HookHandlerType,
): boolean => CALLS_MCP[type] && targetOf(event).mcpAvailable?.(facts) === false;

/** What the skip is reported as: the docs' own debug-log line (judgment: a warning, spec/judgments.md). */
export const noMcpClientMessage = (event: HookEvent): string =>
  `mcp_tool hooks are not available for the '${event}' hook event (no MCP client context) and are skipped`;
