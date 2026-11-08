/** `T` with every property, element and nested value read-only. */
export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

const isPlainContainer = (value: unknown): value is object => {
  if (typeof value !== 'object' || value === null) return false;
  if (Array.isArray(value)) return true;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

/**
 * Freezes `value` and every plain object and array inside it, in place, and returns it. Walks
 * without recursion (an event can nest tens of thousands of levels) and skips what is frozen
 * already, so a cycle or a shared object is visited once. Anything that is not plain data (a
 * function, a class instance, a typed array) is left as it is.
 */
export function deepFreeze<T>(value: T): DeepReadonly<T> {
  const stack: unknown[] = [value];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!isPlainContainer(current) || Object.isFrozen(current)) continue;
    Object.freeze(current);
    for (const child of Object.values(current)) stack.push(child);
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the type says what the walk did: every plain container reachable from `value` is frozen now
  return value as DeepReadonly<T>;
}
