import type { PluginStateStore, StateStoreFailure } from '../../src/ports/marketplace.ts';

/**
 * A `PluginStateStore` over a record of name to text. It records every write in order, so a test
 * sees what was written and in which sequence; `failing` names files whose write or removal
 * fails; `modified` gives the time a file was last written (a write sets it to `now()`).
 */
export function memoryStateStore(
  files: Record<string, string> = {},
  failing: readonly string[] = [],
  modified: Record<string, number> = {},
  now: () => number = () => 0,
): PluginStateStore & {
  readonly files: Record<string, string>;
  readonly writes: { readonly name: string; readonly text: string }[];
  readonly removals: string[];
} {
  const writes: { name: string; text: string }[] = [];
  const removals: string[] = [];
  return {
    files,
    writes,
    removals,
    read: (name) => Promise.resolve(Object.hasOwn(files, name) ? files[name] : undefined),
    write: (name, text) => {
      if (failing.includes(name)) {
        const failure: StateStoreFailure = { failure: 'write', message: `cannot write ${name}` };
        return Promise.resolve(failure);
      }
      writes.push({ name, text });
      files[name] = text;
      modified[name] = now();
      return Promise.resolve(undefined);
    },
    names: () => Promise.resolve(Object.keys(files)),
    modifiedAt: (name) =>
      Promise.resolve(Object.hasOwn(modified, name) ? modified[name] : undefined),
    remove: (name) => {
      if (failing.includes(name)) {
        const failure: StateStoreFailure = { failure: 'remove', message: `cannot remove ${name}` };
        return Promise.resolve(failure);
      }
      removals.push(name);
      delete files[name];
      delete modified[name];
      return Promise.resolve(undefined);
    },
  };
}
