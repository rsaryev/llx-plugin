import { z } from 'zod';
import type { ModsNamespaceApi } from '../types.ts';
import { call, parse, pluginOrigin, type Deps } from './call.ts';

/** `$.config.set({ key, value })` (claude-code/index.d.ts:3323): the key as `list` names it, a value of the row's kind. */
const set = z.looseObject({
  key: z.string(),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
});

const row = z.looseObject({
  key: z.string(),
  value: z.unknown().optional(),
  provider: z.unknown().optional(),
});

/**
 * What the `config.set` event pins of the row (claude-code/index.d.ts:2108): `previous`, what it
 * holds before the change, and `provider`, the plugin and tier that offer it, as `list` reads them;
 * none for a key `list` has no row of, which the host refuses.
 */
async function rowFacts(deps: Deps, key: string): Promise<Readonly<Record<string, unknown>>> {
  const found = (await deps.ports.config.list()).find(
    (one) => row.safeParse(one).data?.key === key,
  );
  const { value, provider } = row.safeParse(found).data ?? {};
  return {
    ...(value === undefined ? {} : { previous: value }),
    ...(provider === undefined ? {} : { provider }),
  };
}

/**
 * `$.config`: the `/config` rows, and a change to one, which a `config.set` hook can change or
 * refuse; the change resolves `{ value }` once written, or `{ deny }` (:3319).
 */
export const configApi = (deps: Deps): ModsNamespaceApi<'config'> => ({
  list: async () => call(deps, 'config.list', {}, () => deps.ports.config.list()),
  set: async (...args) => {
    const given = parse('$.config.set', set, args[0]);
    const input = { ...given, ...(await rowFacts(deps, given.key)), origin: pluginOrigin(deps) };
    return call(deps, 'config.set', input, async (e) => {
      const { key, value } = parse('$.config.set', set, e);
      return (await deps.ports.config.set(key, value)) ?? { value };
    });
  },
});
