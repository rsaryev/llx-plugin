import type { HookRegistry, RegisteredHandler } from './contracts.ts';

/** An immutable registry; `with` appends, `without` drops by id, each returning a new one. */
export function createHookRegistry(entries: readonly RegisteredHandler[]): HookRegistry {
  return {
    entries,
    with: (more) => createHookRegistry([...entries, ...more]),
    without: (ids) => createHookRegistry(entries.filter((entry) => !ids.includes(entry.id))),
  };
}
