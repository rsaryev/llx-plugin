import { toolNameMatches } from '../tool-pattern.ts';
import type { PermissionRule } from '../types.ts';
import { toolNamesOf, type HostToolNames } from './host-tool-names.ts';
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
  /**
   * A `--restricted` session removes the built-in tools that run commands or code and `WebFetch`,
   * unless `--tools` names them individually (cli-reference.md, `--restricted`).
   */
  readonly restricted?: boolean;
  /** Windows with Git Bash installed: a Bash deny rule then turns the PowerShell tool off. */
  readonly gitBash?: boolean;
  /** `CLAUDE_CODE_USE_POWERSHELL_TOOL=1`, in the environment or a settings file's `env` block. */
  readonly powerShellOptIn?: boolean;
  /** `permissions.blockWritesOutsideWorkingDirectories` is on: the worktree tools are removed. */
  readonly blockWritesOutsideWorkingDirectories?: boolean;
  /** `permissions.denyInsteadOfPrompting` is on: the question and plan tools are left out. */
  readonly denyInsteadOfPrompting?: boolean;
  /** The session is a teammate in an agent team: it keeps the plan tools under `denyInsteadOfPrompting`. */
  readonly teammate?: boolean;
  /**
   * How the candidates' names correspond to Claude Code's, when the host's tools carry other names:
   * the rules and flags read the Claude Code names, the outcome names the host's tools. Absent, the
   * candidates are Claude Code's names.
   */
  readonly names?: HostToolNames;
}

const END_CONVERSATION = 'EndConversation';
const SEARCH_TOOLS: ReadonlySet<string> = new Set(['Glob', 'Grep']);
const POWERSHELL = 'PowerShell';
const WORKTREE_TOOLS: ReadonlySet<string> = new Set(['EnterWorktree', 'ExitWorktree']);
/** The tools that wait on a person's answer, which `denyInsteadOfPrompting` leaves out. */
const QUESTION_TOOLS: ReadonlySet<string> = new Set(['AskUserQuestion']);
const PLAN_TOOLS: ReadonlySet<string> = new Set(['EnterPlanMode', 'ExitPlanMode']);
/** The built-in tools `--restricted` removes: the ones that run commands or code, and WebFetch (spec/judgments.md). */
const RESTRICTED_TOOLS: ReadonlySet<string> = new Set(['Bash', POWERSHELL, 'Monitor', 'WebFetch']);

/** "A bare tool name ... removes the tool from Claude's context": a deny rule with no specifier. */
const removesTool = (rule: PermissionRule, toolName: string): boolean =>
  rule.behavior === 'deny' && rule.specifier === undefined && toolNameMatches(rule, toolName);

const namesTool = (entries: readonly string[] | undefined, toolName: string): boolean =>
  entries?.some((entry) => toolNameOfEntry(entry) === toolName) === true;

/** `--restricted` removes the tool: it is one of the restricted ones and `--tools` does not name it individually. */
const restrictedAway = (toolName: string, session: ToolSession): boolean =>
  session.restricted === true &&
  RESTRICTED_TOOLS.has(toolName) &&
  !namesTool(session.toolsFlag, toolName);

/** Bash is gone from the session: a bare deny rule or `--restricted` removes it (tools-reference.md, "Glob tool behavior"). */
const bashRemoved = (session: ToolSession): boolean =>
  restrictedAway('Bash', session) || session.rules.some((rule) => removesTool(rule, 'Bash'));

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

/**
 * settings-reference.md, "What else `denyInsteadOfPrompting` stops": "Claude Code leaves out
 * `AskUserQuestion`, `EnterPlanMode`, and `ExitPlanMode` ... A teammate in an agent team keeps
 * `EnterPlanMode` and `ExitPlanMode`".
 */
const leftOutUnprompted = (toolName: string, session: ToolSession): boolean =>
  session.denyInsteadOfPrompting === true &&
  (QUESTION_TOOLS.has(toolName) || (PLAN_TOOLS.has(toolName) && session.teammate !== true));

/**
 * `--tools` restricts built-in tools only: an MCP tool is not on that list (spec/judgments.md). The
 * entry `default` is the default set, which restricts nothing (cli-reference.md, `--tools`).
 */
const inToolsFlag = (toolName: string, session: ToolSession): boolean =>
  session.toolsFlag === undefined ||
  isMcpToolName(toolName) ||
  namesTool(session.toolsFlag, 'default') ||
  namesTool(session.toolsFlag, toolName);

/**
 * tools-reference.md, "Bash deny rules also turn off the PowerShell tool": on Windows with Git Bash,
 * any deny rule on Bash, scoped or not, turns PowerShell off, unless `CLAUDE_CODE_USE_POWERSHELL_TOOL=1`
 * or a scoped `PowerShell(...)` rule is set.
 */
function powerShellOffByBashDeny(session: ToolSession): boolean {
  if (session.platform !== 'windows' || session.gitBash !== true) return false;
  if (session.powerShellOptIn === true) return false;
  const scopedPowerShell = session.rules.some(
    (rule) => rule.specifier !== undefined && toolNameMatches(rule, POWERSHELL),
  );
  return (
    !scopedPowerShell &&
    session.rules.some((rule) => rule.behavior === 'deny' && toolNameMatches(rule, 'Bash'))
  );
}

/** `--tools ""` with no MCP tool left and no allow rule naming `EndConversation`, or every other tool denied along with it. */
function endConversationDropped(others: readonly string[], session: ToolSession): boolean {
  const allowedByName = session.rules.some(
    (rule) =>
      rule.behavior === 'allow' &&
      rule.specifier === undefined &&
      !rule.toolGlob &&
      rule.value.toolName === END_CONVERSATION,
  );
  if (allowedByName) return false;
  const noMcpLeft = !others.some(isMcpToolName);
  const emptyToolsFlag = session.toolsFlag?.length === 0 && noMcpLeft;
  const deniedToo = session.rules.some((rule) => removesTool(rule, END_CONVERSATION));
  return emptyToolsFlag || (others.length === 0 && deniedToo);
}

/** The Claude Code tools Claude sees, from Claude Code candidates (order kept). */
function availableClaudeTools(
  candidates: readonly string[],
  session: ToolSession,
): readonly string[] {
  const kept = (toolName: string): boolean =>
    offeredByDefault(toolName, session) &&
    inToolsFlag(toolName, session) &&
    !restrictedAway(toolName, session) &&
    !(toolName === POWERSHELL && powerShellOffByBashDeny(session)) &&
    !(WORKTREE_TOOLS.has(toolName) && session.blockWritesOutsideWorkingDirectories === true) &&
    !leftOutUnprompted(toolName, session) &&
    !session.rules.some((rule) => removesTool(rule, toolName));
  const others = candidates.filter((toolName) => toolName !== END_CONVERSATION && kept(toolName));
  const dropsEnd = endConversationDropped(others, session);
  return candidates.filter((toolName) =>
    toolName === END_CONVERSATION ? !dropsEnd : others.includes(toolName),
  );
}

/**
 * The tools Claude sees, from the candidates the host can provide (order kept). A deny rule with no
 * specifier removes the tools it names, and so does a glob (permissions.md, "Manage permissions",
 * "Tool name wildcards"); a scoped or parameter rule, an ask rule and an allow rule remove nothing.
 * `EndConversation` is the exception (tools-reference.md, "EndConversation tool behavior"): no deny
 * rule and no `--tools` list removes it while another tool remains; `--tools ""` removes it "only
 * when no MCP tools remain" (cli-reference.md); when the deny rules remove every other tool and also
 * match it, as `*` does, it goes too. An allow rule naming `EndConversation` explicitly saves it in
 * both cases. With `session.names` the candidates are the host's tools, read through their Claude
 * Code names (judgment, spec/judgments.md).
 */
export function availableTools(
  candidates: readonly string[],
  session: ToolSession,
): readonly string[] {
  const names = toolNamesOf(session.names);
  const claude = [...new Set(candidates.flatMap(names.claudeNames))];
  const kept = new Set(availableClaudeTools(claude, session));
  // A host tool is one grant: it goes when any of its Claude Code names is removed, as a denied
  // name takes a subagent's host tool (`resolveSubagentTools`).
  return candidates.filter((tool) => names.claudeNames(tool).every((name) => kept.has(name)));
}
