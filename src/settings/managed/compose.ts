import type { PluginIssue } from '../../format/issues.ts';
import type { Settings } from '../../protocol/official.ts';
import type { PolicyLayer } from '../layers.ts';
import {
  CONTROL_KEYS,
  SOURCE_TRAITS,
  unreadableVerdict,
  verdictIssue,
  type AdminDocument,
  type ManagedSource,
} from './admin-source.ts';
import { combineSources } from './combine.ts';
import { notInForce, withCrossSourceKeys, type InForceNote } from './cross-source.ts';
import { loginKeysOf, managedLayer, withoutLoginKeys } from './login-keys.ts';
import { readPolicyHelper, type PolicyHelper } from './policy-helper.ts';

/**
 * Which managed sources apply and the managed tier they make (managed-settings.md, "How Claude Code
 * combines managed sources", "Keys read from every admin source", "Compose every managed source";
 * settings-reference.md, `managedSourcesBehavior`). Pure over the documents the host read.
 */
export type ManagedBehavior = NonNullable<Settings['managedSourcesBehavior']>;
export const MANAGED_BEHAVIORS: readonly ManagedBehavior[] = ['first-wins', 'merge'];

export interface ComposeOptions {
  /**
   * The host passed parent settings that carry a restrictive key. HKCU "applies only when no admin
   * document is present above it and no host-supplied parent settings supply a restrictive key".
   */
  readonly parentRestrictive?: boolean;
}

/** What the policy helper does on this machine. */
export interface HelperPlan {
  /** The helper the highest source that carries a policy key names; absent when none, or its value is invalid. */
  readonly helper?: PolicyHelper;
  /** The helper runs at launch: its source is an MDM policy or a managed file. */
  readonly runsAtLaunch: boolean;
  /** Server-managed settings are the policy, so the helper waits for a fetch that reports them removed. */
  readonly shadowedByRemote: boolean;
}

export interface ManagedComposition {
  /** The managed tier: the layer to give the policy view. */
  readonly layer: PolicyLayer;
  readonly behavior: ManagedBehavior;
  /** The sources applied, highest first. */
  readonly used: readonly ManagedSource[];
  /** Sources found and not applied. */
  readonly skipped: readonly ManagedSource[];
  /** `/status` `Setting sources`: `Enterprise managed settings (file)`; absent when no source delivers a policy. */
  readonly settingSources: string | undefined;
  /** `/status` `Skipped sources`; absent when none was skipped. */
  readonly skippedSources: string | undefined;
  /** An administrator deploys managed settings here (`PolicyContext.hasManagedSettings`). */
  readonly hasManagedSettings: boolean;
  /** `parentSettingsBehavior` is `"merge"` in the highest-priority admin source (`PolicyContext.parentMerge`). */
  readonly parentMerge: boolean;
  readonly helper: HelperPlan;
  /** The repaired settings of every admin source that delivers a policy key, highest first. */
  readonly admins: readonly Settings[];
  /**
   * Some admin source sets `forceRemoteSettingsRefresh` to `true`. "The startup check runs before the
   * helper and reads any admin source", so a helper's output does not change it.
   */
  readonly forceRemoteRefresh: boolean;
  /** A lock or allowlist an admin source sets and another overrides. */
  readonly notInForce: readonly InForceNote[];
  readonly issues: readonly PluginIssue[];
  /** A present admin document cannot be parsed, or one cannot be read and no source supplies a policy: Claude Code exits. */
  readonly fatal: boolean;
}

const rankOf = (document: AdminDocument): number => SOURCE_TRAITS[document.source].rank;
const isAdmin = (document: AdminDocument): boolean => SOURCE_TRAITS[document.source].admin;
const isRemote = (document: AdminDocument): boolean => !SOURCE_TRAITS[document.source].onMachine;

/** The documents, highest source first; two of one rank keep the order they came in. */
const byRank = (documents: readonly AdminDocument[]): AdminDocument[] =>
  documents.toSorted((a, b) => rankOf(b) - rankOf(a));

/**
 * `managedSourcesBehavior` is read "from the highest-priority source that carries either this key
 * or a policy key"; a lower source cannot opt itself in. Anything but `"merge"` is the default.
 */
function behaviorOf(admins: readonly AdminDocument[]): ManagedBehavior {
  const carrier = admins.find(
    (document) =>
      document.delivers ||
      (document.raw.managedSourcesBehavior !== undefined &&
        document.raw.managedSourcesBehavior !== null),
  );
  return carrier?.raw.managedSourcesBehavior === 'merge' ? 'merge' : 'first-wins';
}

/** `modelOverrides` pairs with `availableModels`: a higher source that sets `availableModels` without it hides every source's. */
function pairedModelOverrides(used: readonly Settings[], settings: Settings): Settings {
  const overrides = used.findIndex((source) => source.modelOverrides !== undefined);
  const available = used.findIndex((source) => source.availableModels !== undefined);
  if (overrides < 0 || available < 0 || available >= overrides) return settings;
  return Object.fromEntries(Object.entries(settings).filter(([name]) => name !== 'modelOverrides'));
}

const withoutControlKeys = (settings: Settings): Settings =>
  Object.fromEntries(Object.entries(settings).filter(([name]) => !CONTROL_KEYS.includes(name)));

function policyOf(delivering: readonly AdminDocument[], behavior: ManagedBehavior): Settings {
  const merging = behavior === 'merge';
  const used = merging ? delivering : delivering.slice(0, 1);
  const settings = merging
    ? combineSources(used.map((document) => document.settings))
    : (used[0]?.settings ?? {});
  const crossed = withCrossSourceKeys(
    {
      admins: delivering.map((document) => document.settings),
      onMachine: delivering.map((document) => !isRemote(document)),
      merging,
    },
    settings,
  );
  const machine = delivering.find((document) => !isRemote(document));
  const remote = delivering.find(isRemote);
  const login = loginKeysOf(machine?.settings, remote?.settings);
  const paired = pairedModelOverrides(
    used.map((document) => document.settings),
    crossed,
  );
  return withoutControlKeys({ ...withoutLoginKeys(paired), ...login });
}

const labelOf = (document: AdminDocument): string =>
  document.shape ?? SOURCE_TRAITS[document.source].statusLabel;

/** `/status` when no source applies and "an embedding host supplied restrictive settings". */
const PARENT_PROCESS_LINE = 'Enterprise managed settings (parent process)';

/** `Enterprise managed settings (remote + file, merged)`. */
function settingSourcesLine(used: readonly AdminDocument[], merging: boolean): string | undefined {
  if (used.length === 0) return undefined;
  const merged = merging && used.length > 1 ? ', merged' : '';
  return `Enterprise managed settings (${used.map(labelOf).join(' + ')}${merged})`;
}

function helperPlanOf(delivering: readonly AdminDocument[]): {
  plan: HelperPlan;
  issues: PluginIssue[];
} {
  const top = delivering[0];
  const machineTop = delivering.find((document) => !isRemote(document));
  const value = machineTop?.settings.policyHelper;
  if (top === undefined || value === undefined)
    return { plan: { runsAtLaunch: false, shadowedByRemote: false }, issues: [] };
  const read = readPolicyHelper(value);
  if ('issue' in read)
    return { plan: { runsAtLaunch: false, shadowedByRemote: false }, issues: [read.issue] };
  const shadowedByRemote = isRemote(top);
  return {
    plan: { helper: read.helper, runsAtLaunch: !shadowedByRemote, shadowedByRemote },
    issues: [],
  };
}

/** An unreadable admin source with no policy to fall back on. */
function unreadableIssues(admins: readonly AdminDocument[]): {
  issues: PluginIssue[];
  exits: boolean;
} {
  const verdicts = admins.flatMap((document) =>
    document.unreadable === undefined || document.unreadableAt === undefined
      ? []
      : [
          unreadableVerdict(
            document.unreadable,
            document.unreadableAt.label,
            document.unreadableAt.reason,
          ),
        ],
  );
  return {
    issues: verdicts.map((verdict) => verdictIssue(verdict, 'managed:')),
    exits: verdicts.some((verdict) => verdict.exits),
  };
}

/** Which documents apply: the admin sources that deliver a policy, or the user-writable fallback. */
interface Selection {
  readonly admins: readonly AdminDocument[];
  readonly delivering: readonly AdminDocument[];
  readonly behavior: ManagedBehavior;
  /** Some admin document is present, so the HKCU registry is never applied beneath it. */
  readonly anyAdmin: boolean;
  /** The HKCU documents that deliver a policy key, applied or not. */
  readonly hkcu: readonly AdminDocument[];
  readonly used: readonly AdminDocument[];
}

function select(ranked: readonly AdminDocument[], options: ComposeOptions): Selection {
  const admins = ranked.filter((document) => isAdmin(document) && !document.broken);
  const delivering = admins.filter((document) => document.delivers);
  const behavior = behaviorOf(admins);
  const anyAdmin = ranked.some((document) => isAdmin(document) && document.present);
  const hkcu = ranked.filter((document) => !isAdmin(document) && document.delivers);
  const fallback = !anyAdmin && options.parentRestrictive !== true ? hkcu : [];
  const applied = behavior === 'merge' ? delivering : delivering.slice(0, 1);
  return {
    admins,
    delivering,
    behavior,
    anyAdmin,
    hkcu,
    used: delivering.length === 0 ? fallback : applied,
  };
}

/** The settings of the selection; an invalid `policyHelper` is a dropped entry, so the session starts on the rest. */
function settingsOf(selection: Selection, helperIssues: readonly PluginIssue[]): Settings {
  const chosen =
    selection.delivering.length > 0
      ? policyOf(selection.delivering, selection.behavior)
      : withoutControlKeys(selection.used[0]?.settings ?? {});
  return helperIssues.length === 0
    ? chosen
    : Object.fromEntries(Object.entries(chosen).filter(([name]) => name !== 'policyHelper'));
}

export function composeManaged(
  documents: readonly AdminDocument[],
  options: ComposeOptions = {},
): ManagedComposition {
  const ranked = byRank(documents);
  const selection = select(ranked, options);
  const { delivering, behavior, used } = selection;
  const helper = helperPlanOf(delivering);
  const settings = settingsOf(selection, helper.issues);
  const unreadable =
    delivering.length === 0 ? unreadableIssues(selection.admins) : { issues: [], exits: false };
  const skipped = [...delivering, ...selection.hkcu].filter((document) => !used.includes(document));
  const adminSettings = delivering.map((document) => document.settings);
  return {
    layer: managedLayer(
      settings,
      delivering.find((document) => !isRemote(document)),
    ),
    behavior,
    used: used.map((document) => document.source),
    skipped: skipped.map((document) => document.source),
    settingSources:
      settingSourcesLine(used, behavior === 'merge' && delivering.length > 0) ??
      (options.parentRestrictive === true ? PARENT_PROCESS_LINE : undefined),
    skippedSources: skipped.length === 0 ? undefined : skipped.map(labelOf).join(', '),
    hasManagedSettings: selection.anyAdmin,
    parentMerge: adminSettings[0]?.parentSettingsBehavior === 'merge',
    admins: adminSettings,
    forceRemoteRefresh: adminSettings.some((doc) => doc.forceRemoteSettingsRefresh === true),
    helper: helper.plan,
    notInForce: notInForce(adminSettings, settings),
    issues: [
      ...ranked.flatMap((document) => document.issues),
      ...helper.issues,
      ...unreadable.issues,
    ],
    fatal: ranked.some((document) => document.broken && isAdmin(document)) || unreadable.exits,
  };
}

/**
 * The managed tier after a policy helper emitted `managedSettings` (settings-reference.md, "Write
 * the helper output"): "that object becomes the only managed settings source for the run", the
 * cross-source keys read from it alone, and parent settings are never merged.
 */
export function withHelperSettings(
  composition: ManagedComposition,
  helperOutput: Settings,
): ManagedComposition {
  // `forceRemoteSettingsRefresh` "has its own startup rule" that runs before the helper and reads
  // the admin sources, so the helper's copy takes no part (`composition.forceRemoteRefresh`).
  const emitted: Settings = Object.fromEntries(
    Object.entries(helperOutput).filter(([name]) => name !== 'forceRemoteSettingsRefresh'),
  );
  const settings = withCrossSourceKeys(
    { admins: [emitted], onMachine: [true], merging: false },
    emitted,
  );
  return {
    ...composition,
    layer: { scope: 'managed', settings },
    used: [],
    skipped: [],
    settingSources: 'Enterprise managed settings (helper)',
    skippedSources: undefined,
    hasManagedSettings: true,
    parentMerge: false,
    admins: [emitted],
  };
}
