import {
  enablePlan,
  type EnableBlock,
  type EnableIssue,
} from '../marketplace/dependency-enable.ts';
import type { InstallScope } from '../marketplace/install-scopes.ts';
import { commandSucceeded, type CommandOutput } from './result.ts';
import {
  alreadyInGoalState,
  failure,
  resolveTarget,
  successLine,
  type ToggleArguments,
  type ToggleFacts,
} from './toggle-target.ts';

/**
 * `claude plugin enable <plugin>` as a plan (plugins/cli-reference.md, "plugin enable"; plugins/
 * install.md, "Plugins with dependencies"): which settings file gets `enabledPlugins[<id>]: true`
 * and which dependencies are enabled with it, or why nothing is. "When the plugin declares
 * dependencies, Claude Code enables them too. The command fails" when one is not installed (it
 * prints the `claude plugin install` command for each missing one), is blocked by the organization's
 * plugin policy, or "is set to `false` at a scope with higher precedence than the target scope". The
 * dependency walk is `enablePlan`'s.
 */

/** One `enabledPlugins` entry the host writes. */
export interface EnabledWrite {
  readonly scope: InstallScope;
  readonly id: string;
  readonly enabled: boolean;
}

export interface TogglePlan {
  readonly output: CommandOutput;
  /** The settings entries to write, dependencies first; empty when the command failed. */
  readonly writes: readonly EnabledWrite[];
}

/** The failure codes of a refused enable: the kit's, since the docs name none (spec/judgments.md). */
const BLOCK_CODES: { readonly [B in EnableBlock]: string } = {
  'not-installed': 'dependency_not_installed',
  'policy-blocked': 'dependency_blocked',
  'disabled-at-higher-scope': 'dependency_disabled_at_higher_scope',
};

const refusal = (issues: readonly EnableIssue[], argument: string): CommandOutput => {
  const [first] = issues;
  const lines = [`Failed to enable plugin "${argument}":`, ...issues.map((issue) => issue.message)];
  return failure('enable', lines.join('\n'), BLOCK_CODES[first?.block ?? 'not-installed'], {
    dependencies: issues.map((issue) => issue.dependency),
  });
};

const nothing = (output: CommandOutput): TogglePlan => ({ output, writes: [] });

/** What `claude plugin enable` writes and prints. */
export function planEnable(args: ToggleArguments, facts: ToggleFacts): TogglePlan {
  const target = resolveTarget('enable', args, facts);
  if ('end' in target) return nothing(target.end);
  const already = alreadyInGoalState('enable', target, facts.graph);
  if (already !== undefined) return nothing(already);
  const dependencies = enablePlan(target.id, target.scope, facts.graph);
  if (!dependencies.ok) return nothing(refusal(dependencies.issues, args.plugin));
  const ids = [...dependencies.enable, target.id];
  return {
    output: commandSucceeded('enable', successLine('enable', target), {
      fields: { pluginId: target.id, scope: target.scope },
    }),
    writes: ids.map((id) => ({ scope: target.scope, id, enabled: true })),
  };
}
