/**
 * The helpers a hooks module imports from `claude-code` to use `$.state` (interface.md, "Define,
 * read, and write a value"): `atom` names a value and its default, `read` returns it, `update`
 * writes a new one from the old. `derive` and `memberOf` are named by the docs and described
 * nowhere, so the kit does not offer them.
 */

/** `{ plugin, key }` as the type declaration file names a value. */
export interface AtomKey {
  readonly plugin: string;
  readonly key: string;
}

export interface Atom<T> extends AtomKey {
  readonly initial: T;
}

/** What the helpers need of `$`: its `state` namespace. */
export interface StateHost {
  readonly state: {
    get(key: AtomKey): unknown;
    set(key: AtomKey, value: unknown): unknown;
  };
}

export const atom = <T>(key: AtomKey, initial: T): Atom<T> =>
  Object.freeze({ plugin: key.plugin, key: key.key, initial });

/** The value, or the atom's default while nothing was written. */
export async function read<T>($: StateHost, value: Atom<T>): Promise<T> {
  const stored = await $.state.get({ plugin: value.plugin, key: value.key });
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the type declaration file says what the key holds
  return stored === undefined ? value.initial : (stored as T);
}

export async function update<T>(
  $: StateHost,
  value: Atom<T>,
  change: (current: T) => T,
): Promise<void> {
  const next = change(await read($, value));
  await $.state.set({ plugin: value.plugin, key: value.key }, next);
}
