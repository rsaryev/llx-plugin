import type { HookSpecificOutputOf } from '../../protocol/hook-events.ts';
import { specificOf } from './fields.ts';
import type { EventEffects } from './effects.ts';
import { NOTHING, lastOf, type Merged, type Merger, type Read } from './merge-rules.ts';

/**
 * The events that gate an action: `PreToolUse` and `PreModelSwitch` (a `permissionDecision`),
 * and `PermissionRequest` (a `decision` object). hooks.md, "PreToolUse decision control",
 * "PreModelSwitch decision control", "PermissionRequest decision control".
 */

type Permission = NonNullable<EventEffects['permissionDecision']>;

/** "When multiple PreToolUse hooks return different decisions, precedence is `deny` > `defer` > `ask` > `allow`." */
const PRECEDENCE: readonly Permission[] = ['deny', 'defer', 'ask', 'allow'];

interface Gate {
  readonly read: Read;
  readonly decision: Permission | undefined;
  readonly reason: string | undefined;
  readonly updatedInput: HookSpecificOutputOf<'PreToolUse'>['updatedInput'];
}

/** The deprecated top-level `decision`: "The deprecated values `approve` and `block` map to `allow` and `deny`". */
const DEPRECATED: { readonly [D in 'approve' | 'block']: Permission } = {
  approve: 'allow',
  block: 'deny',
};

function decisionOf(read: Read, own: Permission | undefined): Permission | undefined {
  const top = read.output?.decision;
  const decision = own ?? (top === undefined ? undefined : DEPRECATED[top]);
  // "A Monitor call reached the hook through a Bash matcher: its `allow` does not apply."
  return read.effectsIgnored && decision === 'allow' ? undefined : decision;
}

function gateOf(read: Read, event: 'PreToolUse' | 'PreModelSwitch'): Gate {
  const own = specificOf(event, read.specific);
  const updatedInput =
    event === 'PreToolUse' && !read.effectsIgnored
      ? specificOf('PreToolUse', read.specific)?.updatedInput
      : undefined;
  return {
    read,
    decision: decisionOf(read, own?.permissionDecision),
    reason: own?.permissionDecisionReason ?? read.output?.reason,
    updatedInput,
  };
}

const rankOf = (decision: Permission): number => PRECEDENCE.indexOf(decision);

/** The winning decision: the first hook that has the highest precedence. */
function winnerOf(gates: readonly Gate[]): Gate | undefined {
  return gates.reduce<Gate | undefined>(
    (best, gate) =>
      gate.decision !== undefined &&
      (best?.decision === undefined || rankOf(gate.decision) < rankOf(best.decision))
        ? gate
        : best,
    undefined,
  );
}

function mergeGates(event: 'PreToolUse' | 'PreModelSwitch', reads: readonly Read[]): Merged {
  const gates = reads.map((read) => gateOf(read, event));
  const winner = winnerOf(gates);
  // `updatedInput` is "ignored" for `defer`, and a `deny` runs nothing, as for an exit-2 deny
  // (`finalize.ts`); the last hook's replacement wins (spec/judgments.md).
  const updatedInput =
    winner?.decision === 'deny'
      ? undefined
      : lastOf(gates.filter((gate) => gate.decision !== 'defer').map((gate) => gate.updatedInput));
  const rewrite = updatedInput === undefined ? {} : { updatedInput };
  if (winner?.decision === undefined) return { effects: rewrite, issues: [] };
  const { reason } = winner;
  return {
    effects: {
      permissionDecision: winner.decision,
      ...(reason === undefined ? {} : { permissionDecisionReason: reason }),
      ...rewrite,
    },
    issues: [],
    ...(winner.decision === 'deny'
      ? {
          block: {
            via: 'decision' as const,
            by: winner.read.handler.id,
            ...(reason === undefined ? {} : { reason }),
          },
        }
      : {}),
  };
}

export const mergePreToolUse: Merger = (reads) => mergeGates('PreToolUse', reads);
export const mergePreModelSwitch: Merger = (reads) => mergeGates('PreModelSwitch', reads);

type Decision = HookSpecificOutputOf<'PermissionRequest'>['decision'];

const decisionOfRequest = (read: Read): Decision | undefined =>
  specificOf('PermissionRequest', read.specific)?.decision;

/**
 * Judgment (spec/judgments.md): the docs give no precedence across hooks for `PermissionRequest`:
 * a deny wins over an allow, the `updatedPermissions` of the allowing hooks are concatenated, the
 * last `updatedInput` wins, and a deny's `interrupt` counts when any denying hook sets it.
 */
export const mergePermissionRequest: Merger = (reads) => {
  const decisions = reads.flatMap((read) => {
    const decision = decisionOfRequest(read);
    return decision === undefined ? [] : [{ read, decision }];
  });
  const denies = decisions.flatMap(({ read, decision }) =>
    decision.behavior === 'deny' ? [{ read, decision }] : [],
  );
  const first = denies[0];
  if (first !== undefined) {
    const message = denies
      .map(({ decision }) => ('message' in decision ? decision.message : undefined))
      .find((text) => text !== undefined);
    const interrupt = denies.some(({ decision }) => 'interrupt' in decision && decision.interrupt);
    return {
      effects: {
        permissionRequest: {
          behavior: 'deny',
          ...(message === undefined ? {} : { message }),
          ...(interrupt ? { interrupt } : {}),
        },
      },
      issues: [],
      block: {
        via: 'decision',
        by: first.read.handler.id,
        ...(message === undefined ? {} : { reason: message }),
      },
    };
  }
  // "A Monitor call reached the hook through a Bash matcher": its `allow` and `updatedInput` do not apply.
  const allows = decisions.flatMap(({ read, decision }) =>
    decision.behavior === 'allow' && !read.effectsIgnored ? [decision] : [],
  );
  if (allows.length === 0) return NOTHING;
  const updatedInput = lastOf(allows.map((allow) => allow.updatedInput));
  const updatedPermissions = allows.flatMap((allow) => allow.updatedPermissions ?? []);
  return {
    effects: {
      permissionRequest: {
        behavior: 'allow',
        ...(updatedInput === undefined ? {} : { updatedInput }),
        ...(updatedPermissions.length === 0 ? {} : { updatedPermissions }),
      },
    },
    issues: [],
  };
};
