import { z } from 'zod';
import type { ModsNamespaceApi } from '../types.ts';
import { assertLoaded, call, parse, type Deps } from './call.ts';
import { nameProblem } from './names.ts';
import { refusing } from './refusal.ts';
import { toolFullName } from './registries.ts';

/**
 * The registration of `$.tool.register` (api.md, "Add a tool"; `ToolSpec`, claude-code/index.d.ts:3245):
 * `inputSchema` `{ type: "object" }` when left out.
 */
const registration = z.looseObject({
  name: z.string(),
  description: z.string(),
  inputSchema: z.record(z.string(), z.unknown()).default({ type: 'object' }),
  isDeferred: z.boolean().optional(),
});

/** A tool call: `{ tool, ...arguments }` (events.md, "Guard or change a tool call"). */
const toolCall = z.looseObject({ tool: z.string() });
const toolCheck = z.looseObject({ tool: z.string(), input: z.record(z.string(), z.unknown()) });

/** Resolves `{ tool }`, the registered tool's full name `mcp__<plugin>__<name>` (:3246). */
function register(deps: Deps, event: unknown): { tool: string } {
  const def = parse('$.tool.register', registration, event);
  const problem = nameProblem('tool', def.name);
  if (problem !== undefined) throw new Error(`$.tool.register: ${problem}`);
  const fullName = toolFullName(deps.plugin, def.name);
  deps.registries.tools.set(fullName, { ...def, plugin: deps.plugin, fullName });
  return { tool: fullName };
}

export function toolApi(deps: Deps): ModsNamespaceApi<'tool'> {
  return {
    register: async (...args) => {
      assertLoaded(deps, 'tool.register');
      return call(deps, 'tool.register', parse('$.tool.register', registration, args[0]), (e) =>
        Promise.resolve(register(deps, e)),
      );
    },
    call: async (...args) =>
      call(
        deps,
        'tool.call',
        parse('$.tool.call', toolCall, args[0]),
        refusing(deps, 'tool.call', (e) =>
          deps.ports.tools.call(
            parse('$.tool.call', toolCall, e),
            deps.signal,
            async () => (await deps.gate.refusal()) !== undefined,
          ),
        ),
      ),
    check: async (...args) =>
      call(deps, 'tool.check', parse('$.tool.check', toolCheck, args[0]), (e) =>
        deps.ports.tools.check(parse('$.tool.check', toolCheck, e), deps.signal),
      ),
    list: async () =>
      call(deps, 'tool.list', {}, () =>
        Promise.resolve(
          deps.registries.tools
            .list()
            .map(({ fullName, description, inputSchema, isDeferred }) => ({
              name: fullName,
              description,
              inputSchema,
              ...(isDeferred === undefined ? {} : { isDeferred }),
            })),
        ),
      ),
  };
}
