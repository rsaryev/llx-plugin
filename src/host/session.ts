import type { HostState } from './state.ts';
import { createComponentPart, type ComponentPart } from './session-components.ts';
import { createSessionCore, type SessionCore } from './session-core.ts';
import { createTurnScope, type HookScope, type TurnScope } from './session-hook-scope.ts';
import { createHookPart, type HookPart } from './session-hooks.ts';
import { createMentionPart, type MentionPart } from './session-mentions.ts';
import { createSkillPart, type SkillPart } from './session-skills.ts';
import type { SessionOptions } from './session-types.ts';
import { applyTurn, type TurnOptions } from './turn.ts';

export interface TurnPart {
  /**
   * The same session for one turn: a view that shares the hooks registered so far, the limits on
   * skill hooks and the `once` keys already consumed, and replaces only the fields `turn` names.
   * It never reopens the session, and the session it is called on does not change; calling it on a
   * view builds on that view's fields.
   */
  withTurn(turn: TurnOptions): PluginSession;
  /**
   * `withTurn` for one run of the host: calls `run` with the view of the turn, and when `run`
   * settles (returns or throws) drops the hooks that view and the views made from it registered
   * with `lifetime: 'turn'`. The result of `run` is returned.
   */
  runScoped<T>(turn: TurnOptions, run: (turn: PluginSession) => Promise<T>): Promise<T>;
}

/**
 * One session over the host's plugins: what to list and expand, the hooks to dispatch, and the
 * components to resolve. Each part is its own file; this only puts them together.
 */
export type PluginSession = SkillPart &
  MentionPart &
  HookPart &
  HookScope &
  ComponentPart &
  TurnPart;

/** The session over a core for the given options: `openSession` makes the core, `withTurn` reuses it. */
function viewOf(
  state: HostState,
  core: SessionCore,
  options: SessionOptions,
  scope?: TurnScope,
): PluginSession {
  const { part, skills } = createHookPart(state, core, options, scope);
  const skillPart = createSkillPart(state, core, options, skills);
  return {
    ...skillPart,
    ...createMentionPart(state, options, skillPart),
    ...part,
    ...createComponentPart(state),
    withTurn: (turn) => viewOf(state, core, applyTurn(options, turn), scope),
    async runScoped(turn, run) {
      const own = createTurnScope();
      try {
        return await run(viewOf(state, core, applyTurn(options, turn), own));
      } finally {
        own.end();
      }
    },
  };
}

export function openSession(state: HostState, options: SessionOptions): PluginSession {
  return viewOf(state, createSessionCore(state), options);
}
