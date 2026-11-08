import { z } from 'zod';
import type { TextBlock } from './ports.ts';

/** A block the caller passed in an array form of `prompt` or `system`: `{ text }`, with `cache: true` on the end of the static content. */
const blockSchema = z
  .object({ text: z.string(), cache: z.boolean().optional() })
  .transform((block): TextBlock =>
    block.cache === true ? { text: block.text, cache: true } : { text: block.text },
  );
export const blocksSchema = z.array(blockSchema);

/** `prompt` or `system` as the caller wrote it: a string, or an array of blocks (api.md, "Use prompt caching"). */
export const textOrBlocks = z.union([z.string(), blocksSchema]);
export type TextOrBlocks = z.infer<typeof textOrBlocks>;

/**
 * What a `model.complete` event holds for a caller's `prompt` or `system` (api.md, "What a
 * `model.complete` hook receives"): the text as a string, always, and the blocks only when the
 * caller passed an array.
 */
export function eventText(value: TextOrBlocks): {
  readonly text: string;
  readonly blocks?: readonly TextBlock[];
} {
  if (typeof value === 'string') return { text: value };
  return { text: value.map((block) => block.text).join(''), blocks: value };
}

/**
 * The blocks Claude Code sends for the string a hook passed to `next` and the blocks it passed with
 * it: "It keeps the leading blocks that still match the start of the string, with their
 * breakpoints, and sends the rest of the string with no breakpoint."
 */
export function sentBlocks(
  text: string,
  blocks: readonly TextBlock[] | undefined,
): readonly TextBlock[] {
  const kept: TextBlock[] = [];
  let used = 0;
  for (const block of blocks ?? []) {
    if (!text.startsWith(block.text, used)) break;
    kept.push(block);
    used += block.text.length;
  }
  const rest = text.slice(used);
  return rest === '' && kept.length > 0 ? kept : [...kept, { text: rest }];
}
