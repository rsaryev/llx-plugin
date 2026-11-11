import type { HookRegistry, RegisteredHandler } from './contracts.ts';

/** An immutable registry; `with` appends, `without` drops by id, each returning a new one (itself when nothing changes). */
export function createHookRegistry(entries: readonly RegisteredHandler[]): HookRegistry {
  const registry: HookRegistry = {
    entries,
    with: (more) => (more.length === 0 ? registry : createHookRegistry([...entries, ...more])),
    without: (ids) => {
      if (ids.length === 0) return registry;
      const dropped = new Set(ids);
      return createHookRegistry(entries.filter((entry) => !dropped.has(entry.id)));
    },
  };
  return registry;
}
