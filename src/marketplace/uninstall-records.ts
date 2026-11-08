import { error, type PluginIssue } from '../format/issues.ts';
import { samePath } from './command-output.ts';
import type { InstallRecord } from './installed-plugins.ts';
import type { InstallScope } from './install-scopes.ts';
import { dirsToOrphan } from './orphan-cleanup.ts';
import type { StoreLayout } from './store-layout.ts';

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
 * separators do not tell folders apart; elsewhere nothing but the text does); a project or local
 * uninstall that names no folder removes nothing and says so, since the scope is one folder's and
 * removing every project's record would uninstall the plugin everywhere; when no record matches
 * the command says `Plugin "<name>" is not installed in <scope> scope`; an uninstall marks the
 * version folders it leaves behind, inside the cache only (`dirsToOrphan`).
 */

export interface UninstallSelector {
  /** What the command names, for its messages: `<name>` or `<name>@<marketplace>`. */
  readonly plugin: string;
  readonly layout: StoreLayout;
  readonly scope: InstallScope;
  /** The project folder the command ran in, as the command spells it; `project` and `local` scope only. */
  readonly projectPath?: string;
  readonly platform: 'posix' | 'windows';
}

export interface UninstallSelection {
  readonly removed: readonly InstallRecord[];
  readonly kept: readonly InstallRecord[];
  /** The version directories the uninstall leaves behind: write `.orphaned_at` into each. */
  readonly orphaned: readonly string[];
  readonly issues: readonly PluginIssue[];
}

const PER_PROJECT: readonly InstallScope[] = ['project', 'local'];

/** The records of the scope that belong to the folder the command named, exact spelling first. */
function inScope(records: readonly InstallRecord[], selector: UninstallSelector) {
  const ofScope = records.filter((one) => one.scope === selector.scope);
  if (!PER_PROJECT.includes(selector.scope)) return ofScope;
  const wanted = selector.projectPath;
  if (wanted === undefined) return [];
  const exact = ofScope.filter((one) => one.projectPath === wanted);
  if (exact.length > 0) return exact;
  return ofScope.filter(
    (one) => one.projectPath !== undefined && samePath(one.projectPath, wanted, selector.platform),
  );
}

/** The refusal for a project or local scope without the folder the command ran in. */
const NEEDS_FOLDER = (scope: InstallScope): string =>
  `The ${scope} scope belongs to one project folder: name the folder the command runs in`;

/** What the command says when no record is left to remove: `Plugin "<name>" is not installed in <scope> scope`. */
const notInstalledInScope = (name: string, scope: InstallScope): string =>
  `Plugin "${name}" is not installed in ${scope} scope`;

function issuesOf(selector: UninstallSelector, removed: readonly InstallRecord[]) {
  if (removed.length > 0) return [];
  const needsFolder = PER_PROJECT.includes(selector.scope) && selector.projectPath === undefined;
  return [
    error(
      'plugin',
      needsFolder
        ? NEEDS_FOLDER(selector.scope)
        : notInstalledInScope(selector.plugin, selector.scope),
    ),
  ];
}

export function selectUninstall(
  records: readonly InstallRecord[],
  selector: UninstallSelector,
): UninstallSelection {
  const removed = inScope(records, selector);
  const kept = records.filter((one) => !removed.includes(one));
  return {
    removed,
    kept,
    orphaned: dirsToOrphan(removed, kept, selector.layout),
    issues: issuesOf(selector, removed),
  };
}
