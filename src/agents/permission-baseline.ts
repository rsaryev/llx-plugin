import type { PermissionMode } from '../protocol/official.ts';

/** The kinds of action the "Available modes" table tells apart. */
export const ACTION_CATEGORIES = ['read', 'edit', 'filesystem-command', 'other'] as const;
export type ActionCategory = (typeof ACTION_CATEGORIES)[number];

/** `classify`: the mode's background classifier decides (auto mode). */
export type BaselineDecision = 'allow' | 'ask' | 'deny' | 'classify';

/**
 * One tool call as far as a mode's baseline is concerned. `inScope` is "paths in the working
 * directory or `additionalDirectories`": where it matters (`acceptEdits`, `dontAsk`, `auto`) the
 * table says so, elsewhere it is ignored. Deciding the scope of a path is the host's.
 */
export interface BaselineAction {
  readonly category: ActionCategory;
  readonly inScope: boolean;
}

/** A cell that depends on the path being in scope. */
interface ScopedCell {
  readonly inScope: BaselineDecision;
  readonly outOfScope: BaselineDecision;
}
type Cell = BaselineDecision | ScopedCell;
type Row = { readonly [C in ActionCategory]: Cell };

const rest = (decision: BaselineDecision): Row => ({
  read: decision,
  edit: decision,
  'filesystem-command': decision,
  other: decision,
});

/** In scope allowed, out of scope prompts: the `acceptEdits` cell for edits and filesystem commands. */
const ALLOW_IN_SCOPE: ScopedCell = { inScope: 'allow', outOfScope: 'ask' };

/**
 * permission-modes.md, "Available modes", "What runs without asking", cell by cell. A "prompt"
 * is `ask`. Modelled is the baseline only, as the doc says: "Modes set the baseline" and rules,
 * hooks, protected paths and critical-path removals layer on top (spec/judgments.md).
 */
const BASELINE: { readonly [M in PermissionMode]: Row } = {
  // "Reads only"
  default: { ...rest('ask'), read: 'allow' },
  // "Reads, file edits, and common filesystem commands" (in scope)
  acceptEdits: {
    ...rest('ask'),
    read: 'allow',
    edit: ALLOW_IN_SCOPE,
    'filesystem-command': ALLOW_IN_SCOPE,
  },
  // "Reads, plus classifier-approved commands when auto mode is available": only the baseline.
  plan: { ...rest('ask'), read: 'allow' },
  // "Everything, with background safety checks": reads and in-scope edits skip the classifier
  // (decision order, step 2), "everything else goes to the classifier" (step 3).
  auto: {
    read: 'allow',
    edit: { inScope: 'allow', outOfScope: 'classify' },
    'filesystem-command': 'classify',
    other: 'classify',
  },
  // "File reads inside your working directories ...; anything that would prompt is denied"
  dontAsk: { ...rest('deny'), read: { inScope: 'allow', outOfScope: 'deny' } },
  // "Everything"
  bypassPermissions: rest('allow'),
};

/** What `mode` does with `action` before any rule, hook or classifier verdict. */
export function baselineDecision(mode: PermissionMode, action: BaselineAction): BaselineDecision {
  const cell = BASELINE[mode][action.category];
  if (typeof cell === 'string') return cell;
  return action.inScope ? cell.inScope : cell.outOfScope;
}
