import type { PolicyView } from '../view.ts';

/** What the host tells the workflow keys besides the layers: plain data, the kit reads no `process.env`. */
export interface WorkflowsContext {
  /** The host's environment, for `CLAUDE_CODE_DISABLE_WORKFLOWS`. */
  readonly env: Readonly<Record<string, string | undefined>>;
  /**
   * The signed-in plan: workflows are off by default on Pro (settings-reference.md, `enableWorkflows`).
   * The host applies the release rule of `workflowSizeGuideline` (Claude Code v2.1.271 or later).
   */
  readonly plan: { readonly pro: boolean };
  /** The organization turned workflows off on the Claude Code admin settings page (workflows.md). */
  readonly orgWorkflowsOff?: boolean;
}

/** `CLAUDE_CODE_DISABLE_WORKFLOWS`, equivalent to `disableWorkflows` for one session (env-vars.md). */
export const WORKFLOWS_ENV = 'CLAUDE_CODE_DISABLE_WORKFLOWS';

/** The documented value (env-vars.md: "Set to `1`"). */
const ENV_ON = '1';

/** What can turn workflows off, in the order a decision lists them. */
export const WORKFLOWS_OFF_BY = [
  'disableWorkflows',
  'env',
  'orgPolicy',
  'enableWorkflows',
  'plan',
] as const;
export type WorkflowsOffBy = (typeof WORKFLOWS_OFF_BY)[number];

/** What turned workflows on, when nothing turned them off. */
export type WorkflowsOnBy = 'enableWorkflows' | 'plan';

/**
 * What workflows take with them when they are off (workflows.md, "Turn workflows off"): `/workflows`,
 * the workflow commands and the `/workflow-authoring` skill are unavailable, the `ultracode` keyword
 * no longer triggers a run and the Ultracode toggle is removed from `/effort`. A run already in progress
 * keeps going: the kit holds no run state, so that is a duty of the host, which must not cancel a run
 * because this decision turned to off (spec/judgments.md).
 */
export interface WorkflowSurfaces {
  readonly workflowsView: boolean;
  readonly workflowCommands: boolean;
  readonly workflowAuthoringSkill: boolean;
  readonly keyword: boolean;
  readonly ultracodeToggle: boolean;
}

export interface WorkflowsDecision {
  readonly enabled: boolean;
  /** Empty when enabled; otherwise every reason that applies. Any one of them keeps workflows off. */
  readonly offBy: readonly WorkflowsOffBy[];
  /** Why they are on: an explicit `enableWorkflows: true`, or the plan's default. */
  readonly enabledBy: WorkflowsOnBy | undefined;
  readonly surfaces: WorkflowSurfaces;
  /** Whether `/config` shows its Dynamic workflows row. */
  readonly configRowVisible: boolean;
}

type Reading = (view: PolicyView, context: WorkflowsContext) => boolean;

/**
 * `true` in any file turns workflows off for everyone those files reach; `false` "is the same as unset"
 * and does not lift a `true` elsewhere (spec/judgments.md).
 */
const disabledByFile: Reading = (view) =>
  view.eachFromHighest('disableWorkflows').some((holder) => holder.value);

const OFF_BY: { readonly [R in WorkflowsOffBy]: Reading } = {
  disableWorkflows: disabledByFile,
  env: (_view, context) => context.env[WORKFLOWS_ENV] === ENV_ON,
  orgPolicy: (_view, context) => context.orgWorkflowsOff === true,
  enableWorkflows: (view) => view.get('enableWorkflows') === false,
  plan: (view, context) => view.get('enableWorkflows') === undefined && context.plan.pro,
};

const surfaces = (available: boolean): WorkflowSurfaces => ({
  workflowsView: available,
  workflowCommands: available,
  workflowAuthoringSkill: available,
  keyword: available,
  ultracodeToggle: available,
});

/**
 * "Claude Code hides the `/config` row while a source other than your user settings sets
 * `enableWorkflows`, or sets `disableWorkflows` to `true`" (settings-reference.md, `enableWorkflows`).
 * Read with the one subject, a source other than user settings (spec/judgments.md).
 */
function configRowVisible(view: PolicyView): boolean {
  const enables = view.eachFromHighest('enableWorkflows').some((holder) => holder.scope !== 'user');
  const disables = view
    .eachFromHighest('disableWorkflows')
    .some((holder) => holder.scope !== 'user' && holder.value);
  return !enables && !disables;
}

/**
 * Whether dynamic workflows are on: off by `disableWorkflows`, by `CLAUDE_CODE_DISABLE_WORKFLOWS=1`,
 * by the organization's policy or by `enableWorkflows: false`; otherwise on, except on the Pro plan
 * where they are off unless `enableWorkflows` is `true`. Nothing that turns them off can be undone by
 * `enableWorkflows: true` or by the other off switch (settings-reference.md, `disableWorkflows`,
 * `enableWorkflows`).
 */
export function workflowsDecision(view: PolicyView, context: WorkflowsContext): WorkflowsDecision {
  const offBy = WORKFLOWS_OFF_BY.filter((reason) => OFF_BY[reason](view, context));
  const enabled = offBy.length === 0;
  const explicit = view.get('enableWorkflows') === true;
  return {
    enabled,
    offBy,
    enabledBy: enabled ? (explicit ? 'enableWorkflows' : 'plan') : undefined,
    surfaces: surfaces(enabled),
    configRowVisible: configRowVisible(view),
  };
}
