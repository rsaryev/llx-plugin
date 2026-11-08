import { z } from 'zod';
import type { ModsNamespaceApi } from '../types.ts';
import { call, parse, type Deps } from './call.ts';

const set = z.looseObject({ key: z.string(), value: z.unknown() });

/** `$.config`: the `/config` rows, and a change to one, which a `config.set` hook can change or refuse. */
export const configApi = (deps: Deps): ModsNamespaceApi<'config'> => ({
  list: async () => call(deps, 'config.list', {}, () => deps.ports.config.list()),
  set: async (...args) =>
    call(
      deps,
      'config.set',
      { key: parse('$.config.set', z.string(), args[0]), value: args[1] },
      (e) => {
        const { key, value } = parse('$.config.set', set, e);
        return deps.ports.config.set(key, value);
      },
    ),
});
