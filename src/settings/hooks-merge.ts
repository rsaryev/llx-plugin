import type { HookHandler, HookMatcherGroup, HooksSettings } from '../protocol/hook-config.ts';
import { holdersOf, type SettingsLayer } from './layers.ts';

/**
 * The `hooks` key across settings files (settings-reference.md, `hooks`: "Hooks merge across files
 * rather than replacing each other, and hooks from managed settings can't be removed from other
 * files"; hooks.md, "Hook locations"). Every file's matcher groups are kept, per event, so a file
 * adds hooks and never takes one away. A handler defined in more than one file runs once (hooks.md,
 * "Hook handler fields"): the copy from the lower file is dropped. Running the hooks is the hooks
 * engine's; this only combines what the files define.
 */

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A value that has the shape of an event map (an object of arrays); the reader checks the rest. */
export const isHooksSettings = (value: unknown): value is HooksSettings =>
  isRecord(value) && Object.values(value).every(Array.isArray);

/** A JSON text of a value with its object keys sorted: two handlers equal in content, equal text. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (!isRecord(value)) return JSON.stringify(value) ?? 'undefined';
  const fields = Object.keys(value)
    .toSorted()
    .map((name) => `${JSON.stringify(name)}:${canonical(value[name])}`);
  return `{${fields.join(',')}}`;
}

/**
 * The matcher as a group key: `"*"`, `""` and an omitted matcher all match every occurrence of the
 * event (hooks.md, "Matcher patterns"), so they are one group. The grammar itself is `rules`'s
 * (`matchesMatcher`), which a module of the same layer cannot import.
 */
const matcherKey = (matcher: string | undefined): string =>
  matcher === undefined || matcher === '*' ? '' : matcher;

/** The handlers of the groups already kept for one event, by matcher: what a lower file repeats. */
type Seen = Map<string, Set<string>>;

function withoutRepeats(group: HookMatcherGroup, seen: Seen): HookMatcherGroup | undefined {
  const known = seen.get(matcherKey(group.matcher)) ?? new Set<string>();
  const fresh = group.hooks.filter((handler: HookHandler) => !known.has(canonical(handler)));
  // A group whose every handler a higher file already runs adds nothing.
  return fresh.length === 0 && group.hooks.length > 0 ? undefined : { ...group, hooks: fresh };
}

function remember(group: HookMatcherGroup, seen: Seen): void {
  const key = matcherKey(group.matcher);
  const known = seen.get(key) ?? new Set<string>();
  for (const handler of group.hooks) known.add(canonical(handler));
  seen.set(key, known);
}

/**
 * Combines the `hooks` of several files, highest precedence first: per event, the groups of the
 * highest file come first, then those of the next, and so on. Within one file nothing is dropped.
 */
export function mergeHookSettings(files: readonly HooksSettings[]): HooksSettings {
  const merged = new Map<string, HookMatcherGroup[]>();
  for (const file of files) {
    const added = new Map<string, HookMatcherGroup[]>();
    for (const [event, groups] of Object.entries(file)) {
      const kept = merged.get(event) ?? [];
      const seen: Seen = new Map();
      for (const group of kept) remember(group, seen);
      const fresh = groups.flatMap((group) => withoutRepeats(group, seen) ?? []);
      added.set(event, fresh);
    }
    for (const [event, fresh] of added) merged.set(event, [...(merged.get(event) ?? []), ...fresh]);
  }
  // `Object.fromEntries` defines own properties, so a JSON-parsed `__proto__` event stays an event.
  return Object.fromEntries(merged);
}

/** The hooks every settings layer defines, combined; empty when no layer sets any. */
export const mergeHooks = (layers: readonly SettingsLayer[]): HooksSettings =>
  mergeHookSettings(holdersOf(layers, 'hooks').map((holder) => holder.value));
