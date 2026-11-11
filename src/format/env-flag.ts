/**
 * An on/off environment variable (env-vars.md, "Variables"): "set `1`, `true`, `yes`, or `on` to
 * turn it on and `0`, `false`, `no`, or `off` to turn it off, in any casing." Surrounding blanks
 * are ignored (judgment, spec/judgments.md). A variable read only for being set at all ("any
 * non-empty value including `0`") is not one of these: its reader tests for a non-empty value.
 */

const ON: ReadonlySet<string> = new Set(['1', 'true', 'yes', 'on']);
const OFF: ReadonlySet<string> = new Set(['0', 'false', 'no', 'off']);

const spelling = (value: string | undefined): string => (value ?? '').trim().toLowerCase();

/** Whether the value turns the switch on; anything but the four on spellings, unset included, does not. */
export const isTruthyEnv = (value: string | undefined): boolean => ON.has(spelling(value));

/** Whether the value turns the switch off by one of the four off spellings (unset and empty are neither). */
export const isFalsyEnv = (value: string | undefined): boolean => OFF.has(spelling(value));
