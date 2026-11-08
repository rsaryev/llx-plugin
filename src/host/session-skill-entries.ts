import type { Command, Skill } from '../format/skill-types.ts';
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
function bareName(invocable: Skill | Command): string | undefined {
  const { origin } = invocable;
  if (!('plugin' in origin) || origin.rootSkill === true || !('dir' in invocable)) return undefined;
  const bare = invocable.command.slice(`${origin.plugin}:`.length);
  return bare === folderName(invocable.dir) ? undefined : bare;
}

export function pluginEntries(state: HostState): readonly Entry[] {
  const entries = state.active.flatMap((plugin) =>
    [...plugin.catalog.skills, ...plugin.catalog.commands].map((invocable) => ({
      plugin,
      invocable,
      names: [invocable.command],
    })),
  );
  const used = new Set(entries.map((entry) => entry.invocable.command));
  return entries.map((entry) => {
    const bare = bareName(entry.invocable);
    if (bare === undefined || used.has(bare)) return entry;
    used.add(bare);
    return { ...entry, names: [...entry.names, bare] };
  });
}
