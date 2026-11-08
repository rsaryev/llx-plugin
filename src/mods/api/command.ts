import { z } from 'zod';
import type { ModsNamespaceApi } from '../types.ts';
import { assertLoaded, call, parse, type Deps } from './call.ts';
import { nameProblem } from './names.ts';
import { droppedCommand, refusing, waitsInQueue } from './refusal.ts';

/** The registration of `$.command.register` (api.md, "Add a command"). */
const registration = z.looseObject({
  name: z.string(),
  description: z.string().optional(),
  argumentHint: z.string().optional(),
  immediate: z.boolean().optional(),
});

/** What `$.command.run` takes: `{ command, args }`; `args` is the text typed after the command's name. */
const run = z.looseObject({ command: z.string(), args: z.string().default('') });

/** The refusal the docs quote for a taken name: `"/focus" refused: it is the built-in /focus`. */
const builtInRefusal = (name: string): string => `"/${name}" refused: it is the built-in /${name}`;

function register(deps: Deps, event: unknown): void {
  const def = parse('$.command.register', registration, event);
  const problem = nameProblem('command', def.name);
  if (problem !== undefined) throw new Error(`$.command.register: ${problem}`);
  if (deps.ports.commands.builtIns().includes(def.name)) throw new Error(builtInRefusal(def.name));
  const taken = deps.registries.commands.get(def.name);
  // Judgment: the docs give the built-in case only; a name another mod has is refused the same way.
  if (taken && taken.plugin !== deps.plugin) {
    throw new Error(`"/${def.name}" refused: it is already registered by ${taken.plugin}`);
  }
  deps.registries.commands.set(def.name, { ...def, plugin: deps.plugin });
}

export function commandApi(deps: Deps): ModsNamespaceApi<'command'> {
  return {
    register: async (...args) => {
      assertLoaded(deps, 'command.register');
      return call(
        deps,
        'command.register',
        parse('$.command.register', registration, args[0]),
        (e) => Promise.resolve(register(deps, e)),
      );
    },
    run: async (...args) => {
      const request = parse('$.command.run', run, args[0]);
      return deps.replay.once(deps.plugin, 'command.run', () =>
        call(
          deps,
          'command.run',
          request,
          refusing(deps, 'command.run', async (e) => {
            const command = parse('$.command.run', run, e);
            return waitsInQueue(
              deps.gate.interrupted(),
              (queue) => deps.ports.commands.run(command, queue),
              droppedCommand(deps),
            );
          }),
        ),
      );
    },
    list: async () =>
      call(deps, 'command.list', {}, () =>
        Promise.resolve(
          deps.registries.commands.list().map(({ name, description, argumentHint }) => ({
            name,
            description,
            argumentHint,
          })),
        ),
      ),
  };
}
