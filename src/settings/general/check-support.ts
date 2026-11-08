import type { PolicyScope } from '../layers.ts';

/**
 * What a settings file may hold under each general key, checked as Claude Code does ("Settings
 * Warning: only individual entries fail, such as a malformed permission rule or an unknown hook
 * event name. Claude Code skips those values and keeps the rest of the file in effect", settings.md,
 * "Fix a broken settings file"). A value of the wrong type is dropped with a warning that names
 * the key; a malformed entry of a list is skipped on its own. The types are the SDK's `Settings`
 * (docs/ARCHITECTURE.md, E2): these guards only read them at run time.
 */
export interface Found {
  /** Where inside the key (`.allow[1]`); empty for the key itself. */
  readonly at: string;
  readonly message: string;
}

export interface Checked {
  /** What stays of the value; `undefined` when the key is dropped. */
  readonly value: unknown;
  readonly found: readonly Found[];
  /** The key was present and unreadable and no value stands for it (`PolicyLayer.invalid`). */
  readonly invalid?: boolean;
}

export interface Context {
  readonly name: string;
  readonly scope: PolicyScope;
  /** The policy tier: an unreadable lock reads as its restrictive value. */
  readonly closed: boolean;
}

export type Check = (value: unknown, context: Context) => Checked;

export const keep = (value: unknown, found: readonly Found[] = []): Checked => ({ value, found });

export const drop = (name: string, expected: string): Checked => ({
  value: undefined,
  found: [{ at: '', message: `"${name}" must be ${expected}; the key is ignored` }],
});

/** The entries of a list that pass `valid`, and a note for each that does not. */
export function entriesOf(
  list: readonly unknown[],
  at: string,
  valid: (entry: unknown) => string | undefined,
): { readonly kept: readonly unknown[]; readonly found: readonly Found[] } {
  const results = list.map((entry, index) => ({ entry, problem: valid(entry), index }));
  return {
    kept: results.flatMap((one) => (one.problem === undefined ? [one.entry] : [])),
    found: results.flatMap((one) =>
      one.problem === undefined ? [] : [{ at: `${at}[${one.index}]`, message: one.problem }],
    ),
  };
}

export const notText = (name: string) => (entry: unknown) =>
  typeof entry === 'string' ? undefined : `"${name}" entries must be strings; the entry is skipped`;

/** `"key" was present but invalid; <effect>`: the report of a value that fails closed. */
export const closedFound = (name: string, effect: string, at = ''): Found => ({
  at,
  message: `"${name}" was present but invalid; ${effect}`,
});
