import { workflowsDecision } from '../settings/workflows/index.ts';
import { portsOf } from './session-environment.ts';
import type { SessionOptions } from './session-types.ts';
import type { HostState } from './state.ts';

/**
 * A plugin workflow the session offers as `/<plugin>:<meta.name>` (workflows.md, "Distribute a
 * workflow in a plugin"). The kit lists it; the host runs the script at `path` (below the plugin's
 * root) with its Workflow tool.
 */
export interface WorkflowCommand {
  readonly name: string;
  readonly description: string;
  readonly pluginId: string;
  readonly path: string;
}

/** The plugin context of the decision: not Pro and no organization switch unless the host says so. */
const NOT_PRO = { plan: { pro: false } } as const;

/** Whether the workflow commands are available (workflows.md, "Turn workflows off"). */
function commandsOn(state: HostState, options: SessionOptions): boolean {
  const context = state.options.workflows ?? NOT_PRO;
  const env = portsOf(state, options).environment.snapshot();
  return workflowsDecision(state.view, { ...context, env }).surfaces.workflowCommands;
}

/**
 * The workflow commands of the plugins that run, in their loading order. Oracle 2.1.319
 * (spec/judgments.md): a script whose `meta` does not read (not the first statement, no description)
 * is not one, and of two scripts with one `meta.name` the first in the folder listing is kept.
 */
export function workflowCommandsOf(
  state: HostState,
  options: SessionOptions,
): readonly WorkflowCommand[] {
  // The decision reads the whole environment; with no workflow to list it would change nothing.
  if (!state.active.some((plugin) => plugin.plugin.workflows.length > 0)) return [];
  if (!commandsOn(state, options)) return [];
  const seen = new Set<string>();
  return state.active.flatMap((plugin) =>
    plugin.plugin.workflows.flatMap((workflow) => {
      const name = workflow.qualifiedName;
      const description = workflow.meta?.description;
      if (name === undefined || description === undefined || seen.has(name)) return [];
      seen.add(name);
      return [{ name, description, pluginId: plugin.id, path: workflow.path }];
    }),
  );
}
