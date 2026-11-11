import type { WorkerCrash } from '../ports.ts';

/**
 * The ledger of the hooks worker's stops (plugins/mods/troubleshoot.md, "`it crashed the hooks
 * worker`" and "`mods that run in the hooks worker are off for this session`"). Installed mods share
 * one worker. A stop traced to one mod unloads that mod; the others get a fresh copy in the replaced
 * worker. A stop that cannot be traced is counted, and the third unloads every mod that is not built
 * in. The docs give no time window and no pause between restarts: the count is per session and
 * `/reload-plugins` starts it over (judgment, spec/judgments.md).
 */

/** "The worker stopped three times and Claude Code couldn't trace the stops to one mod". */
export const WORKER_STOP_LIMIT = 3;

/** What one stop of the worker comes to. */
export interface CrashPlan {
  /** The mods to unload. */
  readonly unload: readonly string[];
  /** The mods that get a fresh copy of their module. */
  readonly restart: readonly string[];
  /** The lines for people, in order. */
  readonly lines: readonly string[];
}

export interface WorkerHealth {
  /** `crash` happened while `mods` (the names of those that are not built in) were loaded. */
  plan(crash: WorkerCrash, mods: readonly string[]): CrashPlan;
  /** Counts the stops from the start: `/reload-plugins` turns the mods on again. */
  reset(): void;
}

export const unloadedLine = (mod: string): string =>
  `${mod} was unloaded: it crashed the hooks worker`;

export const offLine = (): string =>
  `hooks: mods that run in the hooks worker are off for this session: it crashed ${WORKER_STOP_LIMIT} times`;

export function createWorkerHealth(): WorkerHealth {
  let untraced = 0;
  return {
    plan(crash, mods) {
      const { culprit } = crash;
      if (culprit !== undefined && mods.includes(culprit)) {
        return {
          unload: [culprit],
          restart: mods.filter((mod) => mod !== culprit),
          lines: [unloadedLine(culprit)],
        };
      }
      untraced += 1;
      if (untraced >= WORKER_STOP_LIMIT) return { unload: mods, restart: [], lines: [offLine()] };
      return { unload: [], restart: mods, lines: [] };
    },
    reset: () => void (untraced = 0),
  };
}
