/** Maps `items` through `work` with at most `size` running at once, keeping the input order. */
export async function pool<T, R>(
  items: readonly T[],
  size: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = Array.from({ length: items.length });
  let next = 0;
  const lane = async (): Promise<void> => {
    while (next < items.length) {
      const index = next;
      next += 1;
      const item = items[index];
      if (item !== undefined) results[index] = await work(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, lane));
  return results;
}
