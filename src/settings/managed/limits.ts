/**
 * What managed settings cannot enforce, and how to check a policy that does not behave
 * (managed-settings.md "What a developer can change"; plugins/org.md "Plan for what managed settings
 * can't enforce" and "Troubleshoot policy"). Pure: each function answers from facts the host gives.
 * The docs give the facts; the keys and the returned shape are the kit's (spec/judgments.md).
 */

/** Who acts, as far as the managed settings are concerned. */
export interface ManagedActor {
  /** An administrator on the machine can edit the managed source itself. */
  readonly localAdmin?: boolean;
  /** The developer calls the API from a tool other than Claude Code. */
  readonly otherTool?: boolean;
  /** The edit is to the local copy of server-managed settings. */
  readonly editsServerCache?: boolean;
}

export interface ManagedBinding {
  readonly bound: boolean;
  /** Why not, or the remedy the docs name. */
  readonly note?: string;
}

/**
 * "Local admin rights": an administrator can edit the managed source, so MDM redeploys it; "The
 * server-managed cache": an edit "lasts only until the next successful fetch"; "Other tools":
 * "managed settings bind Claude Code only".
 */
export function managedBinding(actor: ManagedActor): ManagedBinding {
  if (actor.otherTool === true) {
    return {
      bound: false,
      note: "managed settings bind Claude Code only; a developer's other tools aren't under them",
    };
  }
  if (actor.editsServerCache === true) {
    return { bound: true, note: 'the edit lasts only until the next successful fetch' };
  }
  if (actor.localAdmin === true) {
    return { bound: false, note: 'redeploy the profile or file on a schedule with MDM tooling' };
  }
  return { bound: true };
}

/** The requests of security reviews that have no dedicated key. */
export const UNENFORCEABLE_REQUESTS = [
  'per-user-targeting',
  'entries-inside-allowed-marketplace',
  'hide-plugin-command',
  'gate-plugin-dir-through-allowlist',
  'enforce-claude-ai-toggles',
] as const;
export type UnenforceableRequest = (typeof UNENFORCEABLE_REQUESTS)[number];

/** The nearest existing controls per request ("These requests ... have no dedicated key"). */
export const NEAREST_CONTROLS: { readonly [R in UnenforceableRequest]: readonly string[] } = {
  'per-user-targeting': ['endpoint-managed settings', 'gateway policies'],
  'entries-inside-allowed-marketplace': ['enabledPlugins'],
  'hide-plugin-command': ['strictKnownMarketplaces', 'enabledPlugins', 'disableSideloadFlags'],
  'gate-plugin-dir-through-allowlist': ['disableSideloadFlags'],
  'enforce-claude-ai-toggles': ['synced plugins controls'],
};

/** The symptoms "Troubleshoot policy" lists. */
export const POLICY_SYMPTOMS = [
  'managed-file-not-parsed',
  'managed-source-not-loaded',
  'blocked-by-enterprise-policy',
  'disabled-plugin-still-loads',
] as const;
export type PolicySymptom = (typeof POLICY_SYMPTOMS)[number];

/** What to check first, per symptom. */
export const SYMPTOM_CHECKS: { readonly [S in PolicySymptom]: string } = {
  'managed-file-not-parsed':
    'managed-settings.json is not valid JSON: Claude Code refuses to start and prints an error naming the file; a file with one invalid entry keeps the rest of its policy',
  'managed-source-not-loaded':
    'run /status and look for `Enterprise managed settings` in the `Setting sources` line; if it is missing, the source did not load',
  'blocked-by-enterprise-policy':
    'the message names the marketplace or its source and, for an allowlist, lists the allowed sources',
  'disabled-plugin-still-loads':
    'another settings source re-enabled it, such as a managed `enabledPlugins` entry; /plugin and `claude plugin list` show `Disabled in ~/.claude/settings.json but still loads` with that source',
};

/** Whether the `Setting sources` line of `/status` lists the managed source ("If it's missing, the source didn't load"). */
export const managedSourceLoaded = (settingSourcesLine: string): boolean =>
  settingSourcesLine.includes('Enterprise managed settings');

/** Where the cause of a skipped skills-directory plugin lies (plugins/loading.md, "Skills-directory plugins blocked by managed settings"). */
export type SkillsDirCause = 'ask-administrator' | 'check-repository-plugin-causes';

/** "Run `/status` ... If the `Setting sources` line lists `Enterprise managed settings`, ask your administrator." */
export const skillsDirCause = (settingSourcesLine: string): SkillsDirCause =>
  managedSourceLoaded(settingSourcesLine) ? 'ask-administrator' : 'check-repository-plugin-causes';

export interface WholePluginFacts {
  /** The folder is in a marketplace the organization allows and installed from there. */
  readonly allowedMarketplaceAvailable: boolean;
  /** The administrator turned off the `--plugin-dir` flag (`disableSideloadFlags`). */
  readonly sideloadFlagsDisabled: boolean;
}

/** "Load the whole plugin": through an allowed marketplace, or for one session with `--plugin-dir` "unless your administrator has also turned off that flag". */
export function wholePluginRoutes(
  facts: WholePluginFacts,
): readonly ('marketplace' | 'plugin-dir')[] {
  return [
    ...(facts.allowedMarketplaceAvailable ? (['marketplace'] as const) : []),
    ...(facts.sideloadFlagsDisabled ? [] : (['plugin-dir'] as const)),
  ];
}

/** An entry of a delivered payload after validation. */
export interface PayloadEntry {
  readonly key: string;
  readonly valid: boolean;
  /** The key fails closed: an invalid value falls back to a stricter one. */
  readonly fallsBackStricter?: boolean;
}

export interface PayloadOutcome {
  readonly apply: boolean;
  /** The cache is replaced only when the payload is applied. */
  readonly updateCache: boolean;
  /** The failed-load cause shown by the startup notice, `/status` and `claude doctor`. */
  readonly failure?: string;
}

const RETENTION_KEYS = ['cleanupPeriodDays', 'desktopSessionCleanupPeriodDays'];

/**
 * "Claude Code applies nothing from a payload and leaves the cache unchanged when" every setting
 * fails validation, none falls back to a stricter value, and the payload holds a key other than the
 * two retention keys. Otherwise the valid entries apply.
 */
export function deliveredPayloadOutcome(entries: readonly PayloadEntry[]): PayloadOutcome {
  const allInvalid = entries.length > 0 && entries.every((entry) => !entry.valid);
  const noStricter = entries.every((entry) => entry.fallsBackStricter !== true);
  const hasOtherKey = entries.some((entry) => !RETENTION_KEYS.includes(entry.key));
  if (allInvalid && noStricter && hasOtherKey) {
    return {
      apply: false,
      updateCache: false,
      failure: 'no setting in the server response could be applied as written',
    };
  }
  return { apply: true, updateCache: true };
}

/** At startup on the cache: an invalid retention value "stays in the cached copy and is never applied". */
export const retentionValueApplies = (key: string, valid: boolean): boolean =>
  valid || !RETENTION_KEYS.includes(key);
