import { toolNameMatches } from '../tool-pattern.ts';
import type { PermissionRule } from '../types.ts';
import { isMcpToolName, toolNameOfEntry } from './names.ts';

/**
 * The facts of a session that decide which of the tools the host can provide Claude actually sees.
 * The kit holds no model, provider or surface table: the candidates a host passes are the tools its
 * model and surface offer (tools-reference.md, "Task tool availability", "EndConversation tool
 * behavior"), and this narrows them by the documented rules (spec/judgments.md).
 */
export interface ToolSession {
  /** WSL counts as `posix`: Glob and Grep are absent by default everywhere but Windows. */
  readonly platform: 'posix' | 'windows';
  /** Every deny and allow rule in force, whatever its source, including `--disallowedTools` and `--allowedTools` entries. */
  readonly rules: readonly PermissionRule[];
  /** The `--tools` list: "restricts the session's built-in tools to the ones it names". */
  readonly toolsFlag?: readonly string[];
  /** The `--allowedTools` entries (rule syntax), for the one thing they do to availability: restore Glob and Grep. */
  readonly allowedToolsFlag?: readonly string[];
  /** A `--restricted` session removes Bash. */
  readonly restricted?: boolean;
}

const END_CONVERSATION = 'EndConversation';
const SEARCH_TOOLS: ReadonlySet<string> = new Set(['Glob', 'Grep']);

/** "A bare tool name ... removes the tool from Claude's context": a deny rule with no specifier. */
const removesTool = (rule: PermissionRule, toolName: string): boolean =>
  rule.behavior === 'deny' && rule.specifier === undefined && toolNameMatches(rule, toolName);

/** Bash is gone from the session: a bare deny rule or `--restricted` removes it (tools-reference.md, "Glob tool behavior"). */
const bashRemoved = (session: ToolSession): boolean =>
  session.restricted === true || session.rules.some((rule) => removesTool(rule, 'Bash'));

const namesTool = (entries: readonly string[] | undefined, toolName: string): boolean =>
  entries?.some((entry) => toolNameOfEntry(entry) === toolName) === true;

/**
 * tools-reference.md, "Glob tool behavior": on macOS, Linux and WSL the tools are left out unless
 * `--tools` names them, naming either in `--allowedTools` restores both ("An allow rule in a
 * settings file doesn't have this effect"), or a deny rule, `--disallowedTools` or `--restricted`
 * removes Bash. A tool that is not one of the two is always offered.
 */
function offeredByDefault(toolName: string, session: ToolSession): boolean {
  if (!SEARCH_TOOLS.has(toolName) || session.platform === 'windows') return true;
  return (
    bashRemoved(session) ||
    namesTool(session.toolsFlag, toolName) ||
    [...SEARCH_TOOLS].some((search) => namesTool(session.allowedToolsFlag, search))
  );
}

/** `--tools` restricts built-in tools only: an MCP tool is not on that list (spec/judgments.md). */
const inToolsFlag = (toolName: string, session: ToolSession): boolean =>
  session.toolsFlag === undefined ||
  isMcpToolName(toolName) ||
  namesTool(session.toolsFlag, toolName);

/**
 * The tools Claude sees, from the candidates the host can provide (order kept). A deny rule with no
 * specifier removes the tools it names, and so does a glob (permissions.md, "Manage permissions",
 * "Tool name wildcards"); a scoped or parameter rule, an ask rule and an allow rule remove nothing.
 * `EndConversation` is the exception (tools-reference.md, "EndConversation tool behavior"): no deny
 * rule and no `--tools` list removes it while another tool remains; when the deny rules remove every
 * other tool and also match it, as `*` does, it goes too, "unless an allow rule names
 * `EndConversation` explicitly".
 */
export function availableTools(
  candidates: readonly string[],
  session: ToolSession,
): readonly string[] {
  const kept = (toolName: string): boolean =>
    offeredByDefault(toolName, session) &&
    inToolsFlag(toolName, session) &&
    !(toolName === 'Bash' && session.restricted === true) &&
    !session.rules.some((rule) => removesTool(rule, toolName));
  const others = candidates.filter((toolName) => toolName !== END_CONVERSATION && kept(toolName));
  const deniedToo = session.rules.some((rule) => removesTool(rule, END_CONVERSATION));
  const allowedByName = session.rules.some(
    (rule) =>
      rule.behavior === 'allow' &&
      rule.specifier === undefined &&
      !rule.toolGlob &&
      rule.value.toolName === END_CONVERSATION,
  );
  const dropsEnd = others.length === 0 && deniedToo && !allowedByName;
  return candidates.filter((toolName) =>
    toolName === END_CONVERSATION ? !dropsEnd : others.includes(toolName),
  );
}
