import type { PluginStateStore, StateStoreFailure } from '../../src/ports/marketplace.ts';

/**
 * A `PluginStateStore` over a record of name to text. It records every write in order, so a test
 * sees what was written and in which sequence; `failing` names files whose write fails.
 */
export function memoryStateStore(
  files: Record<string, string> = {},
  failing: readonly string[] = [],
): PluginStateStore & {
  readonly files: Record<string, string>;
  readonly writes: { readonly name: string; readonly text: string }[];
} {
  const writes: { name: string; text: string }[] = [];
  return {
    files,
    writes,
    read: (name) => Promise.resolve(Object.hasOwn(files, name) ? files[name] : undefined),
    write: (name, text) => {
      if (failing.includes(name)) {
        const failure: StateStoreFailure = { failure: 'write', message: `cannot write ${name}` };
        return Promise.resolve(failure);
      }
      writes.push({ name, text });
      files[name] = text;
      return Promise.resolve(undefined);
    },
    names: () => Promise.resolve(Object.keys(files)),
  };
}
