import { z } from 'zod';
import type { ModsNamespaceApi } from '../types.ts';
import { assertLoaded, call, parse, type Deps } from './call.ts';
import { nameProblem } from './names.ts';
import { refusing } from './refusal.ts';
import { AGENT_STATUSES } from '../../protocol/mods-api-names.ts';

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

/** A row of `$.agent.list()`: each has a `status` the reference lists (reference.md, "Mods API methods"). */
const listed = z.array(z.looseObject({ status: z.enum(AGENT_STATUSES) }));

function register(deps: Deps, event: unknown): void {
  const { name, ...definition } = parse('$.agent.register', registration, event);
  const problem = nameProblem('subagent type', name);
  if (problem !== undefined) throw new Error(`$.agent.register: ${problem}`);
  deps.registries.agents.set(name, { plugin: deps.plugin, name, definition });
}

export function agentApi(deps: Deps): ModsNamespaceApi<'agent'> {
  return {
    register: async (...args) => {
      assertLoaded(deps, 'agent.register');
      return call(deps, 'agent.register', parse('$.agent.register', registration, args[0]), (e) =>
        Promise.resolve(register(deps, e)),
      );
    },
    // A refused spawn resolves with `{ deny: reason }` and starts no subagent (api.md, "What refused calls return").
    spawn: async (...args) => {
      const request = parse('$.agent.spawn', spawnRequest, args[0]);
      return deps.replay.once(deps.plugin, 'agent.spawn', () =>
        call(
          deps,
          'agent.spawn',
          request,
          refusing(deps, 'agent.spawn', (e) =>
            deps.ports.agents.spawn(parse('$.agent.spawn', spawnRequest, e), deps.signal),
          ),
        ),
      );
    },
    // Judgment: a row whose `status` the reference does not list is a host that drifted, so the call rejects.
    list: async () =>
      call(deps, 'agent.list', {}, async () =>
        parse('$.agent.list', listed, await deps.ports.agents.list()),
      ),
  };
}
