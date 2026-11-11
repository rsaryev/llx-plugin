/** Helpers for the tests of `readCommand` and `readCommandEntry`. */
import type { CommandRead } from '../../src/format/command.ts';
import type { Command, SkillOrigin } from '../../src/format/skill-types.ts';

export const PLUGIN: SkillOrigin = { kind: 'plugin', plugin: 'my-plugin' };
export const ctx = { origin: PLUGIN };

/** The command of a read that must have loaded. */
export function loaded(read: CommandRead): Command {
  if (read.command === undefined) {
    throw new Error(read.issues.map((found) => found.message).join('; '));
  }
  return read.command;
}
