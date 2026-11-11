import {
  createHookRegistry,
  type DispatchRequest,
  type EventFactsOf,
  type HookOutcome,
  type HookSession,
  type HookSourceKind,
  type RegisteredHandler,
  type SubprocessKind,
} from '../hooks/index.ts';
import type { HookEvent } from '../protocol/official.ts';
import { toolNamesOf } from '../rules/index.ts';

import { currentOf, type SessionCore } from './session-core.ts';
import { engineFor } from './session-engine.ts';
import { portsOf, subprocessFor, type HookEnvironment } from './session-environment.ts';
import {
  createHookScope,
  recordOutcome,
  type HookScope,
  type TurnScope,
} from './session-hook-scope.ts';
import { registerEntries } from './session-registry.ts';
import type { SessionOptions } from './session-types.ts';
import type { HostState } from './state.ts';
import type { HookSessionGates } from '../settings/hooks/session-gates.ts';

/** The facts with their `tool_name` in Claude Code's terms (`SessionOptions.toolNames`). */
function inClaudeNames<F>(facts: F, options: SessionOptions): F {
  if (options.toolNames === undefined || typeof facts !== 'object' || facts === null) return facts;
  if (!('tool_name' in facts) || typeof facts.tool_name !== 'string') return facts;
  const input = 'tool_input' in facts ? facts.tool_input : undefined;
  return { ...facts, tool_name: toolNamesOf(options.toolNames).claudeName(facts.tool_name, input) };
}

/**
 * The hook session of one turn: the common input fields and the gates. `promptId`, `scratchpadDir`,
 * `agent` and `folderTrustAccepted` pass through as given; absent, the input omits them.
 */
function sessionOf(
  state: HostState,
  gates: HookSessionGates,
  options: SessionOptions,
): HookSession {
  return {
    sessionId: options.sessionId,
    transcriptPath: options.transcriptPath,
    cwd: options.cwd,
    permissionMode: options.permissionMode,
    ...(options.effort === undefined ? {} : { effort: options.effort }),
    ...(options.promptId === undefined ? {} : { promptId: options.promptId }),
    ...(options.scratchpadDir === undefined ? {} : { scratchpadDir: options.scratchpadDir }),
    ...(options.agent === undefined ? {} : { agent: options.agent }),
    interactive: options.interactive ?? true,
    trusted: options.trusted ?? true,
    ...(options.folderTrustAccepted === undefined
      ? {}
      : { folderTrustAccepted: options.folderTrustAccepted }),
    disableAllHooks: gates.disableAllHooks,
    allowManagedHooksOnly: gates.allowManagedHooksOnly,
    pluginOnlyHooks: gates.pluginOnlyHooks,
    forceEnabledPlugins: new Set(
      state.active.filter((plugin) => gates.forceEnabled(plugin.id)).map((plugin) => plugin.id),
    ),
    mcpAvailable: portsOf(state, options).mcp !== undefined,
  };
}

/**
 * What the skills of the session use to add their hooks: the session keeps the registry, so the
 * skill part never holds hooks of its own. `prefix` names one skill; its hooks replace the ones that
 * skill registered before, so invoking it again does not stack them.
 */
export interface SkillHooksRegistrar {
  registerSkillHooks(prefix: string, entries: readonly RegisteredHandler[]): void;
}

/**
 * What a session's dispatch takes besides the event and its facts: every field of the engine's
 * `DispatchRequest` but the session, which the session gives itself (the abort signal, the
 * interrupt, what completed a task), and a limit to some sources of hooks.
 */
export type SessionDispatchOptions<E extends HookEvent> = Omit<
  DispatchRequest<E>,
  'event' | 'facts' | 'session'
> & {
  /** Limit this dispatch, without removing other registered sources. */
  readonly sourcesOnly?: readonly HookSourceKind[];
};

export interface HookPart {
  readonly hookEnvironment: HookEnvironment;
  subprocessEnvironment(kind: SubprocessKind): Record<string, string>;
  dispatch<E extends HookEvent>(
    event: E,
    facts: EventFactsOf<E>,
    options: SessionDispatchOptions<E>,
  ): Promise<HookOutcome<E>>;
}

/**
 * The hooks of one turn over the session's core: the engine (`engineFor`), the registry and what
 * lasts across dispatches are the core's, so a skill's hooks and the `once` hooks already spent are
 * the same in every turn. A dispatch leaves its `watchPaths` and background promises in the core,
 * and drops the `once` registrations its runs spent.
 */
export function createHookPart(
  core: SessionCore,
  optionsOf: () => SessionOptions,
  turn?: TurnScope,
): {
  readonly part: Omit<HookPart, 'hookEnvironment'> & HookScope;
  readonly skills: SkillHooksRegistrar;
} {
  const sessionNow = (): HookSession => {
    const { state, gates } = currentOf(core);
    return sessionOf(state, gates, optionsOf());
  };
  return {
    skills: {
      registerSkillHooks(prefix, entries) {
        registerEntries(core, currentOf(core), prefix, entries);
      },
    },
    part: {
      subprocessEnvironment: (kind) => subprocessFor(core, optionsOf(), kind),
      ...createHookScope(core, sessionNow, turn),
      async dispatch(event, facts, { sourcesOnly, ...request }) {
        const { state, gates } = currentOf(core);
        const options = optionsOf();
        const registry = core.registry.get();
        const selected =
          sourcesOnly === undefined
            ? registry
            : createHookRegistry(
                registry.entries.filter((entry) => sourcesOnly.includes(entry.source.kind)),
              );
        const outcome = await engineFor(core, options).dispatch(selected, {
          ...request,
          event,
          facts: inClaudeNames(facts, options),
          session: sessionOf(state, gates, options),
        });
        recordOutcome(core, outcome);
        return outcome;
      },
    },
  };
}
