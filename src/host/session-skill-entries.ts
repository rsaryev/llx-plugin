import type { Command, Skill } from '../format/skill-types.ts';
import type { Invocable } from '../skills/index.ts';
import type { ActivePlugin, HostState } from './state.ts';

/** One skill or command of the active plugins, with the plugin it came from. */
export interface Entry {
  readonly plugin: ActivePlugin;
  readonly invocable: Skill | Command;
}

const ENTRIES = new WeakMap<HostState, readonly Entry[]>();

/** The entries of one state, made once: a state is immutable, and a new one comes with each update. */
export function entriesOf(state: HostState): readonly Entry[] {
  const cached = ENTRIES.get(state);
  if (cached !== undefined) return cached;
  const entries = state.active.flatMap((plugin) =>
    [...plugin.catalog.skills, ...plugin.catalog.commands].map((invocable) => ({
      plugin,
      invocable,
    })),
  );
  ENTRIES.set(state, entries);
  return entries;
}

export const invocablesOf = (entries: readonly Entry[]): readonly Invocable[] =>
  entries.map((entry) => entry.invocable);
