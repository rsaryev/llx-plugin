import type { PermissionBehavior } from '../protocol/official.ts';
import { mcpToolRuleMatches } from '../rules/index.ts';
import { isAnchoredAllowGlob, wildcardRegExp } from '../rules/tool-pattern.ts';

/**
 * One entry of the `tools` or `disallowedTools` field (sub-agents.md, "Restrict which tools a
 * subagent can use"): a tool name, with the specifier it was written with, or `Agent(type, ...)`.
 */
export interface ToolEntry {
  /** The tool name; `Task` (the pre-2.1.63 name, "still work as aliases") reads as `Agent`. */
  readonly name: string;
  /** The text in parentheses (`git push *` of `Bash(git push *)`); not for `Agent`. */
  readonly specifier?: string;
  /**
   * Only for `Agent`: the subagent types it may spawn, or `any`. "Restrict which subagents can be
   * spawned": `Agent(worker, researcher)` is an allowlist, `Agent` alone allows any.
   */
  readonly spawn?: readonly string[] | 'any';
}

export const AGENT_TOOL = 'Agent';
const AGENT_NAMES: ReadonlySet<string> = new Set([AGENT_TOOL, 'Task']);

/** Whether a tool name is the Agent tool: `Task` (its name before 2.1.63) "still work[s] as an alias". */
export const isAgentToolName = (name: string): boolean => AGENT_NAMES.has(name);

/** `Name(content)` splits at the first `(` when the entry ends in `)`; anything else is a name. */
function splitEntry(text: string): { readonly name: string; readonly content?: string } {
  const open = text.indexOf('(');
  if (open <= 0 || !text.endsWith(')')) return { name: text };
  return { name: text.slice(0, open).trim(), content: text.slice(open + 1, -1) };
}

const typeList = (content: string): readonly string[] =>
  content
    .split(',')
    .map((type) => type.trim())
    .filter((type) => type !== '');

/** Reads one entry of the field, as `readAgent` keeps it (a comma inside parentheses is not a split). */
export function parseToolEntry(entry: string): ToolEntry {
  const { name, content } = splitEntry(entry.trim());
  if (AGENT_NAMES.has(name)) {
    const types = content === undefined ? [] : typeList(content);
    return { name: AGENT_TOOL, spawn: types.length === 0 ? 'any' : types };
  }
  return content === undefined ? { name } : { name, specifier: content };
}

/**
 * Whether `entry` names the tool `toolName`. The behaviour is the one permissions.md gives the same
 * name in a rule: `tools` reads like an allow rule and `disallowedTools` like a deny rule
 * (spec/judgments.md). So `mcp__reports__v2` never matches in `tools` and does in `disallowedTools`,
 * and an unanchored glob such as `mcp__*` matches only as a deny entry. A specifier never narrows
 * the match: "still removes the whole tool".
 */
export function toolEntryMatches(
  entry: ToolEntry,
  toolName: string,
  behavior: PermissionBehavior,
): boolean {
  const { name } = entry;
  if (!name.includes('*')) return mcpToolRuleMatches(name, toolName, behavior);
  const anchored = behavior !== 'allow' || isAnchoredAllowGlob(name);
  return anchored && wildcardRegExp(name).test(toolName);
}
