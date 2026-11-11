import { samePath } from './command-output.ts';
import type { InstalledRecords, InstallRecord } from './installed-plugins.ts';
import type { InstallScope } from './install-scopes.ts';

/**
 * Which install records apply in one project folder (plugins/install.md, "Choose an install
 * scope"; plugins/overview.md, "Understand install scopes"): a user-scope install is "enabled for
 * you in every project on this machine", a project- or local-scope one in "this repository" only,
 * the folder its `projectPath` names ("Project the install belongs to", plugins/cli-reference.md).
 * Pure over the records `parseInstalledPlugins` read. Judgments (spec/judgments.md): a managed
 * record applies everywhere, like a user one; a project or local record without `projectPath`
 * belongs to no folder; the folders compare as `selectUninstall` compares them (`samePath`).
 */

/** Where the session runs: the project folder whose `.claude/` settings it reads, if any. */
export interface InstallsAt {
  readonly projectPath?: string;
  readonly platform: 'posix' | 'windows';
}

/** Whether a scope's records apply everywhere or only in their own folder. */
const EVERYWHERE: { readonly [S in InstallScope]: boolean } = {
  user: true,
  managed: true,
  project: false,
  local: false,
};

const appliesAt = (one: InstallRecord, at: InstallsAt): boolean => {
  if (EVERYWHERE[one.scope]) return true;
  const { projectPath } = at;
  return (
    projectPath !== undefined &&
    one.projectPath !== undefined &&
    samePath(one.projectPath, projectPath, at.platform)
  );
};

/** The records that apply at `at`, by plugin id in file order; a plugin none of whose records apply is left out. */
export function installsAt(records: InstalledRecords, at: InstallsAt): InstalledRecords {
  return Object.fromEntries(
    Object.entries(records)
      .map(([id, list]): [string, readonly InstallRecord[]] => [
        id,
        list.filter((one) => appliesAt(one, at)),
      ])
      .filter(([, list]) => list.length > 0),
  );
}
