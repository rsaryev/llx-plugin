import type { PermissionMode } from '../protocol/official.ts';
import { PERMISSION_MODES } from '../protocol/permission-modes.ts';
import type { Assert, Equal } from '../protocol/type-equality.ts';

/**
 * The values `permissionMode` accepts in a subagent file: the six modes' config values "and
 * `manual` as an alias for `default`" (sub-agents.md, "Frontmatter reference").
 */
export const PERMISSION_MODE_INPUTS = [...PERMISSION_MODES, 'manual'] as const;
export type PermissionModeInput = (typeof PERMISSION_MODE_INPUTS)[number];

/** @public A compile-time drift guard: the inputs are the official modes plus `manual`. */
export type PermissionModeInputsMatchSdk = Assert<
  Equal<PermissionModeInput, PermissionMode | 'manual'>
>;

/**
 * What a subagent does when the MAIN conversation is in a mode (sub-agents.md, "Permission
 * modes"): `forces` the subagent runs in that same mode and ignores its own `permissionMode`;
 * `holds-plan` it stays in plan mode whichever mode it sets; `lets-set-apply` it runs in the mode
 * it sets, with two exceptions (`grantedWhenSet`).
 */
export const MAIN_STANCES = ['forces', 'holds-plan', 'lets-set-apply'] as const;
export type MainStance = (typeof MAIN_STANCES)[number];

/** What decides whether a subagent may be set to a mode when the main conversation allows it. */
export interface GrantEnvironment {
  /** Auto mode is available to the subagent (no `disableAutoMode`, a model that supports it). */
  readonly autoAvailable: boolean;
}

/** What the docs say of a mode, apart from its prompting table row (`baselineDecision`). */
export interface PermissionModeTraits {
  /** permission-modes.md, `dontAsk`: "auto-denies every tool call that would otherwise prompt". */
  readonly deniesInsteadOfAsking: boolean;
  /** How a subagent follows the main conversation while the main conversation is in this mode. */
  readonly whenMain: MainStance;
  /**
   * Whether a subagent may be set to this mode while the main conversation is `default` or
   * `dontAsk`: `bypassPermissions` "only when the main conversation does" (from v2.1.267) and
   * `auto` only while auto mode is available to it.
   */
  readonly grantedWhenSet: (environment: GrantEnvironment) => boolean;
}

const always = (): boolean => true;
const never = (): boolean => false;

/** The registry: a mode added to the SDK's union fails the typecheck here. */
export const PERMISSION_MODE_TRAITS: { readonly [M in PermissionMode]: PermissionModeTraits } = {
  default: {
    deniesInsteadOfAsking: false,
    whenMain: 'lets-set-apply',
    grantedWhenSet: always,
  },
  acceptEdits: {
    deniesInsteadOfAsking: false,
    whenMain: 'forces',
    grantedWhenSet: always,
  },
  auto: {
    deniesInsteadOfAsking: false,
    whenMain: 'forces',
    grantedWhenSet: (environment) => environment.autoAvailable,
  },
  dontAsk: {
    deniesInsteadOfAsking: true,
    whenMain: 'lets-set-apply',
    grantedWhenSet: always,
  },
  bypassPermissions: {
    deniesInsteadOfAsking: false,
    whenMain: 'forces',
    grantedWhenSet: never,
  },
  plan: {
    deniesInsteadOfAsking: false,
    whenMain: 'holds-plan',
    grantedWhenSet: always,
  },
};
