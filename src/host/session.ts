import type { HostState } from './state.ts';
import { createComponentPart, type ComponentPart } from './session-components.ts';
import { createHookPart, type HookPart } from './session-hooks.ts';
import { createSkillPart, type SkillPart } from './session-skills.ts';
import type { SessionOptions } from './types.ts';

/**
 * One session over the host's plugins: what to list and expand, the hooks to dispatch, and the
 * components to resolve. Each part is its own file; this only puts them together.
 */
export type PluginSession = SkillPart & HookPart & ComponentPart;

export function openSession(state: HostState, options: SessionOptions): PluginSession {
  const hooks = createHookPart(state, options);
  const hookPart: HookPart = {
    hookEnvironment: hooks.hookEnvironment,
    dispatch: (event, facts, run) => hooks.dispatch(event, facts, run),
  };
  return {
    ...createSkillPart(state, options, hooks),
    ...hookPart,
    ...createComponentPart(state),
  };
}
