import type { HookSourceKind, RegisteredHandler } from '../contracts.ts';

/**
 * hooks.md, "Hook handler fields": "If you define the same handler in more than one settings file,
 * it runs once. A plugin's or skill's copy of the same handler stays separate." So only handlers
 * from settings are merged; every other source keeps its copy.
 */
const MERGES: { readonly [K in HookSourceKind]: boolean } = {
  settings: true,
  plugin: false,
  skill: false,
  agent: false,
  session: false,
};

/** Rewrites an object with its keys in order, so the same fields written in another order compare equal. */
const sortKeys = (_key: string, value: unknown): unknown =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(
        Object.entries(value).toSorted(([left], [right]) => (left < right ? -1 : 1)),
      )
    : value;

/** Judgment (spec/judgments.md): identical means the same event, matcher text and handler fields. */
const identity = (entry: RegisteredHandler): string =>
  JSON.stringify([entry.event, entry.matcher ?? '', entry.handler], sortKeys);

/** The entries with each settings handler kept once, the first in registry order. */
export function dedupeSettingsHandlers(
  entries: readonly RegisteredHandler[],
): readonly RegisteredHandler[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (!MERGES[entry.source.kind]) return true;
    const key = identity(entry);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
