import { z } from 'zod';
import { jsonBytes, toJsonValue, type JsonObject, type JsonValue } from '../../foundation/index.ts';
import { MOD_LIMITS } from '../../protocol/mods-limits.ts';
import type { ModsNamespaceApi } from '../types.ts';
import { call, parse, type Deps } from './call.ts';

/**
 * One change of the store at a time, for each store and plugin: a `set` or a `delete` reads the whole
 * store and writes it back, so two that overlap would each write the store as it was before the other
 * ("a `set` changes only its own key, so sessions that write different keys don't overwrite each
 * other", interface.md, "Save from more than one session"). Judgment: this keeps that true for every
 * session that shares the port in this process; sessions in other processes are the host's to guard
 * with a lock on the file its `ModStore` writes.
 */
const queues = new WeakMap<object, Map<string, Promise<unknown>>>();

function inTurn<T>(store: object, plugin: string, change: () => Promise<T>): Promise<T> {
  const byPlugin = queues.get(store) ?? new Map<string, Promise<unknown>>();
  queues.set(store, byPlugin);
  const done = (byPlugin.get(plugin) ?? Promise.resolve()).then(change, change);
  byPlugin.set(
    plugin,
    done.catch(() => undefined),
  );
  return done;
}

const keyEvent = z.looseObject({ key: z.string() });
const setEvent = z.looseObject({ key: z.string(), value: z.unknown() });

/** `value` when it is JSON: the stringify the host's file does would take it. A cycle, a function or a bigint is not. */
function jsonValue(label: string, value: unknown): JsonValue {
  const json = toJsonValue(value);
  if (json === undefined) throw new Error(`${label}: the value is not JSON`);
  return json;
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
          const json = jsonValue('$.store.set', value);
          return inTurn(store, deps.plugin, async () =>
            save({ ...(await store.read(deps.plugin)), [key]: json }),
          );
        },
      ),
    delete: async (...args) =>
      call(deps, 'store.delete', { key: parse('$.store.delete', z.string(), args[0]) }, (e) =>
        inTurn(store, deps.plugin, async () => {
          const { [parse('$.store.delete', keyEvent, e).key]: _gone, ...rest } = await store.read(
            deps.plugin,
          );
          return save(rest);
        }),
      ),
    keys: async () =>
      call(deps, 'store.keys', {}, async () => Object.keys(await store.read(deps.plugin))),
  };
}
