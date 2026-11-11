import { configDirectoryOf } from '../../format/config-directory.ts';
import { error, type PluginIssue } from '../../format/issues.ts';
import { byCodeUnit } from '../../format/listing.ts';

/**
 * Where a saved workflow is written and which one `/<name>` runs (workflows.md, "Save the workflow
 * for reuse"). Pure over the facts the host reads from the disk; the host does the write and the
 * `lstat`s.
 */

export const SAVE_SCOPES = ['project', 'personal'] as const;
export type SaveScope = (typeof SAVE_SCOPES)[number];

export interface SaveRequest {
  readonly scope: SaveScope;
  /** The workflow's file name without `.js`. */
  readonly name: string;
  /** The working directory, then each parent up to the repository root, nearest first (`FolderScan.repository`). */
  readonly directories: readonly string[];
  /** The directories of that chain that already have a `.claude/workflows` folder. */
  readonly withWorkflows: ReadonlySet<string>;
  readonly home: string;
  /** `CLAUDE_CONFIG_DIR`, when set. */
  readonly configDir?: string | undefined;
  /** `Locations.joinPath`: a base and a `/`-separated relative path, joined the way the host writes paths. */
  readonly join: (base: string, relativePath: string) => string;
}

export interface SavePlan {
  readonly scope: SaveScope;
  /** The folder the file goes in. */
  readonly directory: string;
  /** The file: `<directory>/<name>.js`. */
  readonly path: string;
  /** The paths that must not be symbolic links, for the host to check before it writes. */
  readonly mustNotBeLinks: readonly string[];
}

const PROJECT_FOLDER = '.claude/workflows';

/** "the closest `.claude/workflows/` directory that already exists between your working directory and the repository root, or the repository root if none exists yet". */
function projectBase(request: SaveRequest): string | undefined {
  const closest = request.directories.find((directory) => request.withWorkflows.has(directory));
  return closest ?? request.directories.at(-1);
}

type Location = (request: SaveRequest, file: string) => Omit<SavePlan, 'scope'> | undefined;

/**
 * The two save locations. Project: refused if `.claude`, `.claude/workflows` or the target file is a
 * symbolic link. Personal: `~/.claude/workflows/`, or the `workflows/` directory under
 * `CLAUDE_CONFIG_DIR`; refused only if the target file itself is a link, "so a `~/.claude` directory
 * managed by a dotfiles tool still works".
 */
const LOCATIONS: { readonly [S in SaveScope]: Location } = {
  project: (request, file) => {
    const base = projectBase(request);
    if (base === undefined) return undefined;
    const directory = request.join(base, PROJECT_FOLDER);
    const path = request.join(base, `${PROJECT_FOLDER}/${file}`);
    const mustNotBeLinks = [request.join(base, '.claude'), directory, path];
    return { directory, path, mustNotBeLinks };
  },
  personal: (request, file) => {
    const directory = request.join(
      configDirectoryOf(request.home, request.configDir, request.join),
      'workflows',
    );
    const path = request.join(directory, file);
    return { directory, path, mustNotBeLinks: [path] };
  },
};

/** A name that is one file name: no folder, no `.` or `..`, not empty (judgment: the docs name no rule). */
const FILE_NAME = /^[^/\\\0]+$/;

export type SaveOutcome =
  | { readonly plan: SavePlan; readonly issue?: undefined }
  | { readonly plan?: undefined; readonly issue: PluginIssue };

export function planWorkflowSave(request: SaveRequest): SaveOutcome {
  const bad = !FILE_NAME.test(request.name) || request.name === '.' || request.name === '..';
  if (bad)
    return {
      issue: error('name', `${JSON.stringify(request.name)} is not a file name for a workflow`),
    };
  const found = LOCATIONS[request.scope](request, `${request.name}.js`);
  if (found === undefined)
    return { issue: error('directories', 'no working directory to save under') };
  return { plan: { scope: request.scope, ...found } };
}

/** "shows an error instead of writing through one": the first of `mustNotBeLinks` that is a symbolic link. */
export function refuseLinks(plan: SavePlan, linked: ReadonlySet<string>): PluginIssue | undefined {
  const link = plan.mustNotBeLinks.find((path) => linked.has(path));
  return link === undefined
    ? undefined
    : error(link, `refusing to save the workflow through a symbolic link: ${link}`);
}

/** A workflow file found in a save location. */
export interface SavedWorkflow {
  /** What `/<name>` runs it as: its `meta.name`. */
  readonly name: string;
  /**
   * Its `meta.description`, which the `meta` block must hold (workflows.md, "Edit a saved script"),
   * for a listing beside the name. Always set by `scanSavedWorkflows`; optional so a host that builds
   * the list itself need not give one.
   */
  readonly description?: string;
  readonly scope: SaveScope;
  /** For a project workflow, how many levels above the working directory its `.claude/workflows` is: 0 is the working directory's own. */
  readonly distance: number;
  readonly path: string;
}

export interface SavedResolution {
  /** The workflow each name runs. */
  readonly winners: readonly SavedWorkflow[];
  /** The ones a winner of the same name hides. */
  readonly shadowed: readonly SavedWorkflow[];
}

/** Lower is stronger: the project's closest folder first, the personal one last. */
const rank = (workflow: SavedWorkflow): number =>
  workflow.scope === 'personal' ? Number.POSITIVE_INFINITY : workflow.distance;

/**
 * "when more than one defines the same name Claude Code runs the one closest to the working
 * directory. If a project workflow and a personal workflow share a name, the project one runs." Two in
 * one folder with one name: the first path in code-unit order (judgment).
 */
export function resolveSavedWorkflows(found: readonly SavedWorkflow[]): SavedResolution {
  const ordered = found.toSorted((a, b) => rank(a) - rank(b) || byCodeUnit(a.path, b.path));
  const winners = new Map<string, SavedWorkflow>();
  const shadowed: SavedWorkflow[] = [];
  for (const workflow of ordered) {
    if (winners.has(workflow.name)) shadowed.push(workflow);
    else winners.set(workflow.name, workflow);
  }
  return { winners: [...winners.values()], shadowed };
}
