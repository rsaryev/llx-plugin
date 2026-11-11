import type { PluginIssue } from '../../format/issues.ts';
import type { TokenReference, Unresolved } from './substitute.ts';
import type { Substituter } from './substituter.ts';
import { surfacePolicy, type SubstitutionSurface } from './surfaces.ts';

/** A substituted value with the issues its references raised. */
export interface Part<T> {
  readonly value: T;
  readonly issues: PluginIssue[];
  /** What stayed as written (`Substituted.unresolved`). */
  readonly unresolved: Unresolved;
  /** What the strings referenced (`Substituted.referenced`), in order. */
  readonly referenced: readonly TokenReference[];
}

/** What several fields left unresolved, each name once. */
export const mergeUnresolved = (all: readonly Unresolved[]): Unresolved => ({
  variables: [...new Set(all.flatMap((each) => each.variables))],
  options: [...new Set(all.flatMap((each) => each.options))],
});

/**
 * Substitutes the strings of one component config, each with the policy of the surface it belongs
 * to. One substituter serves all fields, so the data folder is asked for once.
 */
export function fieldRunner(run: Substituter, base: string) {
  const one = async (
    surface: SubstitutionSurface,
    template: string,
    field: string,
  ): Promise<Part<string>> => {
    const done = await run.run(template, surfacePolicy(surface, run.scope), `${base}.${field}`);
    return {
      value: done.text,
      issues: [...done.issues],
      unresolved: done.unresolved,
      referenced: done.referenced,
    };
  };
  const list = async (
    surface: SubstitutionSurface,
    templates: readonly string[],
    field: string,
  ): Promise<Part<string[]>> => {
    // Each element is named by its index, as a hook's `args[i]`.
    const parts = await Promise.all(
      templates.map((each, index) => one(surface, each, `${field}[${index}]`)),
    );
    return {
      value: parts.map((part) => part.value),
      issues: parts.flatMap((part) => part.issues),
      unresolved: mergeUnresolved(parts.map((part) => part.unresolved)),
      referenced: parts.flatMap((part) => part.referenced),
    };
  };
  const table = async (
    surface: SubstitutionSurface,
    entries: Readonly<Record<string, string>>,
    field: string,
  ): Promise<Part<Record<string, string>>> => {
    const parts = await Promise.all(
      Object.entries(entries).map(
        async ([key, each]) => [key, await one(surface, each, `${field}.${key}`)] as const,
      ),
    );
    return {
      value: Object.fromEntries(parts.map(([key, part]) => [key, part.value])),
      issues: parts.flatMap(([, part]) => part.issues),
      unresolved: mergeUnresolved(parts.map(([, part]) => part.unresolved)),
      referenced: parts.flatMap(([, part]) => part.referenced),
    };
  };
  return { one, list, table };
}

/** `use(value)` for a field the server has, `undefined` for one it does not. */
export const when = <T, R>(value: T | undefined, use: (present: T) => R): R | undefined =>
  value === undefined ? undefined : use(value);

export const fieldOf = <T>(part: Part<T> | undefined, field: string): Record<string, T> =>
  part ? { [field]: part.value } : {};
