import type { Command, Skill } from '../format/skill-types.ts';
import type { Invocable } from '../skills/index.ts';
import type { ActivePlugin, HostState } from './state.ts';

/** One skill or command of the active plugins, with the plugin it came from. */
export interface Entry {
  readonly plugin: ActivePlugin;
  readonly invocable: Skill | Command;
}

export const entriesOf = (state: HostState): readonly Entry[] =>
  state.active.flatMap((plugin) =>
    [...plugin.catalog.skills, ...plugin.catalog.commands].map((invocable) => ({
      plugin,
      invocable,
    })),
  );

export const invocablesOf = (entries: readonly Entry[]): readonly Invocable[] =>
  entries.map((entry) => entry.invocable);
