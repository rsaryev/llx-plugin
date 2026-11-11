import type { EffortLevel } from '../../protocol/official.ts';
import { EFFORT_LEVELS } from '../../protocol/effort.ts';
import type { PolicyScope } from '../layers.ts';

/**
 * A key whose managed value is not an override (settings.md, "Exceptions to managed settings
 * precedence"): a restrictive value from a lower scope stays in force. The rule is the same for
 * every key and only its data differs, so a key's row names a `ManagedException` and one function
 * applies it.
 */
export interface ManagedException<V> {
  /** The values the key reads, from the least restrictive to the most; a value off the ladder is not honored. */
  readonly ladder: readonly V[];
  /** The scopes whose more restrictive value beats the value that wins by precedence. */
  readonly honoredFrom: readonly PolicyScope[];
  /**
   * The scopes whose value never takes part in precedence and counts only when it is more
   * restrictive than the value that does (a repository's own files: the docs say a project or local
   * value "that isn't stricter is ignored").
   */
  readonly onlyWhenStricter: readonly PolicyScope[];
  /**
   * What a value of this key that no rung can stand for does when a source of `from` carries it: it
   * counts as `floor` whatever precedence says, so a higher source cannot undo it
   * (settings-reference.md, `crossSessionInbound`: an unrecognized value holds messages "even when a
   * source that takes precedence sets `accept`").
   */
  readonly unreadable?: { readonly floor: V; readonly from: readonly PolicyScope[] };
}

/** The scopes a key set in "Any file" may come from. */
const ANY_SCOPE: readonly PolicyScope[] = ['managed', 'parent', 'flag', 'local', 'project', 'user'];

const NO_SCOPE: readonly PolicyScope[] = [];

/** `true` restricts and any scope's `true` is honored: `disableClaudeAiConnectors`, `isolatePeerMachines`, the two `block…Outside…` keys. */
export const TRUE_FROM_ANY_SCOPE: ManagedException<boolean> = {
  ladder: [false, true],
  honoredFrom: ANY_SCOPE,
  onlyWhenStricter: NO_SCOPE,
};

/**
 * `true` restricts and only `~/.claude/settings.json` or `--settings` may beat a managed `false`:
 * `autoMode.classifyAllShell` and `permissions.denyInsteadOfPrompting`.
 */
export const TRUE_FROM_USER_OR_FLAG: ManagedException<boolean | undefined> = {
  ladder: [false, true],
  honoredFrom: ['user', 'flag'],
  onlyWhenStricter: NO_SCOPE,
};

/** `false` restricts and the scopes the key's own line admits may set it: the claude.ai sync keys, `useAutoModeDuringPlan`, `enableArtifact`. */
export const FALSE_FROM_ANY_SCOPE: ManagedException<boolean> = {
  ladder: [true, false],
  honoredFrom: ANY_SCOPE,
  onlyWhenStricter: NO_SCOPE,
};

/** `maxEffortLevel`: "When several scopes set a cap, the lowest applies"; `"max"` sets no cap. */
export const LOWEST_CAP: ManagedException<EffortLevel> = {
  ladder: EFFORT_LEVELS.toReversed(),
  honoredFrom: ANY_SCOPE,
  onlyWhenStricter: NO_SCOPE,
};

/** Whether `a` restricts more than `b` on the ladder; `undefined` stands for no value, as unrestricted as the first rung. */
const restrictsMore = <V>(ladder: readonly V[], a: V, b: V | undefined): boolean =>
  ladder.indexOf(a) > (b === undefined ? 0 : ladder.indexOf(b));

/**
 * The value in force: the one precedence picks (`winning`, `undefined` when nothing applies), or the
 * most restrictive of the honored values when one restricts more.
 */
export function honorException<V>(
  rule: ManagedException<V>,
  winning: V | undefined,
  honored: readonly V[],
): V | undefined {
  return honored.reduce<V | undefined>(
    (current, value) => (restrictsMore(rule.ladder, value, current) ? value : current),
    winning,
  );
}

/**
 * The most restrictive of `values` on the ladder, `undefined` when none restricts more than the
 * first rung: the one "strict wins" step, for the view's rows and for the admin sources alike.
 */
export const strictestOf = <V>(ladder: readonly V[], values: readonly V[]): V | undefined =>
  honorException({ ladder, honoredFrom: ANY_SCOPE, onlyWhenStricter: NO_SCOPE }, undefined, values);
