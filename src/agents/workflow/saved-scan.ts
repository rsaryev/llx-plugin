import type { PluginIssue } from '../../format/issues.ts';
import { readWorkflowMeta } from '../../format/workflow-meta.ts';
import { listChildren } from '../../foundation/folder-walk.ts';
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

export interface SavedScanRequest {
  readonly cwd: string;
  readonly home: string;
  readonly configDir?: string | undefined;
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
  const listed = await listChildren(opened, place.folder, signal);
  const files = listed.found.filter((child) => child.isFile && child.name.endsWith('.js'));
  const reads = await Promise.all(
    files.map(async (child) => {
      const text = await opened.files.readText(child.path, signal);
      const path = opened.hostPath(child.path);
      const { meta, issues } = readWorkflowMeta(text ?? '');
      const found: SavedWorkflow[] =
        meta === undefined
          ? []
          : [{ name: meta.name, scope: place.scope, distance: place.distance, path }];
      return { found, issues: issues.map((issue) => ({ ...issue, path })) };
    }),
  );
  return {
    found: reads.flatMap((read) => read.found),
    issues: [...listed.issues, ...reads.flatMap((read) => read.issues)],
  };
}

export async function scanSavedWorkflows(
  folders: FolderScan,
  request: SavedScanRequest,
): Promise<SavedScan> {
  const chain = await folders.repository(request.cwd, request.signal);
  const places: Place[] = [
    ...chain.directories.map((base, distance): Place => ({
      base,
      folder: '.claude/workflows',
      scope: 'project',
      distance,
    })),
    request.configDir === undefined
      ? { base: request.home, folder: '.claude/workflows', scope: 'personal', distance: 0 }
      : { base: request.configDir, folder: 'workflows', scope: 'personal', distance: 0 },
  ];
  const reads = await Promise.all(places.map((place) => readPlace(folders, place, request.signal)));
  const resolved = resolveSavedWorkflows(reads.flatMap((read) => read.found));
  return { ...resolved, issues: reads.flatMap((read) => read.issues) };
}
