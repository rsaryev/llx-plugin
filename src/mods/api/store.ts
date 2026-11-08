import { z } from 'zod';
import { jsonBytes, type JsonObject, type JsonValue } from '../../foundation/index.ts';
import { MOD_LIMITS } from '../../protocol/mods-limits.ts';
import type { ModsNamespaceApi } from '../types.ts';
import { call, parse, type Deps } from './call.ts';

const keyEvent = z.looseObject({ key: z.string() });
const setEvent = z.looseObject({ key: z.string(), value: z.unknown() });

/** `value` when it is JSON: the stringify the host's file does would take it. A cycle, a function or a bigint is not. */
function jsonValue(label: string, value: unknown): JsonValue {
  if (jsonBytes(value) === undefined) throw new Error(`${label}: the value is not JSON`);
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the check above is the one JSON itself makes
  return value as JsonValue;
}

/**
 * `$.store`: a key-value store of the mod's own that every session shares (interface.md, "Keep
 * state"). `get` resolves to the value or `undefined`, `set` takes any JSON value, and the JSON of
 * the whole store may not pass 4 MiB (reference.md, "Limits"). A `get` then a `set` is not atomic.
 */
export function storeApi(deps: Deps): ModsNamespaceApi<'store'> {
  const { store } = deps.ports;
  const save = async (data: JsonObject): Promise<undefined> => {
    const bytes = jsonBytes(data);
    if (bytes === undefined || bytes > MOD_LIMITS.storeBytes) {
      throw new Error(`$.store: the store would pass ${MOD_LIMITS.storeBytes} bytes of JSON`);
    }
    await store.write(deps.plugin, data);
    return undefined;
  };
  return {
    get: async (...args) =>
      call(
        deps,
        'store.get',
        { key: parse('$.store.get', z.string(), args[0]) },
        async (e) => (await store.read(deps.plugin))[parse('$.store.get', keyEvent, e).key],
      ),
    set: async (...args) =>
      call(
        deps,
        'store.set',
        {
          key: parse('$.store.set', z.string(), args[0]),
          value: jsonValue('$.store.set', args[1]),
        },
        async (e) => {
          const { key, value } = parse('$.store.set', setEvent, e);
          return save({
            ...(await store.read(deps.plugin)),
            [key]: jsonValue('$.store.set', value),
          });
        },
      ),
    delete: async (...args) =>
      call(
        deps,
        'store.delete',
        { key: parse('$.store.delete', z.string(), args[0]) },
        async (e) => {
          const { [parse('$.store.delete', keyEvent, e).key]: _gone, ...rest } = await store.read(
            deps.plugin,
          );
          return save(rest);
        },
      ),
    keys: async () =>
      call(deps, 'store.keys', {}, async () => Object.keys(await store.read(deps.plugin))),
  };
}
