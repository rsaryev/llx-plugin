/**
 * How a host's tool names correspond to Claude Code's, stated once by the host. The docs name only
 * Claude Code's tools, so the kit reads every tool name in those terms: what a subagent's `tools`
 * and `disallowedTools` match, what a hook's `matcher` and `tool_name` see, what a permission rule
 * and a mod's `tool.call` matcher match. Judgment (spec/judgments.md).
 */
export interface HostToolNames {
  /**
   * A host tool name and the Claude Code tool, or tools, it stands for: a built-in (`write_file` to
   * `Write`, `task` to `Agent`, so `Agent(type)` reads it), an MCP tool in `mcp__<server>__<tool>`
   * form, or a list when one host tool does the work of several (`Search` to `['Grep', 'Glob']`).
   * A name left out, or given an empty list, is the same on both sides.
   */
  readonly toClaude?: Readonly<Record<string, string | readonly string[]>>;
  /**
   * The Claude Code name of one call, when it depends on the input (`Search` with a `pattern` is
   * `Grep`, with only a glob `Glob`). Read only when it answers one of the names the tool lists;
   * otherwise, and without it, a call carries the first name listed.
   */
  readonly callName?: (hostTool: string, input: unknown) => string | undefined;
  /** Claude Code tools the host has no tool for: never granted (the restored `Glob`/`Grep`). */
  readonly missing?: readonly string[];
}

/** A `HostToolNames` read both ways. */
export interface ToolNames {
  /** The Claude Code name of a call of a host tool: `callName` over `input`, else the first listed. */
  readonly claudeName: (hostName: string, input?: unknown) => string;
  /** Every Claude Code name a host tool stands for, in the host's order; the name itself when unmapped. */
  readonly claudeNames: (hostName: string) => readonly string[];
  /** The host tools that stand for a Claude Code tool; empty when the host has none. */
  readonly hostNames: (claudeName: string) => readonly string[];
  /** Whether the host has a tool for this Claude Code name. */
  readonly has: (claudeName: string) => boolean;
}

const listOf = (to: string | readonly string[]): readonly string[] =>
  typeof to === 'string' ? [to] : to;

/** The mapping both ways; `undefined` is the host whose tools are Claude Code's. */
export function toolNamesOf(names: HostToolNames | undefined): ToolNames {
  const toClaude = new Map(
    Object.entries(names?.toClaude ?? {})
      .map(([host, to]): [string, readonly string[]] => [host, listOf(to)])
      .filter(([, to]) => to.length > 0),
  );
  const missing = new Set(names?.missing ?? []);
  const claudeNames = (host: string): readonly string[] => toClaude.get(host) ?? [host];
  const mappedTo = (claude: string): string[] =>
    [...toClaude].filter(([, to]) => to.includes(claude)).map(([host]) => host);
  // An unmapped Claude Code name is the host tool of that name, unless the host lacks it or that
  // host name stands for another Claude Code tool.
  const same = (claude: string): string[] =>
    missing.has(claude) || toClaude.has(claude) ? [] : [claude];
  const hostNames = (claude: string): string[] => {
    const mapped = mappedTo(claude);
    return mapped.length > 0 ? mapped : same(claude);
  };
  const claudeName = (host: string, input?: unknown): string => {
    const listed = claudeNames(host);
    const answer = names?.callName?.(host, input);
    return answer !== undefined && listed.includes(answer) ? answer : (listed[0] ?? host);
  };
  return { claudeName, claudeNames, hostNames, has: (claude) => hostNames(claude).length > 0 };
}
