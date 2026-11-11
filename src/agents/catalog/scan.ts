import { readAgent } from '../../format/agent.ts';
import type { AgentSource } from '../../format/agent-record.ts';
import type { PluginIssue } from '../../format/issues.ts';
import {
  CLAUDE_FOLDER,
  placePath,
  readScopeFiles,
  scopeFoldersOf,
  watchedFolder,
  type ScopeContext,
  type ScopePlace,
} from '../../foundation/scope-folders.ts';
import type { ScanFolder } from '../../ports/folder-scan.ts';
import type { AgentsOrigin } from '../../settings/customization/sources.ts';
import { AGENT_SCOPE_RULES, AGENTS_FOLDER, type AgentFolder } from './scopes.ts';
import { catalogAgentOf, type CatalogAgent } from './types.ts';

/**
 * Reads the agents folders through the `FolderScan` port (sub-agents.md, "Choose the subagent scope":
 * managed, project, user and `--add-dir` `.claude/agents/`, scanned "recursively, so you can organize
 * definitions into subfolders"). Nothing is resolved here: two files that declare one name are both
 * returned with where each came from, for `resolveAgents` to choose.
 */

export interface AgentScanContext extends ScopeContext {
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
  /** The agents folder below the base: `.claude/agents`, or `<extra>/agents`. */
  readonly container: string;
}

async function readFiles(where: Where): Promise<AgentScanOutcome> {
  const { context, files, source, folder, base, order } = where;
  const read = await readScopeFiles(files, where.container, {
    extension: '.md',
    depth: 'tree',
    signal: context.signal,
  });
  const agents = read.files.map((file) => ({
    file,
    read: readAgent(file.text, { source, path: file.hostPath }),
  }));
  return {
    entries: agents.flatMap(({ file, read: { agent } }): ScannedAgent[] =>
      agent === undefined
        ? []
        : [
            {
              agent: catalogAgentOf(agent),
              source,
              origin: folder.origin,
              base,
              order,
              ...(file.canonical === undefined ? {} : { canonical: file.canonical }),
            },
          ],
    ),
    issues: [...read.issues, ...agents.flatMap(({ read: { issues } }) => issues)],
    watch: [],
  };
}

async function scanBase(where: Omit<Where, 'files'>): Promise<AgentScanOutcome> {
  const { context, base, folder } = where;
  const files = await context.folders.open(base, context.signal);
  if (files === undefined) return EMPTY;
  const read = await readFiles({ ...where, files });
  const watch = await watchedFolder(files, where.container, {
    watched: folder.watched && context.watch !== false,
    signal: context.signal,
  });
  return { ...read, watch };
}

const merge = (parts: readonly AgentScanOutcome[]): AgentScanOutcome => ({
  entries: parts.flatMap((part) => part.entries),
  issues: parts.flatMap((part) => part.issues),
  watch: parts.flatMap((part) => part.watch),
});

/** The folders of a source that may load, with their places below every scope folder. */
async function placesOf(context: AgentScanContext, source: FileSource, roots: readonly string[]) {
  const allowed = AGENT_SCOPE_RULES[source].folders.filter(
    (folder) => context.allows?.(folder.origin) ?? true,
  );
  return Promise.all(
    allowed.map(async (folder) => ({ folder, places: await folder.places(context, roots) })),
  );
}

/** The places below one scope folder: the documented one is `.claude`, whatever its root is. */
const below = (places: readonly ScopePlace[], root: string) =>
  places.filter((place) => (place.documented ? root === CLAUDE_FOLDER : place.root === root));

/**
 * The folders of one source, base after base and folder after folder, below `.claude` and then below
 * each of the host's extra folders (`scopeFoldersOf`): `order` counts across them, so an extra
 * folder's agent loses a shared name to every `.claude` one of its source.
 */
async function scanSource(
  context: AgentScanContext,
  source: FileSource,
): Promise<AgentScanOutcome> {
  const roots = scopeFoldersOf(context);
  const folders = await placesOf(context, source, roots);
  const parts: AgentScanOutcome[] = [];
  let order = 0;
  for (const root of roots) {
    for (const { folder, places } of folders) {
      for (const place of below(places, root)) {
        const container = placePath(place, AGENTS_FOLDER);
        parts.push(await scanBase({ context, source, folder, base: place.base, order, container }));
        order += 1;
      }
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
