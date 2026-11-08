import { absolutePath } from '../path/posix.ts';
import type { PathContext } from '../types.ts';
import type { ProtectedPathOptions } from './context.ts';
import { expandHome } from './scope.ts';

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

const isQuoted = (word: string): boolean => /^["']/.test(word);
export const unquote = (word: string): string => word.replaceAll('"', '').replaceAll("'", '');

export const hasUnquotedGlob = (words: readonly string[]): boolean =>
  words.some((word) => !isQuoted(word) && /[*?[]/.test(word));

/**
 * A redirect to a file: a `>`, `>>` or `<` whose target is not `/dev/null`. Descriptor forms such
 * as `2>&1` and here-documents are not (permissions.md, "Redirections"); the targets that are files
 * are not checked against rules here, so such a command is simply not read-only (spec/judgments.md).
 */
export function redirectsToFile(words: readonly string[]): boolean {
  return words.some((word, index) => {
    if (isQuoted(word) || !/[<>]/.test(word) || /<</.test(word)) return false;
    if (/^\d*[<>]&(?:\d+|-)$/.test(word)) return false;
    const target = word.replace(/^.*?(?:&>|>>|>|<)/, '') || (words[index + 1] ?? '');
    return target !== '/dev/null';
  });
}

/** The absolute POSIX path of an operand, or `undefined` when a variable, substitution or glob hides it. */
export function operandPath(operand: string, walk: Walk): string | undefined {
  const text = unquote(operand);
  if (text === '' || /[$`*?[]/.test(text)) return undefined;
  return absolutePath(expandHome(text, walk.paths), { ...walk.paths, cwd: walk.base });
}

/**
 * Where a file-reading operand reads: the path itself, the directory a glob starts in, or
 * `undefined` for an operand whose value a variable or substitution hides (a single-quoted word is
 * literal text).
 */
export function readPath(operand: string, walk: Walk): string | undefined {
  const text = unquote(operand);
  if (!operand.startsWith("'") && /[$`]/.test(text)) return undefined;
  const glob = text.search(/[*?[]/);
  const literal = glob < 0 ? text : text.slice(0, text.lastIndexOf('/', glob) + 1) || '.';
  return absolutePath(expandHome(literal, walk.paths), { ...walk.paths, cwd: walk.base });
}
