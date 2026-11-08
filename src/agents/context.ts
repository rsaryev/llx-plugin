import type { AgentMemoryScope } from '../format/agent-fields.ts';
import { prefixWithinBytes } from '../foundation/index.ts';
import type { AgentSource } from '../format/agent-record.ts';
import type { AgentMcpServerSpec } from '../protocol/official.ts';
import type { Locations, TextFileReader } from '../ports/index.ts';

/**
 * What a subagent starts with beyond its prompt: the skills preloaded into its context, the MCP
 * servers scoped to it and its persistent memory (sub-agents.md, "Preload skills into subagents",
 * "Scope MCP servers to a subagent", "Trust required for inline MCP servers", "Enable persistent
 * memory"). The kit plans; loading skill content, connecting servers and building the system prompt
 * are the host's.
 */

/** sub-agents.md, "Preload skills into subagents": "up to the first 32 distinct names". */
const PRELOAD_LIMIT = 32;

/** What the host knows about its skills; narrow so the skills package need not be imported. */
export interface SkillCatalog {
  /** The skill exists and is enabled (a missing one and one the organization disabled are alike). */
  has(name: string): boolean;
  /** Claude can invoke it: not `disable-model-invocation: true` ("the same set of skills"). */
  isModelInvocable(name: string): boolean;
}

export type SkillSkipReason = 'missing' | 'not-model-invocable' | 'beyond-limit';

export interface PreloadPlan {
  /** The skills whose full content is injected at startup, in the list's order. */
  readonly load: readonly string[];
  /** Listed skills that are not injected; Claude Code "skips it and logs a warning". */
  readonly skipped: readonly { readonly name: string; readonly reason: SkillSkipReason }[];
}

/**
 * The skills a subagent preloads from its `skills` field. Only the first 32 distinct names count:
 * a name past them is skipped, and so is a listed name that is missing or not model-invocable (that
 * one still uses up its place among the 32, as the docs count names "in the list"). A repeated name
 * is read once and not reported (judgment). Which skills the subagent may invoke through the Skill
 * tool is the `tools` field's, not this one's.
 */
export function planPreloadedSkills(
  names: readonly string[] | undefined,
  catalog: SkillCatalog,
): PreloadPlan {
  const distinct = [...new Set(names ?? [])];
  const load: string[] = [];
  const skipped: { name: string; reason: SkillSkipReason }[] = [];
  distinct.forEach((name, index) => {
    if (index >= PRELOAD_LIMIT) skipped.push({ name, reason: 'beyond-limit' });
    else if (!catalog.has(name)) skipped.push({ name, reason: 'missing' });
    else if (!catalog.isModelInvocable(name)) skipped.push({ name, reason: 'not-model-invocable' });
    else load.push(name);
  });
  return { load, skipped };
}

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

export interface AgentMcpResolution {
  /** Servers named by a string: already configured, they share the parent session's connection. */
  readonly references: readonly string[];
  /** Inline definitions, keyed by server name: connected when the subagent starts. */
  readonly inline: Readonly<Exclude<AgentMcpServerSpec, string>>;
  /** Servers Claude Code skips; it "shows a warning naming the blocked servers". */
  readonly skipped: readonly { readonly name: string; readonly reason: McpSkipReason }[];
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
  return { references: [...references], inline, skipped };
}

/** memory.md, "Storage location" of MEMORY.md: "The first 200 lines ... or the first 25KB". */
const MEMORY_MAX_LINES = 200;
/** "25KB" read as 25 * 1024 bytes of UTF-8 (judgment, spec/judgments.md). */
const MEMORY_MAX_BYTES = 25 * 1024;

const FRONTMATTER = /^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/;
const COMMENT_OPEN = /^ {0,3}<!--/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/** The line after the first `-->` of the comment opened on `start`, or -1. */
function commentEnd(lines: readonly string[], start: number): number {
  const rest = [(lines[start] ?? '').replace(/^.*?<!--/, ''), ...lines.slice(start + 1)];
  const found = rest.findIndex((line) => line.includes('-->'));
  return found === -1 ? -1 : start + found + 1;
}

/** The open fence after a line: a run of ``` or ~~~ opens it, a run as long of the same mark closes it. */
const nextFence = (fence: string | undefined, run: string | undefined): string | undefined => {
  if (fence === undefined || run === undefined) return fence ?? run;
  return run[0] === fence[0] && run.length >= fence.length ? undefined : fence;
};

/** Drops block-level HTML comments, outside fenced code (judgment, spec/judgments.md). */
function withoutBlockComments(text: string): string {
  const lines = text.split('\n');
  const kept: string[] = [];
  let fence: string | undefined;
  for (let i = 0; i < lines.length;) {
    const line = lines[i] ?? '';
    const opened = FENCE.exec(line)?.[1];
    const end = fence === undefined && COMMENT_OPEN.test(line) ? commentEnd(lines, i) : -1;
    if (end !== -1) {
      i = end;
      continue;
    }
    fence = nextFence(fence, opened);
    kept.push(line);
    i += 1;
  }
  return kept.join('\n');
}

/** errors.md, "Memory index is over its read limit": frontmatter and block comments do not load. */
const loadedContent = (text: string): string => withoutBlockComments(text.replace(FRONTMATTER, ''));

/**
 * The part of a `MEMORY.md` index that the subagent's system prompt includes: "the first 200 lines
 * or 25KB ..., whichever comes first". Frontmatter and block-level HTML comments are not loaded, so
 * they do not count (errors.md). `truncated` says content was cut, so the host adds the instruction
 * to curate the index. The cut at the byte limit is made between characters, not between lines
 * (judgment).
 */
export function truncateMemoryIndex(text: string): { text: string; truncated: boolean } {
  const content = loadedContent(text);
  const lines = content.split('\n');
  const lineCount = lines.length - (lines[lines.length - 1] === '' ? 1 : 0);
  const byLines =
    lineCount > MEMORY_MAX_LINES ? lines.slice(0, MEMORY_MAX_LINES).join('\n') : content;
  const kept = prefixWithinBytes(byLines, MEMORY_MAX_BYTES);
  return { text: kept, truncated: kept !== content };
}

export interface MemoryPlan {
  /** The memory directory: the subagent's own, created by the host when absent. */
  readonly directory: string;
  /** What of `MEMORY.md` the system prompt includes (empty when the file does not exist). */
  readonly index: string;
  /** The index was cut at 200 lines or 25KB. */
  readonly truncated: boolean;
  /** "Read, Write, and Edit tools are automatically enabled so the subagent can manage its memory". */
  readonly addTools: readonly ['Read', 'Write', 'Edit'];
}

/** The folder of each scope under its root: the home folder or the project folder. */
const MEMORY_SCOPES: {
  readonly [S in AgentMemoryScope]: {
    readonly root: keyof Pick<Locations, 'homeDir' | 'projectDir'>;
    readonly folder: string;
  };
} = {
  user: { root: 'homeDir', folder: '.claude/agent-memory' },
  project: { root: 'projectDir', folder: '.claude/agent-memory' },
  local: { root: 'projectDir', folder: '.claude/agent-memory-local' },
};

/**
 * A plugin agent's type is `<plugin>:<name>`, and a `:` is no safe name for a folder everywhere, so
 * `:` (and a path separator, which must never leave the memory folder) becomes `-`; a name of only
 * dots becomes `-` too (judgment: the docs name the folder `<name-of-agent>` and say no more).
 */
const folderName = (agentType: string): string =>
  agentType.replace(/[:/\\]/g, '-').replace(/^\.+$/, '-');

export interface MemoryContext {
  /** Auto memory is on: `autoMemoryEnabled` is not false and `CLAUDE_CODE_DISABLE_AUTO_MEMORY` is unset. */
  readonly autoMemoryEnabled: boolean;
  readonly locations: Pick<Locations, 'homeDir' | 'projectDir' | 'joinPath'>;
  readonly files: TextFileReader;
  readonly signal?: AbortSignal;
}

/**
 * The persistent memory of a subagent from its `memory` scope: the directory (`~/.claude/agent-memory/<name>/`,
 * `.claude/agent-memory/<name>/` or `.claude/agent-memory-local/<name>/`), the part of its `MEMORY.md`
 * to include and the tools to add. With no scope, or with auto memory off ("the `memory` field has
 * no effect and the subagent launches without the memory instructions or the memory tool access"),
 * there is no plan. The instruction text for the system prompt is not quoted by the docs and is the
 * host's.
 */
export async function planAgentMemory(
  scope: AgentMemoryScope | undefined,
  agentType: string,
  ctx: MemoryContext,
): Promise<MemoryPlan | undefined> {
  if (scope === undefined || !ctx.autoMemoryEnabled) return undefined;
  const { root, folder } = MEMORY_SCOPES[scope];
  const { locations } = ctx;
  const directory = locations.joinPath(locations[root](), `${folder}/${folderName(agentType)}`);
  const raw = await ctx.files.readText(locations.joinPath(directory, 'MEMORY.md'), ctx.signal);
  const { text, truncated } = truncateMemoryIndex(raw ?? '');
  return { directory, index: text, truncated, addTools: ['Read', 'Write', 'Edit'] };
}
