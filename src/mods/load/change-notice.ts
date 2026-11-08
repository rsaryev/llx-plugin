import type { ReloadOutcome } from './loader.ts';

/**
 * The transcript line of a mod Claude wrote whose change did not load (plugins/mods/troubleshoot.md,
 * "`This mod's change didn't load` or `the earlier version is no longer running`"): it starts with
 * the mod's name and ends with the reason. Claude does not see it, so the person pastes it into the
 * next message; the host shows it and keeps it out of the model's context.
 */

const STILL_RUNNING = "This mod's change didn't load, so the earlier version is still running";
const NOT_RUNNING = "This mod didn't load, and the earlier version is no longer running";

/** The line for a reload that failed, or `undefined` for one that worked. */
export function changeNotice(name: string, outcome: ReloadOutcome): string | undefined {
  if (outcome.failure === undefined) return undefined;
  const { reason, earlierRuns } = outcome.failure;
  const trimmed = reason.replace(/\.+$/, '');
  return `${name}: ${earlierRuns ? STILL_RUNNING : NOT_RUNNING}: ${trimmed}.`;
}
