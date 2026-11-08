import { enabledNotInstalled } from './install-errors.ts';
import type { ErrorsTabEntry } from './install-messages.ts';

/**
 * Two questions about `enabledPlugins` that the loading reference answers (plugins/loading.md,
 * "Find where a plugin is enabled"): why a plugin you turned off still loads, and whether Claude
 * Code fetches a plugin only a project enables. Pure over the facts a host read from the settings
 * layers; which layer wins is the settings module's (`enabledPlugin`), so a caller passes its
 * `decidedBy` here, and this module imports nothing from it (same layer).
 */

/** The sources an `enabledPlugins` entry can come from (the table of "Find where a plugin is enabled"). */
export type EnableSource = 'addDir' | 'user' | 'project' | 'local' | 'flag' | 'managed';

// ---- "Disabled in user settings but still loads" ----

interface Overrider {
  /** How the message names the source that overrode the user setting. */
  readonly label: string;
  /** Whether a `false` in `.claude/settings.local.json` can opt out of it. */
  readonly optOut: boolean;
}

/**
 * The sources above user settings, with the names the docs give: `project`, `project, gitignored`
 * for `.claude/settings.local.json`, `cli flag` and `managed`. `--add-dir` ranks below user
 * settings and never overrides it.
 */
const OVERRIDERS: { readonly [S in EnableSource]?: Overrider } = {
  project: { label: 'project', optOut: true },
  local: { label: 'project, gitignored', optOut: false },
  flag: { label: 'cli flag', optOut: false },
  managed: { label: 'managed', optOut: false },
};

export interface UserDisableOverridden {
  /** The row's text in `claude plugin list` and `/plugin`. */
  readonly message: string;
  /** How to turn it off on this machine: `false` for the id in this file, which outranks the project file. */
  readonly optOut?: { readonly file: string; readonly value: false };
}

const LOCAL_SETTINGS = '.claude/settings.local.json';

/**
 * `Disabled in ~/.claude/settings.json but still loads — project settings enable it, which
 * overrides your user setting`, for a plugin set to `false` in user settings that a `true` in a
 * higher source keeps on (loading.md; troubleshooting.md). Judgment (spec/judgments.md): the docs
 * quote the sentence for `project` only, so another source is named in the same place by its
 * label (`cli flag settings enable it`).
 */
export function overriddenUserDisable(winner: {
  readonly user?: boolean;
  readonly decidedBy: EnableSource;
  readonly on: boolean;
}): UserDisableOverridden | undefined {
  const overrider = OVERRIDERS[winner.decidedBy];
  if (winner.user !== false || !winner.on || overrider === undefined) return undefined;
  const message = `Disabled in ~/.claude/settings.json but still loads — ${overrider.label} settings enable it, which overrides your user setting`;
  return overrider.optOut
    ? { message, optOut: { file: LOCAL_SETTINGS, value: false } }
    : { message };
}

// ---- "Enabled in project settings but not installed" ----

/** One source that sets the plugin to `true`; a `local` file says whether git tracks it. */
export interface TrueIn {
  readonly source: EnableSource;
  readonly gitTracked?: boolean;
}

export interface EnabledFacts {
  readonly name: string;
  readonly marketplace: string;
  /** Every source that sets the plugin to `true`. */
  readonly trueIn: readonly TrueIn[];
  /** An install record exists for it. */
  readonly installed: boolean;
  /** Its marketplace entry has a relative-path source. */
  readonly relativePath: boolean;
  /** A seed directory already holds it. */
  readonly seeded: boolean;
}

export interface EnabledFetchDecision {
  /** Claude Code downloads the plugin's external source. */
  readonly fetch: boolean;
  /** It loads from the marketplace itself, needing no install record. */
  readonly inPlace: boolean;
  /** The Errors tab entry, when a project enables a plugin that is not here. */
  readonly error?: ErrorsTabEntry;
}

/** "Claude Code fetches a plugin with an external source only when one of these sources sets it to `true`." */
const FETCHES: { readonly [S in EnableSource]: (gitTracked: boolean | undefined) => boolean } = {
  user: () => true,
  flag: () => true,
  managed: () => true,
  local: (gitTracked) => gitTracked === false,
  project: () => false,
  addDir: () => false,
};

const NOTHING: EnabledFetchDecision = { fetch: false, inPlace: false };

/**
 * What Claude Code does with an enabled plugin that has no install record on this machine. A
 * relative-path plugin "needs no install record because it loads from the marketplace itself", and
 * a plugin a seed directory holds is there; otherwise an external source is fetched only when user
 * settings, an untracked `.claude/settings.local.json`, `--settings` or managed settings set it to
 * `true`. When only the project's `.claude/settings.json` does, nothing is fetched and the Errors
 * tab says so. Judgment (spec/judgments.md): a `true` from `--add-dir` alone neither fetches nor
 * reports, since the docs name it in neither list.
 */
export function decideEnabledFetch(facts: EnabledFacts): EnabledFetchDecision {
  if (facts.installed || facts.seeded || facts.trueIn.length === 0) return NOTHING;
  if (facts.relativePath) return { fetch: false, inPlace: true };
  if (facts.trueIn.some((one) => FETCHES[one.source](one.gitTracked))) {
    return { fetch: true, inPlace: false };
  }
  return facts.trueIn.some((one) => ISSUES_ERROR[one.source])
    ? { ...NOTHING, error: enabledNotInstalled(facts.name, facts.marketplace) }
    : NOTHING;
}

/** Only the project's own file makes the "isn't installed here" entry. */
const ISSUES_ERROR: { readonly [S in EnableSource]: boolean } = {
  project: true,
  user: false,
  local: false,
  flag: false,
  managed: false,
  addDir: false,
};
