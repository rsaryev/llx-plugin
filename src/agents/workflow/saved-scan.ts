import type { PluginIssue } from '../../format/issues.ts';
import { readWorkflowMeta } from '../../format/workflow-meta.ts';
import { configFolderOf } from '../../format/config-directory.ts';
import {
  placePath,
  readScopeFiles,
  SCOPE_BASES,
  type ScopeRequest,
} from '../../foundation/scope-folders.ts';
import type { FolderScan } from '../../ports/folder-scan.ts';
import {
  resolveSavedWorkflows,
  type SavedResolution,
  type SavedWorkflow,
  type SaveScope,
} from './saved.ts';

/**
 * Reads the saved workflows (workflows.md, "Save the workflow for reuse") through the `FolderScan`
 * port: `<dir>/.claude/workflows/*.js` for the working directory and every parent up to the
 * repository root ("Project workflows also load from every `.claude/workflows/` along that path"), and
 * the personal `~/.claude/workflows/` (the `workflows/` folder under `CLAUDE_CONFIG_DIR` when set).
 * A workflow runs as `/<meta.name>`; a script without a readable `meta` is left out ("Claude Code
 * drops `/<name>` from `/` autocomplete"), with the issues of its `meta` at the file's path.
 */

export interface SavedScanRequest extends ScopeRequest {
  readonly signal?: AbortSignal | undefined;
}

export interface SavedScan extends SavedResolution {
  readonly issues: readonly PluginIssue[];
}

interface Place {
  readonly base: string;
  /** The workflows folder below the base. */
  readonly folder: string;
  readonly scope: SaveScope;
  readonly distance: number;
}

async function readPlace(folders: FolderScan, place: Place, signal?: AbortSignal) {
  const opened = await folders.open(place.base, signal);
  if (opened === undefined) return { found: [], issues: [] };
  const read = await readScopeFiles(opened, place.folder, {
    extension: '.js',
    depth: 'flat',
    signal,
  });
  const metas = read.files.map((file) => ({
    path: file.hostPath,
    read: readWorkflowMeta(file.text),
  }));
  return {
    found: metas.flatMap(({ path, read: { meta } }): SavedWorkflow[] =>
      meta === undefined
        ? []
        : [
            {
              name: meta.name,
              description: meta.description,
              scope: place.scope,
              distance: place.distance,
              path,
            },
          ],
    ),
    issues: [
      ...read.issues,
      ...metas.flatMap(({ path, read: { issues } }) => issues.map((issue) => ({ ...issue, path }))),
    ],
  };
}

const WORKFLOWS = '.claude/workflows';

export async function scanSavedWorkflows(
  folders: FolderScan,
  request: SavedScanRequest,
): Promise<SavedScan> {
  const { signal } = request;
  const user = configFolderOf(request.home, request.configDir);
  const chain = await SCOPE_BASES.repository({
    folders,
    request,
    ...(signal === undefined ? {} : { signal }),
  });
  const places: Place[] = [
    ...chain.map((base, distance): Place => ({
      base,
      folder: WORKFLOWS,
      scope: 'project',
      distance,
    })),
    {
      base: user.base,
      folder: placePath({ root: user.folder }, 'workflows'),
      scope: 'personal',
      distance: 0,
    },
  ];
  const reads = await Promise.all(places.map((place) => readPlace(folders, place, signal)));
  const resolved = resolveSavedWorkflows(reads.flatMap((read) => read.found));
  return { ...resolved, issues: reads.flatMap((read) => read.issues) };
}
