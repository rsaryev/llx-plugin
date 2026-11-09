/** The mods `DispatchOptions.only` and `ModChain.hears` name: one name, or a set of them. */
export type Only = string | ReadonlySet<string>;

/** Whether `name` is among the mods `only` names; no `only` names every mod. */
export const isAmong = (only: Only | undefined, name: string): boolean =>
  only === undefined || (typeof only === 'string' ? only === name : only.has(name));
