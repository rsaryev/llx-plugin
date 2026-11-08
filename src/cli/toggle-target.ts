import type { GraphFacts } from '../marketplace/dependency-graph.ts';
import {
  INSTALL_SCOPES,
  isWritableScope,
  type InstallScope,
} from '../marketplace/install-scopes.ts';
import { commandFailed, type CommandOutput, type ResultFields } from './result.ts';
import { matchingIds, qualifiedCommands } from './plugin-ref.ts';
import { chooseScope, detectScope, writeScope, type CommandScope } from './scope.ts';

/**
 * Which plugin and which scope `claude plugin enable` and `disable` act on (plugins/cli-reference.md,
 * "plugin enable", "plugin disable"): "Without `--scope`, the command checks your settings files in
 * the order local, project, user, and uses the first scope that mentions the plugin"; a `--scope`
 * where the plugin isn't declared "either writes an override or fails"; "If the plugin is already
 * enabled at the resolved scope, the command prints `Plugin "formatter" is already enabled` and exits
 * `1`. With `--json`, the result has `"failureCode": "already_in_goal_state"` and
 * `"alreadyInGoalState": true`". Pure over the graph facts: a scope "mentions" a plugin when its
 * `enabledPlugins` holds the id.
 */

export type ToggleCommand = 'enable' | 'disable';

export interface ToggleArguments {
  /** `name` or `name@marketplace` (`name@synced` for a plugin synced from claude.ai). */
  readonly plugin: string;
  readonly scope?: string;
  readonly json?: boolean;
}

export interface ToggleFacts {
  readonly graph: GraphFacts;
  /** Plugin ids the organization requires (a required synced plugin cannot be disabled). */
  readonly requiredByOrganization?: ReadonlySet<string>;
}

/** What each command sets and how it words the already-done line. */
interface Goal {
  readonly value: boolean;
  readonly adjective: string;
}

const GOALS: { readonly [C in ToggleCommand]: Goal } = {
  enable: { value: true, adjective: 'enabled' },
  disable: { value: false, adjective: 'disabled' },
};

export interface Target {
  /** The plugin as the user typed it, for the lines. */
  readonly argument: string;
  readonly id: string;
  readonly scope: InstallScope;
  /** Whether the scope declares the plugin, or the write is an override at a scope that wins. */
  readonly override: boolean;
}

export type Resolved = Target | { readonly end: CommandOutput };

export const failure = (
  command: ToggleCommand,
  line: string,
  failureCode: string,
  fields: ResultFields = {},
): CommandOutput => commandFailed(command, line, { failureCode, fields });

/** Every plugin id the settings or the install records mention. */
function knownIds(graph: GraphFacts): readonly string[] {
  const keys = Object.values(graph.enabled).flatMap((byId) => Object.keys(byId ?? {}));
  return [...new Set([...graph.installed.map((record) => record.id), ...keys])];
}

/** The scopes whose settings mention the id; when none does, the scopes it is installed at. */
function declaredAt(id: string, graph: GraphFacts): readonly InstallScope[] {
  const mentioned = INSTALL_SCOPES.filter((scope) => graph.enabled[scope]?.[id] !== undefined);
  if (mentioned.length > 0) return mentioned;
  return graph.installed.filter((record) => record.id === id).map((record) => record.scope);
}

const notInstalled = (command: ToggleCommand, argument: string): CommandOutput =>
  failure(command, `Plugin "${argument}" is not installed`, 'not_installed', {
    pluginId: argument,
  });

const ambiguous = (
  command: ToggleCommand,
  argument: string,
  ids: readonly string[],
): CommandOutput =>
  failure(
    command,
    `"${argument}" matches plugins from more than one marketplace; run one of: ${qualifiedCommands(command, ids).join(', ')}`,
    'ambiguous_plugin',
  );

interface ScopeRequest {
  readonly command: ToggleCommand;
  readonly argument: string;
  readonly id: string;
  /** The scope `--scope` names; absent when it is omitted. */
  readonly chosen?: CommandScope;
}

/** The scope to write: the one asked for (a declaring scope or an override), or the first that mentions the plugin. */
function scopeFor(request: ScopeRequest, graph: GraphFacts): Resolved {
  const { command, argument, id, chosen } = request;
  const declared = declaredAt(id, graph).filter(isWritableScope);
  if (chosen === undefined) {
    const found = detectScope(command, declared);
    return found === undefined
      ? { end: notInstalled(command, argument) }
      : { argument, id, scope: found, override: false };
  }
  const write = writeScope(argument, chosen, declared);
  if ('message' in write) return { end: failure(command, write.message, 'wrong_scope') };
  if (!('scope' in write)) return { end: notInstalled(command, argument) };
  return { argument, id, scope: write.scope, override: !declared.includes(write.scope) };
}

/** The plugin and scope `command` acts on, or the output that ends it. */
export function resolveTarget(
  command: ToggleCommand,
  args: ToggleArguments,
  facts: ToggleFacts,
): Resolved {
  const chosen = chooseScope(command, args.scope);
  if ('reason' in chosen) return { end: chosen };
  const [id, ...others] = matchingIds(args.plugin, knownIds(facts.graph));
  if (id === undefined) return { end: notInstalled(command, args.plugin) };
  if (others.length > 0) return { end: ambiguous(command, args.plugin, [id, ...others]) };
  const request = { command, argument: args.plugin, id };
  return scopeFor('scope' in chosen ? { ...request, chosen: chosen.scope } : request, facts.graph);
}

/** The already-done failure, when the resolved scope already holds the value the command writes. */
export function alreadyInGoalState(
  command: ToggleCommand,
  target: Target,
  graph: GraphFacts,
): CommandOutput | undefined {
  const goal = GOALS[command];
  if (graph.enabled[target.scope]?.[target.id] !== goal.value) return undefined;
  return failure(
    command,
    `Plugin "${target.argument}" is already ${goal.adjective}`,
    'already_in_goal_state',
    {
      alreadyInGoalState: true,
      pluginId: target.id,
      scope: target.scope,
    },
  );
}

/** `Successfully enabled plugin: formatter (scope: project)`. */
export const successLine = (command: ToggleCommand, target: Target): string =>
  `Successfully ${GOALS[command].adjective} plugin: ${target.argument} (scope: ${target.scope})`;
