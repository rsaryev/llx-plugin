/**
 * A function of a text key that keeps its last `limit` answers, so a pattern, a glob set or a
 * command line read once is not read again for the next rule or the next gate of the same call.
 * The answers must be pure functions of the key.
 */
export function memoize<V>(make: (key: string) => V, limit = 256): (key: string) => V {
  const cache = new Map<string, { readonly value: V }>();
  return (key) => {
    const hit = cache.get(key);
    if (hit !== undefined) return hit.value;
    if (cache.size >= limit) {
      const oldest = cache.keys().next();
      if (oldest.done !== true) cache.delete(oldest.value);
    }
    const value = make(key);
    cache.set(key, { value });
    return value;
  };
}
