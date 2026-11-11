import { canonicalJson } from '../format/canonical-json.ts';

/**
 * The lists as one, each entry once, first occurrence kept, so the highest file's entries come
 * first: two entries are one when their canonical text is the same (managed-settings.md, "Split a
 * file-based policy across teams": the lists combine "with duplicates removed"). The one union of
 * the settings layer.
 */
export function unionOf<E>(lists: readonly (readonly E[])[]): E[] {
  const seen = new Set<string>();
  return lists.flat().filter((entry) => {
    const identity = canonicalJson(entry);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}
