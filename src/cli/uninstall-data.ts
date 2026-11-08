import { pluginDataId } from '../loading/resolve/data-id.ts';
import type { InstalledRecord } from '../marketplace/dependency-graph.ts';
import type { InstallScope } from '../marketplace/install-scopes.ts';

/**
 * What `claude plugin uninstall` deletes and keeps (plugins/cli-reference.md, "plugin uninstall",
 * "What an uninstall deletes and keeps"). From the last scope a plugin is installed at, its stored
 * options and secrets and its data directory `~/.claude/plugins/data/<id>/` go, except: `--keep-data`
 * keeps the directory; another installed plugin that uses the same folder keeps it (the folder is
 * `pluginDataId`, and "an ID [that] differs from this one only in letter case" names the same
 * folder, so folders are compared without regard to case); and installed plugins that cannot be read
 * back after the removal keep the options, the secrets and the directory ("the plugin may still be
 * installed at another scope"). Pure over what the host read back.
 */

/** Why the data directory stayed. `other-scope` is the judgment that a plugin still installed somewhere keeps everything. */
export type DataKeptBecause =
  | 'keep-data'
  | 'shared-folder'
  | 'other-scope'
  | 'install_records_unreadable';

/** "With `--json` the result carries `savedKept: \"install_records_unreadable\"`". */
export const SAVED_KEPT_UNREADABLE = 'install_records_unreadable';

export interface RetentionFacts {
  /** `name@marketplace` of the plugin just removed from `scope`. */
  readonly id: string;
  readonly scope: InstallScope;
  readonly keepData?: boolean;
  /** The installed plugins read back after the removal from `scope`; `'unreadable'` when the list could not be read. */
  readonly remaining: readonly InstalledRecord[] | 'unreadable';
}

export interface Retention {
  /** Its stored options and secrets. */
  readonly saved: 'delete' | 'keep';
  readonly data: 'delete' | 'keep';
  /** Set when `saved` is `keep` because the records could not be read. */
  readonly savedKept?: typeof SAVED_KEPT_UNREADABLE;
  /** Set when `data` is `keep`. */
  readonly dataKeptBecause?: DataKeptBecause;
  /** The folder name under `~/.claude/plugins/data/`. */
  readonly dataFolder: string;
}

const sameFolder = (a: string, b: string): boolean =>
  pluginDataId(a).toLowerCase() === pluginDataId(b).toLowerCase();

/** Why the data directory stays, in the order the docs list the exceptions; `undefined` when it goes. */
function keptBecause(
  facts: RetentionFacts,
  others: readonly InstalledRecord[],
): DataKeptBecause | undefined {
  if (others.some((record) => record.id === facts.id)) return 'other-scope';
  if (facts.keepData === true) return 'keep-data';
  return others.some((record) => sameFolder(record.id, facts.id)) ? 'shared-folder' : undefined;
}

/** What the uninstall of `facts.id` from `facts.scope` deletes and keeps. */
export function uninstallRetention(facts: RetentionFacts): Retention {
  const dataFolder = pluginDataId(facts.id);
  if (!Array.isArray(facts.remaining)) {
    return {
      saved: 'keep',
      data: 'keep',
      savedKept: SAVED_KEPT_UNREADABLE,
      dataKeptBecause: 'install_records_unreadable',
      dataFolder,
    };
  }
  const because = keptBecause(facts, facts.remaining);
  const savedStays = facts.remaining.some((record) => record.id === facts.id);
  return {
    saved: savedStays ? 'keep' : 'delete',
    data: because === undefined ? 'delete' : 'keep',
    ...(because === undefined ? {} : { dataKeptBecause: because }),
    dataFolder,
  };
}

/** `/plugin` "shows `· data preserved` when it did". */
export const DATA_PRESERVED = '· data preserved';
