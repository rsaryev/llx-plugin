import type { Clock } from '../ports/clock.ts';
import type { Environment } from '../ports/environment.ts';
import { autoUpdatePassAllowed } from './auto-update-precedence.ts';
import {
  pluginSkippedByAutoUpdate,
  type AutoUpdateCandidate,
  type SkippedBy,
} from './auto-update-skips.ts';

/**
 * The auto-update pass (plugins/loading.md, "When auto-update runs"): "In an interactive session,
 * after you send your first message, Claude Code waits a random delay of up to ten minutes. It then
 * refreshes every marketplace with auto-update on and updates the plugins installed from them on
 * disk." The kit plans one pass and arms the first one on the `Clock`; how often a host repeats it
 * is the host's choice (the docs describe the one pass of a session).
 */

export const FIRST_PASS_MAX_DELAY_MS = 10 * 60_000;

/** A delay in `[0, 10 minutes]` from a source of numbers in `[0, 1]` (anything outside is clamped). */
export const firstPassDelayMs = (random: () => number): number =>
  Math.min(
    FIRST_PASS_MAX_DELAY_MS,
    Math.max(0, Math.floor(random() * (FIRST_PASS_MAX_DELAY_MS + 1))),
  );

export interface FirstPassOptions {
  readonly clock: Clock;
  readonly env: Environment;
  /** The host's source of randomness: the kit has none (L3). */
  readonly random: () => number;
  readonly run: () => void;
}

export interface ArmedPass {
  /** False when the environment turns the pass off: nothing was set on the clock. */
  readonly armed: boolean;
  readonly cancel: () => void;
}

/** Call this after the first message. The pass is armed only when `autoUpdatePassAllowed`. */
export function armFirstPass(options: FirstPassOptions): ArmedPass {
  if (!autoUpdatePassAllowed(options.env)) return { armed: false, cancel: () => {} };
  const cancel = options.clock.setTimer(options.run, firstPassDelayMs(options.random));
  return { armed: true, cancel };
}

export interface PassMarketplace {
  readonly name: string;
  /** Its resolved auto-update setting (`marketplaceAutoUpdate`). */
  readonly autoUpdate: boolean;
  /** The plugins the user installed from it. */
  readonly plugins: readonly { readonly id: string; readonly candidate: AutoUpdateCandidate }[];
}

export interface PassPlan {
  /** Marketplaces to refresh, in the order given. */
  readonly refresh: readonly string[];
  /** Plugin ids to update on disk. */
  readonly update: readonly string[];
  readonly skipped: readonly {
    readonly id: string;
    readonly reason: SkippedBy;
    readonly listedInErrorsTab: boolean;
  }[];
}

const EMPTY: PassPlan = { refresh: [], update: [], skipped: [] };

/** One pass: nothing when the environment turns it off, otherwise per auto-update marketplace its plugins less the skipped. */
export function planAutoUpdatePass(
  marketplaces: readonly PassMarketplace[],
  env: Environment,
): PassPlan {
  if (!autoUpdatePassAllowed(env)) return EMPTY;
  const on = marketplaces.filter((marketplace) => marketplace.autoUpdate);
  const verdicts = on.flatMap((marketplace) =>
    marketplace.plugins.map((plugin) => ({
      id: plugin.id,
      skip: pluginSkippedByAutoUpdate(plugin.candidate),
    })),
  );
  return {
    refresh: on.map((marketplace) => marketplace.name),
    update: verdicts.filter((each) => !each.skip.skipped).map((each) => each.id),
    skipped: verdicts.flatMap((each) =>
      each.skip.skipped
        ? [
            {
              id: each.id,
              reason: each.skip.reason,
              listedInErrorsTab: each.skip.listedInErrorsTab,
            },
          ]
        : [],
    ),
  };
}

/** What the running session shows after a plugin updated on disk: it keeps the version it loaded. */
export const pluginUpdatedNotice = (name: string): string =>
  `Plugin updated: ${name} · Run /reload-plugins to apply`;
