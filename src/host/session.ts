import type { HostState } from './state.ts';
import { createAgentPart, type AgentPart } from './session-agents.ts';
import { createComponentPart, type ComponentPart } from './session-components.ts';
import { createSessionDirectories } from './session-directories.ts';
import { createHookPart, type HookPart } from './session-hooks.ts';
import { createSkillPart, type SkillPart } from './session-skills.ts';
import type { SessionOptions } from './types.ts';

/**
 * One session over the host's plugins: what to list and expand, the hooks to dispatch, and the
 * components to resolve. Each part is its own file; this only puts them together.
 */
export type PluginSession = SkillPart & HookPart & ComponentPart & Omit<AgentPart, 'pluginOf'>;

export function openSession(state: HostState, options: SessionOptions): PluginSession {
  const directories = createSessionDirectories(options);
  const hooks = createHookPart(state, options, directories);
  const hookPart: HookPart = {
    dispatch: (event, facts, run) => hooks.dispatch(event, facts, run),
  };
  const agents = createAgentPart(state, options, directories);
  return {
    ...createSkillPart(state, options, { registrar: hooks, directories }),
    ...hookPart,
    ...createComponentPart(state, agents),
    reloadAgents: (reload) => agents.reloadAgents(reload),
    agentCatalog: (overrides) => agents.agentCatalog(overrides),
    selectAgent: (choice, overrides) => agents.selectAgent(choice, overrides),
  };
}
