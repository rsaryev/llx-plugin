import { z } from 'zod';
import type { ModsNamespaceApi } from '../types.ts';
import { call, parse, type Deps } from './call.ts';
import { nameProblem } from './names.ts';

/**
 * The registration of `$.agent.register`: `name` is the subagent type, the rest is the SDK's
 * `AgentDefinition`. Judgment: the docs name the method and no fields, so `name` mirrors
 * `$.command.register` and `$.tool.register`, and the definition keeps the SDK's two required fields.
 */
const registration = z.looseObject({
  name: z.string(),
  description: z.string(),
  prompt: z.string(),
});

const spawnRequest = z.looseObject({});

function register(deps: Deps, event: unknown): void {
  const { name, ...definition } = parse('$.agent.register', registration, event);
  const problem = nameProblem('subagent type', name);
  if (problem !== undefined) throw new Error(`$.agent.register: ${problem}`);
  deps.registries.agents.set(name, { plugin: deps.plugin, name, definition });
}

export function agentApi(deps: Deps): ModsNamespaceApi<'agent'> {
  return {
    register: async (...args) =>
      call(deps, 'agent.register', parse('$.agent.register', registration, args[0]), (e) =>
        Promise.resolve(register(deps, e)),
      ),
    // A refused spawn resolves with `{ deny: reason }` and starts no subagent (api.md, "What refused calls return").
    spawn: async (...args) =>
      call(deps, 'agent.spawn', parse('$.agent.spawn', spawnRequest, args[0]), (e) =>
        deps.ports.agents.spawn(parse('$.agent.spawn', spawnRequest, e), deps.signal),
      ),
    list: async () => call(deps, 'agent.list', {}, () => deps.ports.agents.list()),
  };
}
