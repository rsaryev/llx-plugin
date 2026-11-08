import { readAgent } from '../../format/agent.ts';
import type { AgentSource } from '../../format/agent-record.ts';
import type { PluginIssue } from '../../format/issues.ts';
import { walkFiles } from '../../foundation/folder-walk.ts';
import type { ScanFolder } from '../../ports/folder-scan.ts';
import type { AgentsOrigin } from '../../settings/customization/sources.ts';
import {
  AGENT_SCOPE_RULES,
  AGENTS_FOLDER,
  type AgentFolder,
  type AgentFolderContext,
} from './scopes.ts';
import { catalogAgentOf, type CatalogAgent } from './types.ts';

/**
 * Reads the agents folders through the `FolderScan` port (sub-agents.md, "Choose the subagent scope":
 * managed, project, user and `--add-dir` `.claude/agents/`, scanned "recursively, so you can organize
 * definitions into subfolders"). Nothing is resolved here: two files that declare one name are both
 * returned with where each came from, for `resolveAgents` to choose.
 */

export interface AgentScanContext extends AgentFolderContext {
  /** Whether `strictPluginOnlyCustomization` lets a source load; absent, every source does. */
  readonly allows?: (origin: AgentsOrigin) => boolean;
  /** False for a session started with `--disable-slash-commands`, which watches nothing. Default true. */
  readonly watch?: boolean;
}

export interface ScannedAgent {
  readonly agent: CatalogAgent;
  /** The source of the file: `managed`, `project` or `user`. */
  readonly source: Extract<AgentSource, 'managed' | 'project' | 'user'>;
  /** Its folder's name for `strictPluginOnlyCustomization`; `addDir` for an added directory. */
  readonly origin: AgentsOrigin;
  /** The base directory the file was read below. */
  readonly base: string;
  /**
   * Where the file sits among the folders of its source: the nearer to the working directory, the
   * lower. "The definition closest to the working directory" wins.
   */
  readonly order: number;
  /** Where the file really lives; two entries with one target are one agent. */
  readonly canonical?: string;
}

export interface AgentScanOutcome {
  readonly entries: readonly ScannedAgent[];
  /** The files that were skipped with a reason, and the fields a file's frontmatter got wrong. */
  readonly issues: readonly PluginIssue[];
  /** The agents folders the session watches for changes: those that exist when it starts. */
  readonly watch: readonly string[];
}

const EMPTY: AgentScanOutcome = { entries: [], issues: [], watch: [] };

type FileSource = ScannedAgent['source'];

interface Where {
  readonly context: AgentScanContext;
  readonly source: FileSource;
  readonly folder: AgentFolder;
  readonly base: string;
  readonly files: ScanFolder;
  readonly order: number;
}

async function readFiles(where: Where): Promise<AgentScanOutcome> {
  const { context, files, source, folder, base, order } = where;
  const walked = await walkFiles(files, AGENTS_FOLDER, {
    extension: '.md',
    ...(context.signal === undefined ? {} : { signal: context.signal }),
  });
  const reads = await Promise.all(
    walked.found.map(async (file) => {
      const text = await files.files.readText(file.path, context.signal);
      if (text === undefined) return EMPTY;
      const read = readAgent(text, { source, path: files.hostPath(file.path) });
      const entries: ScannedAgent[] =
        read.agent === undefined
          ? []
          : [
              {
                agent: catalogAgentOf(read.agent),
                source,
                origin: folder.origin,
                base,
                order,
                ...(file.canonical === undefined ? {} : { canonical: file.canonical }),
              },
            ];
      return { entries, issues: read.issues, watch: [] } satisfies AgentScanOutcome;
    }),
  );
  return {
    entries: reads.flatMap((read) => read.entries),
    issues: [...walked.issues, ...reads.flatMap((read) => read.issues)],
    watch: [],
  };
}

async function scanBase(where: Omit<Where, 'files'>): Promise<AgentScanOutcome> {
  const { context, base, folder } = where;
  const files = await context.folders.open(base, context.signal);
  if (files === undefined) return EMPTY;
  const read = await readFiles({ ...where, files });
  const exists = await files.files.exists(AGENTS_FOLDER, context.signal);
  const watching = exists && folder.watched && context.watch !== false;
  return { ...read, watch: watching ? [files.hostPath(AGENTS_FOLDER)] : [] };
}

const merge = (parts: readonly AgentScanOutcome[]): AgentScanOutcome => ({
  entries: parts.flatMap((part) => part.entries),
  issues: parts.flatMap((part) => part.issues),
  watch: parts.flatMap((part) => part.watch),
});

/** The folders of one source, base after base and folder after folder: `order` counts across them. */
async function scanSource(
  context: AgentScanContext,
  source: FileSource,
): Promise<AgentScanOutcome> {
  const parts: AgentScanOutcome[] = [];
  let order = 0;
  for (const folder of AGENT_SCOPE_RULES[source].folders) {
    if (!(context.allows?.(folder.origin) ?? true)) continue;
    for (const base of await folder.bases(context)) {
      parts.push(await scanBase({ context, source, folder, base, order }));
      order += 1;
    }
  }
  return merge(parts);
}

const FILE_SOURCES = ['managed', 'project', 'user'] as const satisfies readonly FileSource[];

/** Every agents folder of a session: managed, the project (and the added directories), personal. */
export async function scanAgents(context: AgentScanContext): Promise<AgentScanOutcome> {
  const parts = await Promise.all(FILE_SOURCES.map((source) => scanSource(context, source)));
  return merge(parts);
}
