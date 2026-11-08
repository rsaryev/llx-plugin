import type { AgentSource } from '../format/agent-record.ts';
import type { AgentMcpServerSpec } from '../protocol/official.ts';

/**
 * The MCP servers scoped to a subagent (sub-agents.md, "Scope MCP servers to a subagent", "Trust
 * required for inline MCP servers"). The kit resolves; connecting and disconnecting are the host's.
 */

/** The restrictions the main session's MCP servers are under, as the host evaluates them. */
export interface McpPolicy {
  /**
   * Every restriction: `--strict-mcp-config`, `--bare`, managed MCP configuration and the
   * `allowedMcpServers` / `deniedMcpServers` policies.
   */
  allows(serverName: string): boolean;
  /**
   * Only the managed-settings restrictions: "`--strict-mcp-config` doesn't filter servers you pass
   * inline via `--agents` or the SDK `agents` option, since those are explicit caller input", while
   * "managed-settings restrictions apply to every subagent regardless of how it is defined".
   */
  managedAllows(serverName: string): boolean;
}

export type McpSkipReason = 'untrusted-folder' | 'policy';

/** One project's entry of `~/.claude.json`, which holds the answer to the trust dialog. */
export interface ProjectTrustEntry {
  readonly hasTrustDialogAccepted?: boolean | undefined;
}

export interface AgentFolderTrustInput {
  /** The folder whose `.claude/agents/` holds the agent file (an `--add-dir` directory included). */
  readonly agentFolder: string;
  /** The `projects` object of `~/.claude.json`, keyed by folder path as Claude Code writes it. */
  readonly projects: Readonly<Record<string, ProjectTrustEntry | undefined>>;
  /**
   * The session got trust of its own without the dialog: a `-p` or SDK session's automatic trust for
   * hooks in settings files. It "doesn't count" and is accepted only so a caller states it.
   */
  readonly automaticTrust?: boolean;
  /**
   * The folder is an `--add-dir` directory inside the trusted workspace's repository. Only one
   * "outside your trusted workspace's repository needs its own trust entry" (judgment: inside it the
   * workspace's trust stands).
   */
  readonly insideTrustedWorkspace?: boolean;
}

export interface AgentFolderTrust {
  readonly trusted: boolean;
  /** `projects["<path>"].hasTrustDialogAccepted`: the key a user sets in `~/.claude.json`. */
  readonly key: string;
}

/** The key of `~/.claude.json` that trusts a folder. */
export const trustKeyOf = (folder: string): string =>
  `projects[${JSON.stringify(folder)}].hasTrustDialogAccepted`;

/**
 * Whether the folder an agent file came from is trusted: its own entry says so ("trust the folder
 * the agent file came from"). A parent folder's entry does not count, and neither does the automatic
 * trust of `-p` or the SDK; the path is compared as written (judgment: the host normalizes it).
 */
export function agentFolderTrust(input: AgentFolderTrustInput): AgentFolderTrust {
  const own = input.projects[input.agentFolder]?.hasTrustDialogAccepted === true;
  return {
    trusted: own || input.insideTrustedWorkspace === true,
    key: trustKeyOf(input.agentFolder),
  };
}

export interface AgentMcpResolution {
  /** Servers named by a string: already configured, they share the parent session's connection. */
  readonly references: readonly string[];
  /** Inline definitions, keyed by server name: connected when the subagent starts. */
  readonly inline: Readonly<Exclude<AgentMcpServerSpec, string>>;
  /** Servers Claude Code skips; it "shows a warning naming the blocked servers". */
  readonly skipped: readonly { readonly name: string; readonly reason: McpSkipReason }[];
  /**
   * The debug-log lines: "Until then, Claude Code skips every inline server in that agent file and
   * writes the exact `projects[\"<path>\"].hasTrustDialogAccepted` key". Present only when it did.
   */
  readonly debug?: readonly string[];
}

/** When a scoped server connects and goes away, for the run the agent file starts. */
export interface InlineServerLifecycle {
  readonly connectsAt: 'subagent-start' | 'session-start';
  readonly disconnectsAt: 'subagent-finish' | 'session-end';
}

/**
 * "Inline servers defined here are connected when the subagent starts ... and disconnected when it
 * finishes"; run as the main session an agent connects them "at startup alongside servers from
 * `.mcp.json` and settings files" (judgment: and they end with the session). A string reference
 * "share[s] the parent session's connection", so it has neither.
 */
export function inlineServerLifecycle(asMainSession: boolean): InlineServerLifecycle {
  return asMainSession
    ? { connectsAt: 'session-start', disconnectsAt: 'session-end' }
    : { connectsAt: 'subagent-start', disconnectsAt: 'subagent-finish' };
}

/**
 * Whether an inline server of an agent file from this source waits for folder trust: "an inline MCP
 * server from an agent file in your project's `.claude/agents/` directory, or in an `--add-dir`
 * directory's" loads only after the folder is trusted (`project` also stands for `--add-dir`), while
 * `~/.claude/agents/`, `--agents` / the SDK option and managed settings load without it. A plugin
 * agent has no inline servers at all.
 */
const INLINE_NEEDS_TRUST: { readonly [S in AgentSource]: boolean } = {
  managed: false,
  flag: false,
  project: true,
  user: false,
  plugin: false,
};

/**
 * Explicit caller input: only `--agents` / the SDK option, whose inline servers `--strict-mcp-config`
 * does not filter.
 */
const IS_EXPLICIT_INPUT: { readonly [S in AgentSource]: boolean } = {
  managed: false,
  flag: true,
  project: false,
  user: false,
  plugin: false,
};

/** Whether the field applies: "Ignored for plugin subagents". */
const FIELD_APPLIES: { readonly [S in AgentSource]: boolean } = {
  managed: true,
  flag: true,
  project: true,
  user: true,
  plugin: false,
};

interface McpContext {
  readonly source: AgentSource;
  readonly folderTrusted: boolean;
  /** The key to write to the debug log while an inline server waits for trust (`agentFolderTrust`). */
  readonly trustKey?: string;
  readonly policy: McpPolicy;
}

function inlineSkipReason(name: string, ctx: McpContext): McpSkipReason | undefined {
  if (INLINE_NEEDS_TRUST[ctx.source] && !ctx.folderTrusted) return 'untrusted-folder';
  const allowed = IS_EXPLICIT_INPUT[ctx.source]
    ? ctx.policy.managedAllows(name)
    : ctx.policy.allows(name);
  return allowed ? undefined : 'policy';
}

/**
 * The MCP servers an agent's `mcpServers` field gives it. A string is a reference to a configured
 * server, an entry keyed by a name is an inline definition kept as written. A plugin agent has none
 * (its record already drops the field). An inline server from a project or `--add-dir` agent file
 * is skipped until `folderTrusted` (the host's one answer: a parent folder's trust and the automatic
 * trust of `-p` do not count); every other source loads without it. A server the policy blocks is
 * skipped. Connecting and disconnecting the servers is the host's.
 */
export function resolveAgentMcpServers(
  specs: readonly AgentMcpServerSpec[] | undefined,
  ctx: McpContext,
): AgentMcpResolution {
  const references = new Set<string>();
  const inline: Record<string, Exclude<AgentMcpServerSpec, string>[string]> = {};
  const skipped: { name: string; reason: McpSkipReason }[] = [];
  if (!FIELD_APPLIES[ctx.source]) return { references: [], inline, skipped };
  for (const spec of specs ?? []) {
    if (typeof spec === 'string') {
      // A reference needs no trust ("a name that references a server you already configured"); the
      // policy still covers it, since it "covers servers declared in subagent frontmatter" (judgment).
      if (ctx.policy.allows(spec)) references.add(spec);
      else skipped.push({ name: spec, reason: 'policy' });
      continue;
    }
    for (const [name, config] of Object.entries(spec)) {
      const reason = inlineSkipReason(name, ctx);
      if (reason === undefined) inline[name] = config;
      else skipped.push({ name, reason });
    }
  }
  const debug = trustDebug(skipped, ctx.trustKey);
  return { references: [...references], inline, skipped, ...debug };
}

const NEEDS_TRUST: Record<McpSkipReason, boolean> = { 'untrusted-folder': true, policy: false };

function trustDebug(skipped: AgentMcpResolution['skipped'], key: string | undefined) {
  return key !== undefined && skipped.some((entry) => NEEDS_TRUST[entry.reason])
    ? {
        debug: [
          `Skipped inline MCP servers of an untrusted folder; set ${key} to true in ~/.claude.json`,
        ],
      }
    : {};
}
