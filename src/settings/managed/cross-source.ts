import type { Settings } from '../../protocol/official.ts';
import { EFFORT_LEVELS } from '../../protocol/effort.ts';
import { MERGES } from '../merge.ts';
import { isRecord } from '../record.ts';
import { combineKey } from './combine.ts';
import { valueAt, withValueAt } from './paths.ts';

/**
 * The keys Claude Code reads from every admin source, under both settings of `managedSourcesBehavior`
 * (managed-settings.md, "Keys read from every admin source"): "a lower-ranked MDM policy or managed
 * settings file can still set them when the selected source doesn't". The user-writable HKCU
 * registry is left out of the scan; the caller passes the admin sources only, highest first.
 */
export interface CrossSourceInput {
  /** The repaired settings of every admin source that delivers a policy key, highest first. */
  readonly admins: readonly Settings[];
  /** Whether each of those is a machine source (an MDM policy or a managed file), not server-managed settings. */
  readonly onMachine: readonly boolean[];
  /** `"merge"`: the machine's lists combine by the table rather than the highest alone. */
  readonly merging: boolean;
}

type Rule = (input: CrossSourceInput, result: Settings) => Settings;

const setIn = (result: Settings, path: string, value: unknown): Settings =>
  value === undefined ? result : withValueAt(result, path, value);

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry) => typeof entry === 'string') : [];

const union = (lists: readonly (readonly string[])[]): string[] => [...new Set(lists.flat())];

const firstSetIn = (admins: readonly Settings[], path: string): unknown =>
  admins.map((doc) => valueAt(doc, path)).find((value) => value !== undefined);

/** "A `true` in any admin source turns the lock on." */
const anyTrue =
  (paths: readonly string[]): Rule =>
  (input, result) =>
    paths.reduce(
      (current, path) =>
        input.admins.some((doc) => valueAt(doc, path) === true)
          ? setIn(current, path, true)
          : current,
      result,
    );

/** "A `false` from any admin source turns the behavior off. Each key can only deny." */
const anyFalse =
  (paths: readonly string[]): Rule =>
  (input, result) =>
    paths.reduce(
      (current, path) =>
        input.admins.some((doc) => valueAt(doc, path) === false)
          ? setIn(current, path, false)
          : current,
      result,
    );

/** A key read from the highest admin source that sets it, whether or not the selected source does. */
const fromHighestAdmin =
  (paths: readonly string[]): Rule =>
  (input, result) =>
    paths.reduce((current, path) => setIn(current, path, firstSetIn(input.admins, path)), result);

/** "An entry in any admin source applies": the lists of every source, together (entries may be objects). */
const unionOfAdmins =
  (path: string): Rule =>
  (input, result) => {
    const lists = input.admins
      .map((doc) => valueAt(doc, path))
      .filter((value) => Array.isArray(value));
    const entries = MERGES.unionArrays.combine(lists);
    return entries.length === 0 ? result : setIn(result, path, entries);
  };

const isOn = (settings: Settings, path: string): boolean => valueAt(settings, path) === true;

/** While `lock` is on, `path` is the union over every admin source; `extra` adds entries of another key. */
function lockedAllowlist(lock: string, path: string): Rule {
  return (input, result) => {
    if (!isOn(result, lock)) return result;
    return setIn(result, path, union(input.admins.map((doc) => strings(valueAt(doc, path)))));
  };
}

const WEBFETCH_DOMAIN = 'WebFetch(domain:';

/** `WebFetch(domain:...)` allow rules count in the allowlist that `allowManagedDomainsOnly` locks. */
const lockedWebFetchRules: Rule = (input, result) => {
  if (!isOn(result, 'sandbox.network.allowManagedDomainsOnly')) return result;
  const fetchRules = input.admins.flatMap((doc) =>
    strings(valueAt(doc, 'permissions.allow')).filter((rule) => rule.startsWith(WEBFETCH_DOMAIN)),
  );
  const kept = strings(valueAt(result, 'permissions.allow'));
  return setIn(result, 'permissions.allow', union([kept, fetchRules]));
};

/**
 * While `allowManagedMcpServersOnly` is on, "the managed `allowedMcpServers` list comes from the
 * highest-ranked admin source that sets one. A server-managed list replaces a lower source's list
 * rather than combining with it."
 */
const lockedMcpAllowlist: Rule = (input, result) =>
  isOn(result, 'allowManagedMcpServersOnly')
    ? setIn(result, 'allowedMcpServers', firstSetIn(input.admins, 'allowedMcpServers'))
    : result;

/** "The lowest cap in any admin source applies." */
const lowestEffortCap: Rule = (input, result) => {
  const caps = input.admins
    .map((doc) => EFFORT_LEVELS.findIndex((level) => level === doc.maxEffortLevel))
    .filter((index) => index >= 0);
  return caps.length === 0
    ? result
    : setIn(result, 'maxEffortLevel', EFFORT_LEVELS[Math.min(...caps)]);
};

/** A commit-trailer opt-out: `attribution: false`, an empty `attribution.commit`, or `includeCoAuthoredBy: false`. */
const optsOut = (doc: Settings): boolean =>
  doc.attribution === false ||
  (isRecord(doc.attribution) && doc.attribution.commit === '') ||
  (doc.includeCoAuthoredBy === false && doc.attribution === undefined);

const commitTrailerOptOut: Rule = (input, result) => {
  if (!input.admins.some(optsOut)) return result;
  const attribution = result.attribution;
  return setIn(
    result,
    'attribution',
    isRecord(attribution) ? { ...attribution, commit: '' } : false,
  );
};

/** `env`: "merged per variable across the admin sources". */
const mergedEnv: Rule = (input, result) => setIn(result, 'env', combineKey('env', input.admins));

/**
 * `allowedProviders`: "a list that the machine's own admin sources set keeps applying when
 * server-managed settings also deliver one: a session may then use only the providers on both
 * lists". The machine's list is the highest machine source's under `"first-wins"`, and the highest
 * machine source that sets one under `"merge"`.
 */
const allowedProviders: Rule = (input, result) => {
  const machine = input.admins.filter((_, index) => input.onMachine[index]);
  const machineList = input.merging
    ? firstSetIn(machine, 'allowedProviders')
    : machine[0]?.allowedProviders;
  const remote = input.admins.find((_, index) => !input.onMachine[index])?.allowedProviders;
  if (!Array.isArray(machineList)) return result;
  if (!Array.isArray(remote)) return setIn(result, 'allowedProviders', machineList);
  return setIn(
    result,
    'allowedProviders',
    machineList.filter((provider) => remote.includes(provider)),
  );
};

const CROSS_SOURCE_RULES: readonly Rule[] = [
  anyTrue([
    'sandbox.network.allowManagedDomainsOnly',
    'sandbox.filesystem.allowManagedReadPathsOnly',
    'sandbox.network.strictAllowlist',
    'allowManagedMcpServersOnly',
    'disableClaudeAiConnectors',
    'forceRemoteSettingsRefresh',
  ]),
  anyFalse([
    'useAutoModeDuringPlan',
    'syncClaudeAiSkills',
    'syncClaudeAiPlugins',
    'enableArtifact',
  ]),
  fromHighestAdmin([
    'allowAllClaudeAiMcps',
    'sandbox.bwrapPath',
    'sandbox.socatPath',
    'sandbox.ripgrep',
    'sandbox.filesystem.disabled',
  ]),
  unionOfAdmins('deniedMcpServers'),
  lockedAllowlist('sandbox.network.allowManagedDomainsOnly', 'sandbox.network.allowedDomains'),
  lockedWebFetchRules,
  lockedAllowlist('sandbox.filesystem.allowManagedReadPathsOnly', 'sandbox.filesystem.allowRead'),
  lockedMcpAllowlist,
  lowestEffortCap,
  commitTrailerOptOut,
  mergedEnv,
  allowedProviders,
];

/** The managed settings with every cross-source key read from all the admin sources. */
export const withCrossSourceKeys = (input: CrossSourceInput, selected: Settings): Settings =>
  CROSS_SOURCE_RULES.reduce((result, rule) => rule(input, result), selected);

/** `/status` names a source whose lock or allowlist is not the one in force (managed-settings.md, the end of "Keys read from every admin source"). */
export interface InForceNote {
  readonly index: number;
  readonly key: 'allowManagedMcpServersOnly' | 'allowedMcpServers';
}

const NOTED_KEYS = ['allowManagedMcpServersOnly', 'allowedMcpServers'] as const;

export function notInForce(admins: readonly Settings[], result: Settings): readonly InForceNote[] {
  return admins.flatMap((doc, index) =>
    NOTED_KEYS.filter((key) => {
      const set = doc[key];
      return set !== undefined && JSON.stringify(set) !== JSON.stringify(result[key]);
    }).map((key) => ({ index, key })),
  );
}
