import { configDirectoryOf } from '../format/config-directory.ts';
import type { AgentMemoryScope } from '../format/agent-fields.ts';
import { prefixWithinBytes } from '../format/utf8.ts';
import type { Locations, TextFileReader } from '../ports/index.ts';

/**
 * The persistent memory of a subagent (sub-agents.md, "Enable persistent memory"). The kit plans
 * the directory, the part of `MEMORY.md` to include and the tools to add; reading and writing the
 * files in the system prompt are the host's.
 */

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

/** The project's `.claude` folder. */
const projectClaude = ({ locations }: MemoryContext): string =>
  locations.joinPath(locations.projectDir(), '.claude');

/** The folder of each scope under its `.claude` folder: the configuration directory's, or the project's. */
const MEMORY_SCOPES: {
  readonly [S in AgentMemoryScope]: {
    readonly claude: (ctx: MemoryContext) => string;
    readonly folder: string;
  };
} = {
  user: {
    claude: ({ locations, configDir }) =>
      configDirectoryOf(locations.homeDir(), configDir, locations.joinPath),
    folder: 'agent-memory',
  },
  project: { claude: projectClaude, folder: 'agent-memory' },
  local: { claude: projectClaude, folder: 'agent-memory-local' },
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
  /** `CLAUDE_CONFIG_DIR` as the session's environment gives it: the user scope's memory lives below it when set. */
  readonly configDir?: string | undefined;
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
  const { claude, folder } = MEMORY_SCOPES[scope];
  const { locations } = ctx;
  const directory = locations.joinPath(claude(ctx), `${folder}/${folderName(agentType)}`);
  const raw = await ctx.files.readText(locations.joinPath(directory, 'MEMORY.md'), ctx.signal);
  const { text, truncated } = truncateMemoryIndex(raw ?? '');
  return { directory, index: text, truncated, addTools: ['Read', 'Write', 'Edit'] };
}
