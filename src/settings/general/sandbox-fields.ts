import type { Settings } from '../../protocol/official.ts';

/**
 * What an invalid Boolean inside a managed `sandbox` block reads as (managed-settings.md, "Invalid
 * values inside `sandbox`"): a key that turns the sandbox or one of its restrictions on counts as
 * `true`, a key that loosens it as `false`, and `failIfUnavailable` is dropped "rather than
 * treating it as `true`". The docs name `enabled`, `network.allowManagedDomainsOnly` and
 * `allowUnsandboxedCommands`; the stance of every other key is a judgment (spec/judgments.md).
 */
export type Stance = 'restricts' | 'loosens' | 'dropped';

type Sandbox = NonNullable<Settings['sandbox']>;
/** The keys a type declares by name: the SDK's `sandbox` also has an open `[k: string]: unknown`. */
type Declared<T> = { [K in keyof T as string extends K ? never : K]: T[K] };

/** The dotted path of every Boolean key of `sandbox`, so a new one in the SDK fails the typecheck until it has a stance. */
type BooleanPaths<T, Prefix extends string = ''> = {
  [K in keyof Declared<T> & string]-?: NonNullable<Declared<T>[K]> extends boolean
    ? `${Prefix}${K}`
    : NonNullable<Declared<T>[K]> extends readonly unknown[]
      ? never
      : NonNullable<Declared<T>[K]> extends object
        ? BooleanPaths<NonNullable<Declared<T>[K]>, `${Prefix}${K}.`>
        : never;
}[keyof Declared<T> & string];

export const BOOLEAN_STANCES = {
  enabled: 'restricts',
  failIfUnavailable: 'dropped',
  autoAllowBashIfSandboxed: 'loosens',
  allowUnsandboxedCommands: 'loosens',
  'network.strictAllowlist': 'restricts',
  'network.allowManagedDomainsOnly': 'restricts',
  'network.allowAllUnixSockets': 'loosens',
  'network.allowLocalBinding': 'loosens',
  'filesystem.allowManagedReadPathsOnly': 'restricts',
  'filesystem.disabled': 'loosens',
  'credentials.allowPlaintextInject': 'loosens',
  enableWeakerNestedSandbox: 'loosens',
  allowNestedUserNamespaces: 'loosens',
  enableWeakerNetworkIsolation: 'loosens',
  allowAppleEvents: 'loosens',
} as const satisfies { readonly [P in BooleanPaths<Sandbox>]: Stance };

/** The value an invalid Boolean reads as, per stance; `dropped` has none. */
export const STANCE_VALUE: { readonly [S in Stance]: boolean | undefined } = {
  restricts: true,
  loosens: false,
  dropped: undefined,
};

/** The lists outside `credentials` (the docs name `excludedCommands` and `network.allowedDomains`). */
export const SANDBOX_LISTS = [
  'excludedCommands',
  'network.allowedDomains',
  'network.deniedDomains',
  'network.allowUnixSockets',
  'network.allowMachLookup',
  'filesystem.allowWrite',
  'filesystem.denyWrite',
  'filesystem.denyRead',
  'filesystem.allowRead',
] as const;

/**
 * While a deny list, or any entry in it, is invalid, the allow lists it restrains are withheld "so
 * the managed allowlist grants nothing until you fix the deny list".
 */
export const WITHHELD_BY: Readonly<Record<string, readonly string[]>> = {
  'network.deniedDomains': ['network.allowedDomains'],
  'filesystem.denyRead': ['filesystem.allowRead', 'filesystem.allowWrite'],
  'filesystem.denyWrite': ['filesystem.allowRead', 'filesystem.allowWrite'],
};
