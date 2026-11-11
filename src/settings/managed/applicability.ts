import { editEffect, type Applies, type Arrival } from '../general/edit-effect.ts';
import type { Mechanism } from './delivery.ts';
import type { HelperPlan } from './compose.ts';

/**
 * Where and when a deployed policy applies (managed-settings.md, "Where and when a policy applies"):
 * which surfaces and places read which sources, what reaches a running session, and what waits for
 * the developer. Pure decisions over facts the host copies in.
 */
export const POLICY_SURFACES = [
  'terminal',
  'vscode',
  'jetbrains',
  'desktopCodeTab',
  'agentSdk',
] as const;
export type PolicySurface = (typeof POLICY_SURFACES)[number];

/** The settings files an Agent SDK app chooses among with `settingSources`. */
export const SDK_SETTING_SOURCES = ['user', 'project', 'local'] as const;
export type SdkSettingSource = (typeof SDK_SETTING_SOURCES)[number];

export interface LoadedSources {
  readonly managed: boolean;
  readonly files: readonly SdkSettingSource[];
}

/**
 * What a surface loads. "On the developer's machine, the terminal, the VS Code and JetBrains
 * extensions, the desktop app's Code tab, and Agent SDK sessions read all of these sources. Agent
 * SDK sessions load managed settings even when `settingSources` excludes the user, project, and
 * local files."
 */
const SURFACE_LOADS: {
  readonly [S in PolicySurface]: (
    settingSources: readonly SdkSettingSource[] | undefined,
  ) => LoadedSources;
} = {
  terminal: () => ({ managed: true, files: SDK_SETTING_SOURCES }),
  vscode: () => ({ managed: true, files: SDK_SETTING_SOURCES }),
  jetbrains: () => ({ managed: true, files: SDK_SETTING_SOURCES }),
  desktopCodeTab: () => ({ managed: true, files: SDK_SETTING_SOURCES }),
  agentSdk: (settingSources) => ({ managed: true, files: settingSources ?? SDK_SETTING_SOURCES }),
};

export const sourcesLoadedBy = (
  surface: PolicySurface,
  settingSources?: readonly SdkSettingSource[],
): LoadedSources => SURFACE_LOADS[surface](settingSources);

export const PLACES = [
  'machine',
  'cloudHosted',
  'cloudSelfHosted',
  'tagHosted',
  'tagSelfHosted',
  'coworkOnMachine',
  'coworkFullVm',
  'coworkRemote',
] as const;
export type Place = (typeof PLACES)[number];

/** How much of the managed settings file a place applies. */
export const FILE_USES = ['all', 'crossSourceKeys', 'none'] as const;
export type FileUse = (typeof FILE_USES)[number];

export interface PlaceFacts {
  /** Server-managed settings deliver at least one policy key to this session. */
  readonly serverDeliversPolicyKey: boolean;
  /** `managedSourcesBehavior` is `"merge"`. */
  readonly merging: boolean;
}

export interface PlaceReach {
  /** The session fetches server-managed settings. */
  readonly remote: boolean;
  /** The session reads the device's MDM profile. */
  readonly mdm: boolean;
  readonly file: FileUse;
}

const NOTHING: PlaceReach = { remote: false, mdm: false, file: 'none' };

/**
 * A self-hosted environment reads the managed settings file in its runner image, "by default only
 * when server-managed settings deliver no policy key, apart from the keys Claude Code reads from
 * every admin source"; the `"merge"` opt-in applies both.
 */
const selfHostedFile = (facts: PlaceFacts): FileUse =>
  facts.serverDeliversPolicyKey && !facts.merging ? 'crossSourceKeys' : 'all';

/**
 * The sources each place reads. Cloud sessions in an Anthropic-hosted environment read neither
 * device policy; Claude Tag sessions receive no server-managed settings; Cowork never fetches
 * them, and reads the device's policy only when it runs on the user's machine.
 */
const PLACE_REACH: { readonly [P in Place]: (facts: PlaceFacts) => PlaceReach } = {
  machine: () => ({ remote: true, mdm: true, file: 'all' }),
  cloudHosted: () => ({ remote: true, mdm: false, file: 'none' }),
  cloudSelfHosted: (facts) => ({ remote: true, mdm: false, file: selfHostedFile(facts) }),
  tagHosted: () => NOTHING,
  tagSelfHosted: () => ({ remote: false, mdm: false, file: 'all' }),
  coworkOnMachine: () => ({ remote: false, mdm: true, file: 'all' }),
  coworkFullVm: () => NOTHING,
  coworkRemote: () => NOTHING,
};

export const reachOfPlace = (place: Place, facts: PlaceFacts): PlaceReach =>
  PLACE_REACH[place](facts);

/**
 * Wherever a Cowork session runs, "claude.ai applies the admin console's `strictKnownMarketplaces`
 * and `blockedMarketplaces` lists itself" when someone adds a marketplace from a git repository on
 * claude.ai or from Customize.
 */
const CLAUDE_AI_APPLIES_LISTS: { readonly [P in Place]: boolean } = {
  machine: false,
  cloudHosted: false,
  cloudSelfHosted: false,
  tagHosted: false,
  tagSelfHosted: false,
  coworkOnMachine: true,
  coworkFullVm: true,
  coworkRemote: true,
};

export const claudeAiAppliesMarketplaceLists = (place: Place): boolean =>
  CLAUDE_AI_APPLIES_LISTS[place];

export interface FetchFacts {
  /** The session authenticates to Anthropic's API directly with an eligible credential. */
  readonly eligibleCredential: boolean;
  /** The provider is Anthropic's API, not Bedrock, Vertex, Foundry or another. */
  readonly anthropicProvider: boolean;
  /** `ANTHROPIC_BASE_URL` points somewhere other than Anthropic's API. */
  readonly baseUrlElsewhere: boolean;
  /** The developer signed in to a gateway with `/login`. */
  readonly gatewayLogin: boolean;
  /** Claude Desktop's Code tab runs behind a gateway that serves that session settings. */
  readonly desktopGatewaySession: boolean;
}

/**
 * Whether remote settings, the top-ranked managed source, are fetched at all (managed-settings.md,
 * "How Claude Code combines managed sources", rank 1): "only when the session authenticates to
 * Anthropic's API directly with an eligible credential, signs in to a gateway with `/login`, or runs
 * in Claude Desktop's Code tab behind a gateway that serves that session settings. On other
 * providers, or when `ANTHROPIC_BASE_URL` points somewhere other than Anthropic's API, it starts at
 * the next source."
 */
export const fetchesRemoteSettings = (facts: FetchFacts): boolean =>
  facts.gatewayLogin ||
  facts.desktopGatewaySession ||
  (facts.eligibleCredential && facts.anthropicProvider && !facts.baseUrlElsewhere);

const ARRIVALS: { readonly [M in Mechanism]: Arrival } = {
  serverManaged: 'server-managed',
  mdm: 'mdm',
  file: 'file',
  hkcu: 'mdm',
};

/**
 * When a change to `key` reaches a running session: "most changes reach a running session on the
 * schedule in the delivery mechanism table, without a restart"; `forceRemoteSettingsRefresh`,
 * `requiredMinimumVersion` and the keys read once "take effect at the next session start".
 */
export const reachesRunningSession = (mechanism: Mechanism, key?: string): Applies =>
  editEffect({
    scope: 'managed',
    arrival: ARRIVALS[mechanism],
    ...(key === undefined ? {} : { key }),
  }).applies;

/**
 * Whether the policy helper runs now: a new or changed one "takes effect at the next launch", and one
 * server-managed settings shadow at launch "runs as soon as a fetch reports those settings removed".
 */
export function helperRunsNow(
  plan: HelperPlan,
  fetch: { readonly remoteStillDelivers: boolean },
): boolean {
  if (plan.helper === undefined) return false;
  return plan.runsAtLaunch || (plan.shadowedByRemote && !fetch.remoteStillDelivers);
}

export interface ServerChange {
  /** The change sets something "that needs approval", such as a hook or an `env` variable. */
  readonly needsApproval: boolean;
  /** One of "the updates that wait for the next launch". */
  readonly waitsForNextLaunch: boolean;
  /** An IDE extension or the Agent SDK hosts the session, so no dialog can be shown to the developer. */
  readonly hosted: boolean;
}

export const SERVER_CHANGE_TIMINGS = [
  'next-launch',
  'awaits-approval',
  'applies-for-current-run',
  'next-poll',
] as const;
export type ServerChangeTiming = (typeof SERVER_CHANGE_TIMINGS)[number];

/**
 * When a server-managed change applies. "Apart from the updates that wait for the next launch, a
 * server-managed change to a setting that needs approval waits for the developer to accept the
 * dialog in an interactive session, and applies for the current run in a session an IDE extension or
 * the Agent SDK hosts. Other server-managed changes apply on the next poll."
 */
export function serverChangeTiming(change: ServerChange): ServerChangeTiming {
  if (change.waitsForNextLaunch) return 'next-launch';
  if (!change.needsApproval) return 'next-poll';
  return change.hosted ? 'applies-for-current-run' : 'awaits-approval';
}

export interface MinimumVersionFacts {
  /** The binary is older than `requiredMinimumVersion`. */
  readonly outdated: boolean;
  /** The session is already running. */
  readonly running: boolean;
}

/** "`requiredMinimumVersion` blocks an outdated binary from starting and doesn't end a session that's already running." */
export const minimumVersionEffect = (
  facts: MinimumVersionFacts,
): { blocksStart: boolean; endsSession: boolean } => ({
  blocksStart: facts.outdated && !facts.running,
  endsSession: false,
});

export interface StartupFetchFacts {
  readonly forceRemoteSettingsRefresh: boolean;
  /** The session fetches server-managed settings at all. */
  readonly fetchesRemote: boolean;
  /** The developer signs in at startup (first run, after `/logout`). */
  readonly signsInAtStartup: boolean;
  /** Anthropic requires the organization's settings before a session starts. */
  readonly anthropicRequires: boolean;
  /** A Cloud gateway session. */
  readonly gatewaySession: boolean;
  /** A `claude auth` subcommand. */
  readonly authSubcommand: boolean;
}

export interface StartupFetch {
  readonly blocksStartup: boolean;
  /** The session exits when the fetch fails. */
  readonly exitsOnFailure: boolean;
  /** Seconds startup waits for the fetch before it opens the session. */
  readonly waitsUpToSeconds?: number;
}

const SIGN_IN_WAIT_SECONDS = 5;
const OPEN: StartupFetch = { blocksStartup: false, exitsOnFailure: false };
const BLOCKING: StartupFetch = { blocksStartup: true, exitsOnFailure: true };

/**
 * What startup does about the fetch (settings-reference.md, `forceRemoteSettingsRefresh`):
 * `true` blocks until a fresh fetch and exits on failure; unset does not block, though a sign-in
 * startup waits up to five seconds; "Anthropic can require the settings", which blocks a start
 * without them; a Cloud gateway session waits and exits when the gateway cannot be reached. The
 * `claude auth` subcommands are exempt, and a session that does not fetch starts without waiting.
 */
export function startupFetchOf(facts: StartupFetchFacts): StartupFetch {
  if (facts.authSubcommand || !facts.fetchesRemote) return OPEN;
  if (facts.forceRemoteSettingsRefresh || facts.gatewaySession || facts.anthropicRequires)
    return BLOCKING;
  return facts.signsInAtStartup ? { ...OPEN, waitsUpToSeconds: SIGN_IN_WAIT_SECONDS } : OPEN;
}
