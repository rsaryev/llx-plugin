import type { ShellWord } from '../bash/words.ts';
import { absolutePath } from '../path/posix.ts';
import type { PathContext } from '../types.ts';
import type { ProtectedPathOptions } from './context.ts';

/** The state of the walk over a command's subcommands, in the order they run. */
export interface Walk {
  readonly paths: PathContext;
  readonly options: ProtectedPathOptions;
  /** Where the host's symlink check says the call's paths lead (`PreparedCall.resolvedPaths`). */
  readonly resolved: readonly string[];
  /** The directory later operands are read against: moved by a `cd`. */
  base: string;
  changedDirectory: boolean;
  usedGit: boolean;
}

export const hasUnquotedGlob = (words: readonly ShellWord[]): boolean =>
  words.some((word) => word.globs);

/** The absolute POSIX path of an operand, or `undefined` when a variable, substitution or glob hides it. */
export function operandPath(operand: ShellWord, walk: Walk): string | undefined {
  if (operand.value === '' || operand.expands || operand.globs) return undefined;
  return absolutePath(operand.value, { ...walk.paths, cwd: walk.base });
}

/**
 * Where a file-reading operand reads: the path itself, the directory a glob starts in, or
 * `undefined` for an operand whose value a variable or substitution hides.
 */
export function readPath(operand: ShellWord, walk: Walk): string | undefined {
  if (operand.expands) return undefined;
  const text = operand.value;
  const glob = operand.globs ? text.search(/[*?[]/) : -1;
  const literal = glob < 0 ? text : text.slice(0, text.lastIndexOf('/', glob) + 1) || '.';
  return absolutePath(literal, { ...walk.paths, cwd: walk.base });
}
