import type { SkillOrigin } from '../../format/skill-types.ts';
import type { FolderScan } from '../../ports/folder-scan.ts';
import { SCOPE_RULES, type ScanScope, type ScopeRule } from './locations.ts';
import { readSkillFolder, readSkills } from './read.ts';
import { EMPTY, type ScanOutcome, type Where } from './scan-types.ts';

/**
 * One skills container that is not a scope's `.claude/skills`: the folder a plugin's manifest lists
 * under `skills` (plugins/components.md, "Skills"), a store's or a curator's skills directory. Its
 * immediate children are the skill folders, read as `scanFolders` reads them, and the entries carry
 * no body.
 */

export interface ContainerRequest {
  /** What the entries report as their scope. */
  readonly scope: ScanScope;
  readonly origin: SkillOrigin;
  /**
   * The container holds a `SKILL.md` itself: the folder is one skill and its own subfolders are its
   * files, not more skills ("skills": ["./"] lists a plugin whose root is one skill). It goes by this
   * name unless its frontmatter names it.
   */
  readonly rootName: string;
  readonly signal?: AbortSignal;
}

/**
 * The skills of `container` (a path relative to `dir`, `.` for `dir` itself) read through the port.
 * A folder that does not exist has no skills.
 */
export async function scanSkillContainer(
  folders: FolderScan,
  dir: string,
  container: string,
  request: ContainerRequest,
): Promise<ScanOutcome> {
  const { signal } = request;
  const folder = await folders.open(dir, signal);
  if (folder === undefined) return EMPTY;
  const rule: ScopeRule = { ...SCOPE_RULES[request.scope], origin: request.origin };
  const where: Where = {
    context: {
      folders,
      request: { home: dir, cwd: dir },
      ...(signal === undefined ? {} : { signal }),
    },
    rule,
    scope: request.scope,
    folder,
    // Not a scope folder: never the documented one, so no skill folder here is read as a plugin.
    place: { base: dir, root: container, index: 0, documented: false },
  };
  const root = container === '.' ? 'SKILL.md' : `${container}/SKILL.md`;
  if (await folder.files.exists(root, signal)) {
    const canonical = await folder.canonicalPath(container, signal);
    return readSkillFolder(where, request.rootName, container, canonical);
  }
  return readSkills(where, container, () => Promise.resolve([]));
}
