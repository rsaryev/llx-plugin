import type { PermissionMode } from '../protocol/official.ts';
import { normalizePermissionMode } from '../protocol/permission-modes.ts';
import {
  PERMISSION_MODE_TRAITS,
  type MainStance,
  type PermissionModeInput,
} from './permission-mode.ts';

/** What decides the subagent's mode beyond its own `permissionMode`. */
export interface SubagentPermissionInput {
  /** The main conversation's current mode. */
  readonly main: PermissionMode;
  /** The subagent's `permissionMode` ("manual" is `default`); `undefined` when it sets none. */
  readonly set?: PermissionModeInput | undefined;
  /** Auto mode is available to the subagent: no `disableAutoMode`, a model that supports it. */
  readonly autoAvailable: boolean;
}

/** How the mode came about: `inherited` (nothing set), `set` (its own applies), `main` (the main's held). */
export type SubagentModeBasis = 'inherited' | 'set' | 'main';

export interface SubagentPermission {
  readonly mode: PermissionMode;
  /**
   * An action the mode would ask about is denied instead: `dontAsk`, and a subagent that
   * "stays in plan mode" while it sets `dontAsk`.
   */
  readonly denyInsteadOfAsk: boolean;
  readonly basis: SubagentModeBasis;
}

const outcome = (
  mode: PermissionMode,
  basis: SubagentModeBasis,
  denies: boolean,
): SubagentPermission => ({ mode, basis, denyInsteadOfAsk: denies });

const denies = (mode: PermissionMode | undefined): boolean =>
  mode !== undefined && PERMISSION_MODE_TRAITS[mode].deniesInsteadOfAsking;

type Resolver = (
  input: SubagentPermissionInput,
  set: PermissionMode | undefined,
) => SubagentPermission;

/** The three stances, each one of the bullets under "Permission modes" in sub-agents.md. */
const RESOLVERS: { readonly [S in MainStance]: Resolver } = {
  // "the subagent runs in that same mode and Claude Code ignores the `permissionMode` you set"
  forces: ({ main }, set) => outcome(main, set === undefined ? 'inherited' : 'main', denies(main)),
  // "stays in plan mode whichever `permissionMode` you set ... If you set `dontAsk`" it denies.
  'holds-plan': ({ main }, set) =>
    outcome(main, set === undefined ? 'inherited' : 'main', denies(main) || denies(set)),
  // "runs in the permission mode you set", except a mode it is not granted.
  'lets-set-apply': ({ main, autoAvailable }, set) => {
    if (set === undefined) return outcome(main, 'inherited', denies(main));
    if (!PERMISSION_MODE_TRAITS[set].grantedWhenSet({ autoAvailable })) {
      return outcome(main, 'main', denies(main));
    }
    return outcome(set, 'set', denies(set));
  },
};

/**
 * The permission mode a subagent runs in (sub-agents.md, "Permission modes"): "The main
 * conversation's permission mode decides whether Claude Code uses the value you set". Unset, the
 * subagent inherits the main conversation's mode. A value that is no mode counts as unset.
 */
export function resolveSubagentPermissionMode(input: SubagentPermissionInput): SubagentPermission {
  const set = input.set === undefined ? undefined : normalizePermissionMode(input.set);
  return RESOLVERS[PERMISSION_MODE_TRAITS[input.main].whenMain](input, set);
}
