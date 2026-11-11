/** `T` with every property, element and nested value read-only. */
export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

type Container = Record<string, unknown>;

/** A plain object (of `Object.prototype` or no prototype) or an array: what the walks below copy and freeze. */
const isPlainContainer = (value: unknown): value is Container => {
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

/** A shallow copy of `value` with the same prototype; spreading defines `__proto__` as a plain key. */
const shallow = (value: Container): Container => {
  if (Array.isArray(value)) return Object.assign([], value);
  return Object.getPrototypeOf(value) === null
    ? Object.assign(Object.create(null), value)
    : { ...value };
};

/**
 * A frozen copy of every plain object and array in `value`: the event a host fires stays its own
 * and can still change after the hooks ran. Walks without recursion (an event can nest tens of
 * thousands of levels); a container met twice, or a cycle, is copied once. Anything that is not
 * plain data (a function, a class instance, a typed array) is shared as it is, like `deepFreeze`.
 */
export function frozenCopy<T>(value: T): DeepReadonly<T> {
  if (!isPlainContainer(value)) return deepFreeze(value);
  const copies = new Map<Container, Container>();
  const pending: Container[] = [];
  const copyOf = (original: Container): Container => {
    const known = copies.get(original);
    if (known) return known;
    const made = shallow(original);
    copies.set(original, made);
    pending.push(made);
    return made;
  };
  const root = copyOf(value);
  for (let current = pending.pop(); current; current = pending.pop()) {
    for (const [key, child] of Object.entries(current)) {
      if (isPlainContainer(child)) current[key] = copyOf(child);
    }
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- `root` is a copy of `value` with the same plain shape
  return deepFreeze(root as T);
}
