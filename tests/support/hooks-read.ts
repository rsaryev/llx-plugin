/** Helpers for the tests of `readHooksFile` and `readHooksSettings`. */
import type { HooksRead } from '../../src/format/index.ts';

/** A hooks file around an event map. */
export const file = (hooks: unknown) => ({ hooks });

export const errorsOf = (result: HooksRead) =>
  result.issues.filter((found) => found.severity === 'error');

export const warningsOf = (result: HooksRead) =>
  result.issues.filter((found) => found.severity === 'warning');

/** The first handler of the first group of `PreToolUse`, as an untyped value to compare. */
export const firstHandler = (result: HooksRead): unknown => result.hooks.PreToolUse?.[0]?.hooks[0];

/** Widens a value to `unknown` so a test compares it with a plain literal. */
export const plain = (value: unknown): unknown => value;

/** A command handler that is valid on its own. */
export const command = { type: 'command', command: '/path/to/lint-check.sh' };
