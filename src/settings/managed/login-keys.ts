import type { Settings } from '../../protocol/official.ts';
import type { PolicyLayer } from '../layers.ts';

/**
 * Which managed source supplies the login keys (managed-settings.md, "Which managed source supplies
 * login keys"; settings-reference.md, `managedSourcesBehavior`). Under either setting the keys come
 * from the machine's own policy: "the MDM policy or managed settings file, whichever is the
 * higher-ranked one carrying a policy key", ahead of remote settings. When that policy sets any
 * policy key, the file below it contributes no login key, even under `"merge"`.
 */
export const LOGIN_KEYS = [
  'forceLoginOrgUUID',
  'forceLoginMethod',
  'forceLoginGatewayUrl',
  'gatewayInternalNetworks',
] as const;
export type LoginKey = (typeof LOGIN_KEYS)[number];

/** The `forceLoginMethod` values the first-party sign-in takes; `"gateway"` is a gateway sign-in key. */
const FIRST_PARTY_METHODS: readonly unknown[] = ['claudeai', 'console'];

/**
 * What remote settings may add where the machine's policy omits the key: the organization and the
 * first-party methods. "Claude Code doesn't use a value in remote settings for the gateway sign-in."
 */
const REMOTE_FILLS: { readonly [K in LoginKey]: (value: unknown) => boolean } = {
  forceLoginOrgUUID: () => true,
  forceLoginMethod: (value) => FIRST_PARTY_METHODS.includes(value),
  forceLoginGatewayUrl: () => false,
  gatewayInternalNetworks: () => false,
};

/** The login keys in force: the machine's policy wins, remote settings fill the first-party keys it omits. */
export function loginKeysOf(machine: Settings | undefined, remote: Settings | undefined): Settings {
  const entries = LOGIN_KEYS.flatMap((key): [string, unknown][] => {
    const fromMachine = machine?.[key];
    if (fromMachine !== undefined) return [[key, fromMachine]];
    const fromRemote = remote?.[key];
    return fromRemote !== undefined && REMOTE_FILLS[key](fromRemote) ? [[key, fromRemote]] : [];
  });
  // `Object.fromEntries` defines own properties, so a JSON-parsed `__proto__` name stays a name.
  return Object.fromEntries(entries);
}

/** The settings without any login key. */
export const withoutLoginKeys = (settings: Settings): Settings =>
  Object.fromEntries(
    Object.entries(settings).filter(([name]) => !LOGIN_KEYS.some((key) => key === name)),
  );

/**
 * `/login` refuses every new cloud gateway sign-in on the machine while the highest managed source on
 * it carries `gatewayInternalNetworks` with a value that cannot be read (managed-settings.md, "Keys
 * that fail closed"): no value says that, so the managed layer records the key as invalid.
 */
export const gatewaySignInRefused = (layer: PolicyLayer): boolean =>
  layer.invalid?.includes('gatewayInternalNetworks') === true;

/**
 * The managed tier as a layer: the login keys the highest machine source carried unreadable are
 * recorded as invalid (`PolicyLayer.invalid`), since only that source supplies them.
 */
export function managedLayer(
  settings: Settings,
  machine: { readonly invalid: readonly string[] } | undefined,
): PolicyLayer {
  const invalid = (machine?.invalid ?? []).filter((name) => LOGIN_KEYS.some((key) => key === name));
  return invalid.length === 0
    ? { scope: 'managed', settings }
    : { scope: 'managed', settings, invalid };
}
