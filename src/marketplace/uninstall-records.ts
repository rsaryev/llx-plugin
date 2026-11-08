import { samePath } from './command-output.ts';
import type { InstallRecord } from './installed-plugins.ts';
import type { InstallScope } from './install-scopes.ts';

/**
 * Which install records one `claude plugin uninstall` removes (plugins/troubleshooting.md, "A
 * plugin stays installed after `plugin uninstall` on Windows"): at project or local scope a record
 * belongs to a project folder, and "`installed_plugins.json` held two install records of the plugin
 * for the project folder, each spelling the folder's path differently, and one uninstall removes one
 * of them". The record under the spelling the command was run with goes first; "the second run finds
 * no record under its own spelling of the path, so it removes the one under the other spelling"
 * (from v2.1.295). Pure over the records; the host rewrites the file.
 *
 * Judgments (spec/judgments.md): "spelling" is the text of `projectPath` as written; the other
 * spelling is found by the platform's own comparison of paths (on Windows, capitals and the two
 * separators do not tell folders apart; elsewhere nothing but the text does).
 */

export interface UninstallSelector {
  readonly scope: InstallScope;
  /** The project folder the command ran in, as the command spells it; `project` and `local` scope only. */
  readonly projectPath?: string;
  readonly platform: 'posix' | 'windows';
}

export interface UninstallSelection {
  readonly removed: readonly InstallRecord[];
  readonly kept: readonly InstallRecord[];
}

const PER_PROJECT: readonly InstallScope[] = ['project', 'local'];

/** The records of the scope that belong to the folder the command named, exact spelling first. */
function inScope(records: readonly InstallRecord[], selector: UninstallSelector) {
  const ofScope = records.filter((one) => one.scope === selector.scope);
  const wanted = selector.projectPath;
  if (!PER_PROJECT.includes(selector.scope) || wanted === undefined) return ofScope;
  const exact = ofScope.filter((one) => one.projectPath === wanted);
  if (exact.length > 0) return exact;
  return ofScope.filter(
    (one) => one.projectPath !== undefined && samePath(one.projectPath, wanted, selector.platform),
  );
}

export function selectUninstall(
  records: readonly InstallRecord[],
  selector: UninstallSelector,
): UninstallSelection {
  const removed = inScope(records, selector);
  return { removed, kept: records.filter((one) => !removed.includes(one)) };
}

/** What the command says when no record is left to remove: `Plugin "<name>" is not installed in <scope> scope`. */
export const notInstalledInScope = (name: string, scope: InstallScope): string =>
  `Plugin "${name}" is not installed in ${scope} scope`;
