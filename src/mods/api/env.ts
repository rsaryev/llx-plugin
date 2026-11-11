import { z } from 'zod';
import type { ModsNamespaceApi } from '../types.ts';
import { call, parse, type Deps } from './call.ts';

const get = z.looseObject({ name: z.string() });
const set = z.looseObject({ name: z.string(), value: z.string().optional() });

/** `$.env`: `get` and `set` environment variables (api.md, "Reach files, processes, and the network"). */
export const envApi = (deps: Deps): ModsNamespaceApi<'env'> => ({
  get: async (...args) =>
    call(deps, 'env.get', { name: parse('$.env.get', z.string(), args[0]) }, (e) =>
      Promise.resolve(deps.ports.env.get(parse('$.env.get', get, e).name)),
    ),
  // `set(name, value)`: `value` undefined unsets it; `{}` once set or unset (claude-code/index.d.ts:3845).
  set: async (...args) =>
    call(
      deps,
      'env.set',
      {
        name: parse('$.env.set', z.string(), args[0]),
        ...(args[1] === undefined ? {} : { value: parse('$.env.set', z.string(), args[1]) }),
      },
      (e) => {
        const { name, value } = parse('$.env.set', set, e);
        deps.ports.env.set(name, value);
        return Promise.resolve({});
      },
    ),
});
