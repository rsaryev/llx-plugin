import type { Invocable } from '../skills/index.ts';
import type { InvocableHead } from '../format/skill-types.ts';
import type { FolderEntry } from './session-folders.ts';
import type { ActivePlugin, HostState } from './state.ts';

/** A plugin's skill or command, or one of the folders' (`plugin` absent). */
export interface Entry extends FolderEntry {
  readonly plugin?: ActivePlugin;
}

const folderName = (dir: string): string =>
  dir.slice(Math.max(dir.lastIndexOf('/'), dir.lastIndexOf('\\')) + 1);

/**
 * The name a plugin skill's frontmatter `name` also gives it without the plugin prefix: "The bare
 * `/fancy` also invokes the skill unless another command already uses that name" (skills.md, "How a
 * skill gets its command name"). A skill that keeps its folder's name has no bare name (judgment: the
 * docs state it for a `name`), and neither has a plugin's root `SKILL.md`.
 */
function bareName(invocable: InvocableHead): string | undefined {
  const { origin } = invocable;
  if (!('plugin' in origin) || origin.rootSkill === true || !('dir' in invocable)) return undefined;
  const bare = invocable.command.slice(`${origin.plugin}:`.length);
  return bare === folderName(invocable.dir) ? undefined : bare;
}

const ENTRIES = new WeakMap<HostState, readonly Entry[]>();

export function entriesOf(state: HostState): readonly Entry[] {
  const cached = ENTRIES.get(state);
  if (cached !== undefined) return cached;
  // Oracle 2.1.319: a command, not a skill, wins a plugin-local name collision.
  const entries = state.active.flatMap((plugin) => {
    const commands = new Set(plugin.catalog.commands.map((command) => command.command));
    const skills = plugin.catalog.skills.filter((skill) => !commands.has(skill.command));
    // A plugin's Markdown is read at load (`readCatalog`), so its body is already in hand.
    return [...skills, ...plugin.catalog.commands].map((invocable) => ({
      plugin,
      invocable,
      names: [invocable.command],
      readBody: () => Promise.resolve(invocable.body),
    }));
  });
  const used = new Set(entries.map((entry) => entry.invocable.command));
  const named = entries.map((entry) => {
    const bare = bareName(entry.invocable);
    if (bare === undefined || used.has(bare)) return entry;
    used.add(bare);
    return { ...entry, names: [...entry.names, bare] };
  });
  ENTRIES.set(state, named);
  return named;
}

export const invocablesOf = (entries: readonly Entry[]): readonly Invocable[] =>
  entries.map((entry) => entry.invocable);
