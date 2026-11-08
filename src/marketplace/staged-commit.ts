import { error, type PluginIssue } from '../format/issues.ts';
import type { StagedDirectory } from './ports.ts';
import { moveFailureMessage } from './install-failures.ts';

/**
 * Installing a fetched plugin by moving the directory the host staged it in into the version folder
 * of the cache (plugins/troubleshooting.md, "Could not move the new copy of this plugin version
 * into <path>": "Claude Code downloads a fresh copy of its files and moves it into that version's
 * folder in the plugin cache"). The move is the host's, atomic and with the earlier copy set aside
 * and put back; a move that fails is the documented message, never a throw.
 */

/**
 * Moves `stagedPath` to `destination`. `undefined` on success; otherwise the issue that says why it
 * is not installed, with what became of the copy installed before. An abort is an issue of its own:
 * nothing moved, so there is no earlier copy to report.
 */
export async function commitStagedPlugin(input: {
  readonly staged: StagedDirectory;
  readonly stagedPath: string;
  readonly destination: string;
  readonly signal: AbortSignal;
}): Promise<PluginIssue | undefined> {
  const failure = await input.staged.commit(input.stagedPath, input.destination, input.signal);
  if (failure === undefined) return undefined;
  const message =
    moveFailureMessage(input.destination, failure) ?? 'The install was aborted before the move';
  return error('source', message);
}
