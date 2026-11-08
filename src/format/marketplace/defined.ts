/**
 * An object without its `undefined` values, so it can be spread over another without erasing what
 * the other holds, and satisfies `exactOptionalPropertyTypes` (an optional key is absent, never
 * `undefined`).
 */
export function defined<T extends object>(value: T): { [K in keyof T]?: Exclude<T[K], undefined> } {
  const kept: { [K in keyof T]?: Exclude<T[K], undefined> } = {};
  for (const key of Object.keys(value)) {
    const item: unknown = Reflect.get(value, key);
    // `Object.keys` loses the key type, so the copy goes through `Reflect`; only keys of objects the
    // readers build themselves reach here, never a key read from a file.
    if (item !== undefined) Reflect.set(kept, key, item);
  }
  return kept;
}
