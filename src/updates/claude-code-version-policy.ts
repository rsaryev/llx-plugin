import { compareVersions, normalizedVersion } from '../marketplace/semver.ts';
import { orderedLayers, type PolicyLayer, type PolicyScope } from '../settings/layers.ts';

/**
 * The version policy of Claude Code itself (settings-reference.md, "Updates and versioning":
 * `autoUpdatesChannel`, `minimumVersion`, `requiredMinimumVersion`, `requiredMaximumVersion`;
 * setup.md, "Configure release channel" and "Pin a minimum version"). Pure over the settings layers
 * and the versions the host knows: the kit decides what an update may install and whether a start is
 * refused; the host installs and exits.
 *
 * The four keys are read here, not through `settings/key-spec.ts`: that table is closed over the
 * plugin, hook, skill, workflow and channel keys the settings requirements name, and its tests count
 * them (spec/judgments.md).
 */

export const CHANNELS = ['latest', 'stable'] as const;
export type Channel = (typeof CHANNELS)[number];

export interface VersionPolicy {
  /** `autoUpdatesChannel`; unset (or a value the docs do not list) follows `latest`. */
  readonly channel: Channel;
  /** The highest valid `minimumVersion` of the files, normalized. */
  readonly minimumVersion?: string;
  /** Managed settings only. */
  readonly requiredMinimumVersion?: string;
  /** Managed settings only. */
  readonly requiredMaximumVersion?: string;
}

const isChannel = (value: unknown): value is Channel => CHANNELS.some((one) => one === value);

/** "a value that isn't a valid version is ignored". */
const validVersion = (value: unknown): string | undefined =>
  typeof value === 'string' ? normalizedVersion(value) : undefined;

/** The **Scope** line of the two required keys: "Managed. Claude Code gives no warning when it ignores the key elsewhere." */
const MANAGED_ONLY: { readonly [S in PolicyScope]: boolean } = {
  managed: true,
  parent: false,
  flag: false,
  local: false,
  project: false,
  user: false,
  addDir: false,
};

const managedVersion = (
  layers: readonly PolicyLayer[],
  read: (layer: PolicyLayer) => unknown,
): string | undefined =>
  layers.flatMap((layer) => {
    const version = MANAGED_ONLY[layer.scope] ? validVersion(read(layer)) : undefined;
    return version === undefined ? [] : [version];
  })[0];

/** The higher of two versions. */
const higher = (a: string, b: string): string => ((compareVersions(a, b) ?? 0) >= 0 ? a : b);

/**
 * Judgments (spec/judgments.md): the channel is the highest-precedence valid one; the minimum is the
 * highest valid `minimumVersion` of the files, so a managed floor "user and project settings can't
 * lower" holds while a user may raise it.
 */
export function readVersionPolicy(layers: readonly PolicyLayer[]): VersionPolicy {
  const ordered = orderedLayers(layers);
  const channel = ordered.map((layer) => layer.settings.autoUpdatesChannel).find(isChannel);
  const minimum = ordered
    .map((layer) => validVersion(layer.settings.minimumVersion))
    .filter((version) => version !== undefined)
    .reduce<string | undefined>(
      (best, one) => (best === undefined ? one : higher(best, one)),
      undefined,
    );
  const requiredMinimumVersion = managedVersion(
    ordered,
    (layer) => layer.settings.requiredMinimumVersion,
  );
  const requiredMaximumVersion = managedVersion(
    ordered,
    (layer) => layer.settings.requiredMaximumVersion,
  );
  return {
    channel: channel ?? 'latest',
    ...(minimum === undefined ? {} : { minimumVersion: minimum }),
    ...(requiredMinimumVersion === undefined ? {} : { requiredMinimumVersion }),
    ...(requiredMaximumVersion === undefined ? {} : { requiredMaximumVersion }),
  };
}

/** What the host knows of the releases: the installed version and what each channel serves. */
export interface KnownVersions {
  readonly installed: string;
  readonly latest: string;
  readonly stable: string;
}

export type SkipReason =
  | 'channel-version-unknown'
  | 'already-current'
  | 'above-required-maximum'
  | 'below-required-minimum'
  | 'below-minimum-version';

export type UpdatePick =
  | {
      readonly outcome: 'install';
      readonly version: string;
      readonly from: Channel;
      /** The channel's version is older than the installed one (moving to `stable` from a newer `latest`). */
      readonly downgrade: boolean;
    }
  | { readonly outcome: 'skip'; readonly reason: SkipReason };

type Limit = (policy: VersionPolicy) => {
  readonly bound: string | undefined;
  readonly breaks: (order: number) => boolean;
};

/** The limits an update respects, in the order they are reported. */
const LIMITS: readonly { readonly reason: SkipReason; readonly limit: Limit }[] = [
  {
    reason: 'above-required-maximum',
    limit: (policy) => ({ bound: policy.requiredMaximumVersion, breaks: (order) => order > 0 }),
  },
  {
    // Judgment: a version below the floor would not start, so an update skips it too.
    reason: 'below-required-minimum',
    limit: (policy) => ({ bound: policy.requiredMinimumVersion, breaks: (order) => order < 0 }),
  },
  {
    reason: 'below-minimum-version',
    limit: (policy) => ({ bound: policy.minimumVersion, breaks: (order) => order < 0 }),
  },
];

const violated = (policy: VersionPolicy, candidate: string): SkipReason | undefined =>
  LIMITS.find(({ limit }) => {
    const { bound, breaks } = limit(policy);
    const order = bound === undefined ? undefined : compareVersions(candidate, bound);
    return order !== undefined && breaks(order);
  })?.reason;

const SERVED_BY: { readonly [C in Channel]: (versions: KnownVersions) => string } = {
  latest: (versions) => versions.latest,
  stable: (versions) => versions.stable,
};

/**
 * What a background auto-update or `claude update` installs: the channel's version, unless it is
 * already installed or the policy rules it out. Nothing else is offered, so a refused version leaves
 * the installation where it is ("skip versions above the ceiling, so an installation inside the
 * range stays inside it").
 */
export function pickAllowedVersion(policy: VersionPolicy, versions: KnownVersions): UpdatePick {
  const candidate = normalizedVersion(SERVED_BY[policy.channel](versions));
  const installed = normalizedVersion(versions.installed);
  if (candidate === undefined) return { outcome: 'skip', reason: 'channel-version-unknown' };
  const order = installed === undefined ? 1 : (compareVersions(candidate, installed) ?? 1);
  if (order === 0) return { outcome: 'skip', reason: 'already-current' };
  const reason = violated(policy, candidate);
  if (reason !== undefined) return { outcome: 'skip', reason };
  return { outcome: 'install', version: candidate, from: policy.channel, downgrade: order < 0 };
}

/** The commands the required range does and does not stop: everything else is a start. */
export const CLAUDE_COMMANDS = ['start', 'update', 'install', 'doctor'] as const;
export type ClaudeCommand = (typeof CLAUDE_COMMANDS)[number];

/** "`claude update`, `claude install`, and `claude doctor` keep working" outside the range "so users can recover". */
const KEEPS_WORKING: { readonly [C in ClaudeCommand]: boolean } = {
  start: false,
  update: true,
  install: true,
  doctor: true,
};

export type StartVerdict =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly reason: 'below-required-minimum' | 'above-required-maximum';
      readonly message: string;
    };

/** Wording is a judgment (spec/judgments.md): the docs say what the user is told, not the sentence. */
const BELOW =
  "This Claude Code version is older than your organization allows. Update through your organization's approved method.";
const ABOVE =
  "This Claude Code version is newer than your organization allows. Install an approved version through your organization's approved method; `claude install <version>` may also work.";

export interface StartRequest {
  readonly command: ClaudeCommand;
  /** The running version. */
  readonly current: string;
}

/**
 * "When the running version is older [newer], Claude Code exits at startup". The check is made once,
 * when Claude Code starts: a session already running continues, so a host calls this at launch only.
 */
export function startGate(policy: VersionPolicy, request: StartRequest): StartVerdict {
  if (KEEPS_WORKING[request.command]) return { allowed: true };
  const { requiredMinimumVersion: floor, requiredMaximumVersion: ceiling } = policy;
  if (floor !== undefined && (compareVersions(request.current, floor) ?? 0) < 0) {
    return { allowed: false, reason: 'below-required-minimum', message: BELOW };
  }
  if (ceiling !== undefined && (compareVersions(request.current, ceiling) ?? 0) > 0) {
    return { allowed: false, reason: 'above-required-maximum', message: ABOVE };
  }
  return { allowed: true };
}

/** The `/config` choice when moving from `latest` to `stable`: allow the downgrade, or stay on the current version. */
export type DowngradeAnswer = 'downgrade' | 'stay';

export interface ChannelSwitch {
  readonly to: Channel;
  readonly currentVersion: string;
  /** Needed to leave `latest` for `stable`; without it the switch asks. */
  readonly answer?: DowngradeAnswer;
}

export type SwitchPlan =
  | { readonly ask: 'downgrade-or-stay' }
  | {
      readonly set: { readonly autoUpdatesChannel?: 'stable'; readonly minimumVersion?: string };
      readonly remove: readonly ('autoUpdatesChannel' | 'minimumVersion')[];
    };

const TO_STABLE: { readonly [A in DowngradeAnswer]: (current: string) => SwitchPlan } = {
  downgrade: () => ({ set: { autoUpdatesChannel: 'stable' }, remove: [] }),
  stay: (current) => ({
    set: { autoUpdatesChannel: 'stable', minimumVersion: current },
    remove: [],
  }),
};

const SWITCH: { readonly [C in Channel]: (request: ChannelSwitch) => SwitchPlan } = {
  stable: (request) =>
    request.answer === undefined
      ? { ask: 'downgrade-or-stay' }
      : TO_STABLE[request.answer](request.currentVersion),
  latest: () => ({ set: {}, remove: ['autoUpdatesChannel', 'minimumVersion'] }),
};

/**
 * What the user settings change when the channel is picked under **Auto-update channel** in
 * `/config`: "stable" is written (asking first about the downgrade, and staying sets
 * `minimumVersion`); switching back to latest removes the key and clears `minimumVersion`.
 */
export const channelSwitch = (request: ChannelSwitch): SwitchPlan => SWITCH[request.to](request);
