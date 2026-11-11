import type { RegisteredHandler } from '../contracts.ts';
import { SOURCE_POLICY } from '../source-kind.ts';
import { canonicalJson } from '../../format/canonical-json.ts';

/** Judgment (spec/judgments.md): identical means the same event, matcher text and handler fields. */
const identity = (entry: RegisteredHandler): string =>
  canonicalJson([entry.event, entry.matcher ?? '', entry.handler]);

/** The entries with each settings handler kept once, the first in registry order. */
export function dedupeSettingsHandlers(
  entries: readonly RegisteredHandler[],
): readonly RegisteredHandler[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (!SOURCE_POLICY[entry.source.kind].mergesCopies) return true;
    const key = identity(entry);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
