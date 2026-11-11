import { warning, type PluginIssue } from '../format/issues.ts';
import type { HostState } from './state.ts';

/**
 * Whether a session has read its skills or agents folders yet: one rule for both. A session reads
 * them only when asked (`reloadSkills`, `addDirectory`, `moveTo`; `reloadAgents`), and its catalogs
 * call no port, so until the first read a catalog without the folders would pass for a whole one.
 * Judgment (spec/judgments.md): every view of the catalog then carries this warning instead; a session
 * without a folder port has nothing to read and carries none.
 */
export interface FirstRead {
  /** A read of the folders finished. */
  done(): void;
  /** The warning while the folders are still to read, for the catalog of `state`. */
  issues(state: HostState): readonly PluginIssue[];
}

export function createFirstRead(surface: 'skills' | 'agents', reload: string): FirstRead {
  const unread = [
    warning(
      surface,
      `the ${surface} folders have not been read yet: call ${reload}() before listing them`,
    ),
  ];
  let read = false;
  return {
    done: () => {
      read = true;
    },
    issues: (state) => (read || state.options.ports.folders === undefined ? [] : unread),
  };
}
