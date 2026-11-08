import { disableDecision, effectiveEnabled } from '../marketplace/dependency-graph.ts';
import { isWritableScope, type InstallScope } from '../marketplace/install-scopes.ts';
import type { GraphFacts } from '../marketplace/dependency-graph.ts';
import { SCOPES_BY_PRECEDENCE } from '../marketplace/dependency-graph.ts';
import type { EnabledWrite, TogglePlan } from './enable-plan.ts';
import { commandSucceeded, usageError, type CommandOutput } from './result.ts';
import {
  alreadyInGoalState,
  failure,
  resolveTarget,
  successLine,
  type ToggleArguments,
  type ToggleFacts,
} from './toggle-target.ts';

/**
 * `claude plugin disable [plugin]` as a plan (plugins/cli-reference.md, "plugin disable"): the
 * settings file that gets `enabledPlugins[<id>]: false`, or why nothing is written. "The command
 * fails for a plugin that is still required": another enabled plugin depends on it (the failure
 * "names the dependents to disable first", `disableDecision`), or the organization requires it as a
 * synced plugin ("saves nothing"). `--all` "Can't be combined with a plugin name or `--scope`"; with
 * neither a name nor `--all` the command prints `Please specify a plugin name or use --all to
 * disable all plugins` and exits `1`.
 */

export interface DisableArguments {
  readonly plugin?: string;
  readonly scope?: string;
  readonly all?: boolean;
}

export const NAME_OR_ALL = 'Please specify a plugin name or use --all to disable all plugins';

const nothing = (output: CommandOutput): TogglePlan => ({ output, writes: [] });

function oneBlocked(
  id: string,
  graph: GraphFacts,
  required: ReadonlySet<string> | undefined,
): CommandOutput | undefined {
  if (required?.has(id) === true) {
    return failure(
      'disable',
      `Plugin "${id}" is required by your organization and can't be disabled here. Contact your admin to change it.`,
      'required_by_organization',
      {
        pluginId: id,
      },
    );
  }
  const decision = disableDecision(id, graph);
  if (decision.allowed) return undefined;
  return failure('disable', `${decision.message}. Run: ${decision.command}`, 'has_dependents', {
    pluginId: id,
    dependents: decision.dependents.join(','),
  });
}

function disableOne(args: ToggleArguments, facts: ToggleFacts): TogglePlan {
  const target = resolveTarget('disable', args, facts);
  if ('end' in target) return nothing(target.end);
  const already = alreadyInGoalState('disable', target, facts.graph);
  if (already !== undefined) return nothing(already);
  const blocked = oneBlocked(target.id, facts.graph, facts.requiredByOrganization);
  if (blocked !== undefined) return nothing(blocked);
  return {
    output: commandSucceeded('disable', successLine('disable', target), {
      fields: { pluginId: target.id, scope: target.scope },
    }),
    writes: [{ scope: target.scope, id: target.id, enabled: false }],
  };
}

/** The scope whose `true` wins for the id, the one `--all` writes `false` at. */
const winningScope = (id: string, graph: GraphFacts): InstallScope | undefined =>
  SCOPES_BY_PRECEDENCE.find((scope) => graph.enabled[scope]?.[id] !== undefined);

/** Every plugin that is enabled, can be changed, and is not required, each disabled where it is enabled. */
function disableAll(facts: ToggleFacts): TogglePlan {
  const ids = [
    ...new Set(Object.values(facts.graph.enabled).flatMap((byId) => Object.keys(byId ?? {}))),
  ];
  const writes: EnabledWrite[] = ids.flatMap((id) => {
    const scope = winningScope(id, facts.graph);
    const required = facts.requiredByOrganization?.has(id) === true;
    const live = effectiveEnabled(id, facts.graph) === true;
    return scope !== undefined && live && !required && isWritableScope(scope)
      ? [{ scope, id, enabled: false }]
      : [];
  });
  const noun = writes.length === 1 ? 'plugin' : 'plugins';
  const message =
    writes.length === 0
      ? 'No enabled plugins to disable'
      : `Successfully disabled ${writes.length} ${noun}`;
  return {
    output: commandSucceeded('disable', message, {
      fields: { disabled: writes.map((write) => write.id) },
    }),
    writes,
  };
}

/** What `claude plugin disable` writes and prints. */
export function planDisable(args: DisableArguments, facts: ToggleFacts): TogglePlan {
  if (args.all === true) {
    return args.plugin !== undefined || args.scope !== undefined
      ? nothing(usageError('--all cannot be combined with a plugin name or --scope'))
      : disableAll(facts);
  }
  if (args.plugin === undefined) return nothing(usageError(NAME_OR_ALL));
  return disableOne(
    { plugin: args.plugin, ...(args.scope === undefined ? {} : { scope: args.scope }) },
    facts,
  );
}
