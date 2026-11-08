import { plainDataProblem } from '../../foundation/index.ts';
import { MOD_LIMITS } from '../../protocol/mods-limits.ts';

/** The end of every message about nesting that is too deep (reference.md, "Limits"). */
export const nestingMessage = (maxDepth: number = MOD_LIMITS.nesting): string =>
  `nesting deeper than ${maxDepth} levels is not supported`;

/**
 * The message when `value` nests deeper than `maxDepth` levels, else `null`. A level is an array or
 * an object inside another; `maxDepth` levels are allowed and one more is refused (judgment: the
 * docs say "past that"). The walk does not recurse, so a value any depth is measured safely.
 */
export function nestingProblem(
  value: unknown,
  maxDepth: number = MOD_LIMITS.nesting,
): string | null {
  return plainDataProblem(value, { maxDepth }) === undefined ? null : nestingMessage(maxDepth);
}
