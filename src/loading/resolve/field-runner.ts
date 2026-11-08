import type { PluginIssue } from '../../format/issues.ts';
import type { Substituter } from './substitute.ts';
import { SURFACE_POLICY, type Surface } from './surfaces.ts';

/** A substituted value with the issues its references raised. */
export interface Part<T> {
  readonly value: T;
  readonly issues: PluginIssue[];
}

/**
 * Substitutes the strings of one component config, each with the policy of the surface it belongs
 * to. One substituter serves all fields, so the data folder is asked for once.
 */
export function fieldRunner(run: Substituter, base: string) {
  const one = async (surface: Surface, template: string, field: string): Promise<Part<string>> => {
    const done = await run.run(template, SURFACE_POLICY[surface], `${base}.${field}`);
    return { value: done.text, issues: [...done.issues] };
  };
  const list = async (
    surface: Surface,
    templates: readonly string[],
    field: string,
  ): Promise<Part<string[]>> => {
    const parts = await Promise.all(templates.map((each) => one(surface, each, field)));
    return { value: parts.map((part) => part.value), issues: parts.flatMap((part) => part.issues) };
  };
  const table = async (
    surface: Surface,
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
    };
  };
  return { one, list, table };
}

/** `use(value)` for a field the server has, `undefined` for one it does not. */
export const when = <T, R>(value: T | undefined, use: (present: T) => R): R | undefined =>
  value === undefined ? undefined : use(value);

export const fieldOf = <T>(part: Part<T> | undefined, field: string): Record<string, T> =>
  part ? { [field]: part.value } : {};
