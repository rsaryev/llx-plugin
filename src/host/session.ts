import type { HostState } from './state.ts';
import { createComponentPart, type ComponentPart } from './session-components.ts';
import { createSessionCore, type SessionCore } from './session-core.ts';
import { createHookPart, type HookPart } from './session-hooks.ts';
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
}

/**
 * One session over the host's plugins: what to list and expand, the hooks to dispatch, and the
 * components to resolve. Each part is its own file; this only puts them together.
 */
export type PluginSession = SkillPart & HookPart & ComponentPart & TurnPart;

/** The session over a core for the given options: `openSession` makes the core, `withTurn` reuses it. */
export function viewOf(
  state: HostState,
  core: SessionCore,
  options: SessionOptions,
): PluginSession {
  const hooks = createHookPart(state, core, options);
  const hookPart: HookPart = {
    dispatch: (event, facts, run) => hooks.dispatch(event, facts, run),
  };
  return {
    ...createSkillPart(state, core, options, hooks),
    ...hookPart,
    ...createComponentPart(state),
    withTurn: (turn) => viewOf(state, core, applyTurn(options, turn)),
  };
}

export function openSession(state: HostState, options: SessionOptions): PluginSession {
  return viewOf(state, createSessionCore(state), options);
}
