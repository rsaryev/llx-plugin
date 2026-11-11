import type { Invocable } from './invocation.ts';

/**
 * Which skill a typed or called name invokes. A skill answers to its listed command and to its other
 * names: a plugin skill's bare name (skills.md, "How a skill gets its command name"), a folder skill's
 * directory-qualified and alias names. One lookup serves the `/` prompt, the model's Skill call and a
 * subagent's `skills` list, so a name that runs a skill one way runs it every way.
 */

/** A catalog row: the skill and every name that invokes it, the listed command first. */
export interface NamedInvocable {
  readonly invocable: Invocable;
  readonly names: readonly string[];
}

export interface SkillLookup<E extends NamedInvocable> {
  /** The row a name invokes, or undefined. */
  find(name: string): E | undefined;
  /** Every name that invokes a row. */
  readonly names: ReadonlySet<string>;
}

/**
 * The rows by name. Judgment (spec/judgments.md): a listed command wins over another row's alias of
 * the same text, and among aliases the earlier row wins.
 */
export function skillLookup<E extends NamedInvocable>(rows: readonly E[]): SkillLookup<E> {
  const byName = new Map<string, E>();
  const claim = (name: string, row: E): void => {
    if (!byName.has(name)) byName.set(name, row);
  };
  for (const row of rows) claim(row.invocable.command, row);
  for (const row of rows) for (const name of row.names) claim(name, row);
  return { find: (name) => byName.get(name), names: new Set(byName.keys()) };
}
