/**
 * `e.isReadOnly` of `tool.check` (events.md, "Check whether a tool call is read-only"; reference.md,
 * "The `e.isReadOnly` field on `tool.check`"): `true` when the tool reports the call as read-only,
 * otherwise the field is absent, never `false`. The value is the tool's own report, so this answers
 * from the tool, not from a guess about what it does.
 */

/** A tool call as `tool.check` sees it: the tool's name and its arguments. */
export interface ReadOnlyCall {
  readonly tool: string;
  readonly input: Readonly<Record<string, unknown>>;
}

/** What only the host knows: the two checks that decide a call of Bash or of an MCP tool. */
export interface ReadOnlyChecks {
  /** Whether the command "passes Claude Code's built-in read-only command check" (permissions.md, "Read-only commands"). */
  readonly bashCommand: (command: string) => boolean;
  /** The `readOnlyHint` annotation the server set on an MCP tool: `true`, `false` or absent. */
  readonly mcpReadOnlyHint: (tool: string) => boolean | undefined;
}

type ToolKind = 'always' | 'bash' | 'mcp' | 'other';

/**
 * The tools that report every call as read-only: "Some tools, such as Read, Grep, Glob, and
 * WebSearch", and "WebFetch and Agent calls report as read-only" too.
 */
const ALWAYS_READ_ONLY: ReadonlySet<string> = new Set([
  'Read',
  'Grep',
  'Glob',
  'WebSearch',
  'WebFetch',
  'Agent',
]);

const kindOf = (tool: string): ToolKind => {
  if (ALWAYS_READ_ONLY.has(tool)) return 'always';
  if (tool === 'Bash') return 'bash';
  return tool.startsWith('mcp__') ? 'mcp' : 'other';
};

/** What each kind of tool reports. A tool the docs do not list as reporting read-only does not (judgment). */
const REPORTS: {
  readonly [K in ToolKind]: (call: ReadOnlyCall, checks: ReadOnlyChecks) => boolean;
} = {
  always: () => true,
  bash: (call, checks) =>
    typeof call.input.command === 'string' && checks.bashCommand(call.input.command),
  mcp: (call, checks) => checks.mcpReadOnlyHint(call.tool) === true,
  other: () => false,
};

/** `true` when the tool reports `call` as read-only, otherwise `undefined`: the field is absent, not `false`. */
export function toolReadOnlyReport(call: ReadOnlyCall, checks: ReadOnlyChecks): true | undefined {
  return REPORTS[kindOf(call.tool)](call, checks) ? true : undefined;
}
