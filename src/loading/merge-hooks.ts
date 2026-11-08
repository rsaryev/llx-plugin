import type { HookMatcherGroup, HooksSettings } from '../protocol/hook-config.ts';

/**
 * Joins the hooks of a plugin's sources: "Claude Code merges whatever you declare with
 * `hooks/hooks.json` when that file exists" and "Hooks in `hooks/hooks.json` and in the `hooks`
 * manifest key both load" (manifest-reference.md, "`hooks`"; components.md, "Hooks"). Judgment
 * (spec/judgments.md): merging is per event, the matcher groups of each source one after the other
 * in loading order (the default file first), so no source's hook is lost or overwritten.
 */
export function mergeHooks(sources: readonly HooksSettings[]): HooksSettings {
  const merged = new Map<string, HookMatcherGroup[]>();
  for (const source of sources) {
    for (const [event, groups] of Object.entries(source)) {
      merged.set(event, [...(merged.get(event) ?? []), ...groups]);
    }
  }
  // `fromEntries` defines own properties, so an event called `__proto__` stays a plain entry.
  return Object.fromEntries(merged);
}
