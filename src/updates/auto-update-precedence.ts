import { error, type PluginIssue } from '../format/issues.ts';
import { OFFICIAL_NAMES } from '../format/marketplace/index.ts';
import type { Environment } from '../ports/environment.ts';
import type { PolicyScope } from '../settings/layers.ts';
import { DISABLE_NONESSENTIAL_TRAFFIC, isOn, isSet } from './env-flags.ts';
import { isOfficialButOff } from '../format/marketplace/marketplace-name-lists.ts';

/**
 * Which marketplaces auto-update, and whether the pass runs at all (plugins/loading.md, "Which
 * marketplaces and plugins auto-update"; plugins/install.md, "Turn auto-update on or off for a
 * marketplace"; plugins/org.md, "Turn auto-update on or off per marketplace" and "Turn updates off
 * for the whole fleet"; plugins/host-marketplace.md, "Turn on auto-update"). Pure: the host reads
 * the files, the kit decides.
 */

export interface AutoUpdateFacts {
  readonly name: string;
  /** `autoUpdate` on the marketplace's `extraKnownMarketplaces` entry in the settings file that wins; unset is `undefined`. */
  readonly settingsEntry?: boolean;
  /** `autoUpdate` on its `known_marketplaces.json` entry, which the Enable auto-update toggle writes. */
  readonly recorded?: boolean;
  /** The marketplace was added from claude.ai. */
  readonly fromClaudeAi?: boolean;
  /** A seed directory supplies it: "forces `autoUpdate` off for seed marketplaces" (plugins/org.md). */
  readonly seeded?: boolean;
}

const isOfficialOn = (name: string): boolean =>
  OFFICIAL_NAMES.some((official) => official === name) && !isOfficialButOff(name);

/** Item 3: on for the official names and for claude.ai marketplaces, off for every other one. */
const defaultOn = (facts: AutoUpdateFacts): boolean =>
  facts.fromClaudeAi === true || isOfficialOn(facts.name);

/**
 * Whether the marketplace auto-updates: "the first of these that is set": the settings entry, the
 * `known_marketplaces.json` entry, the default. A seed marketplace is off before any of them
 * (judgment on the order, spec/judgments.md: the docs say the seed "forces" it off).
 */
export function marketplaceAutoUpdate(facts: AutoUpdateFacts): boolean {
  if (facts.seeded === true) return false;
  return facts.settingsEntry ?? facts.recorded ?? defaultOn(facts);
}

/** The variables that turn the whole pass off ("the whole pass is off and the toggle is hidden"). */
const PASS_OFF_BY: readonly string[] = ['DISABLE_UPDATES', 'DISABLE_AUTOUPDATER'];

/**
 * Whether the pass runs, and the Enable auto-update toggle shows: `DISABLE_UPDATES=1`,
 * `DISABLE_AUTOUPDATER=1` or any non-empty `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` turns both
 * off "unless you also set `FORCE_AUTOUPDATE_PLUGINS=1`".
 */
export function autoUpdatePassAllowed(env: Environment): boolean {
  if (isOn(env, 'FORCE_AUTOUPDATE_PLUGINS')) return true;
  const off =
    PASS_OFF_BY.some((name) => isOn(env, name)) || isSet(env, DISABLE_NONESSENTIAL_TRAFFIC);
  return !off;
}

/** The labels of the toggle, by whether the marketplace auto-updates now. */
const TOGGLE_LABELS: { readonly [On in 'on' | 'off']: string } = {
  on: 'Disable auto-update',
  off: 'Enable auto-update',
};

/** What the Marketplaces tab labels the toggle: "Enable auto-update" when it is off, "Disable auto-update" when it is on. */
export const toggleLabel = (facts: AutoUpdateFacts): string =>
  TOGGLE_LABELS[marketplaceAutoUpdate(facts) ? 'on' : 'off'];

/** The settings file that declares the marketplace under `extraKnownMarketplaces`, as the registry plans it. */
export interface Declaration {
  readonly scope: PolicyScope;
  readonly autoUpdate?: boolean;
}

export interface ToggleRequest {
  readonly name: string;
  /** What the user chose: Enable (true) or Disable (false). */
  readonly enable: boolean;
  readonly env: Environment;
  readonly declared?: Declaration;
}

export type ToggleWrite =
  | { readonly file: 'known_marketplaces.json' }
  | { readonly file: 'settings'; readonly scope: PolicyScope };

export type ToggleDecision =
  | { readonly outcome: 'hidden' }
  | { readonly outcome: 'refused'; readonly issue: PluginIssue }
  | {
      readonly outcome: 'write';
      readonly autoUpdate: boolean;
      readonly writes: readonly ToggleWrite[];
    };

/** The files a user can edit: user, project and local settings. A managed, `--settings` or `--add-dir` file is not written. */
const USER_WRITABLE: { readonly [S in PolicyScope]: boolean } = {
  user: true,
  project: true,
  local: true,
  managed: false,
  parent: false,
  flag: false,
  addDir: false,
};

/** "Claude Code refuses the user's `/plugin` toggle with an error that starts `Auto-update for '<name>' is set by`." */
const refusal = (name: string): PluginIssue =>
  error(
    `extraKnownMarketplaces.${name}.autoUpdate`,
    `Auto-update for '${name}' is set by your organization's managed settings and cannot be changed here`,
  );

const writesFor = (declared: Declaration | undefined): readonly ToggleWrite[] => {
  const recorded: ToggleWrite = { file: 'known_marketplaces.json' };
  return declared !== undefined && USER_WRITABLE[declared.scope]
    ? [recorded, { file: 'settings', scope: declared.scope }]
    : [recorded];
};

/**
 * The Enable or Disable auto-update toggle: hidden when the pass is off; refused when a managed
 * entry sets the field; otherwise it writes `known_marketplaces.json`, and the settings entry too
 * "when a settings file also declares the marketplace under `extraKnownMarketplaces`" (only a file
 * the user can write, judgment). A managed entry that leaves the field unset keeps the user toggle.
 */
export function toggleDecision(request: ToggleRequest): ToggleDecision {
  if (!autoUpdatePassAllowed(request.env)) return { outcome: 'hidden' };
  const { declared } = request;
  if (declared?.scope === 'managed' && declared.autoUpdate !== undefined) {
    return { outcome: 'refused', issue: refusal(request.name) };
  }
  return { outcome: 'write', autoUpdate: request.enable, writes: writesFor(declared) };
}
