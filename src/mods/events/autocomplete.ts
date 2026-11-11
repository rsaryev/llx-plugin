import { autocompleteRow, type AutocompleteRow } from './prompt.ts';
import { z } from 'zod';

const rows = z.object({ suggestions: z.array(autocompleteRow) });

/**
 * The rows shown for a `prompt.autocomplete`: Claude Code's own first, then the rows the mods
 * answered, "below Claude Code's own" (reference.md, "Prompts and what Claude reads"). A mods answer
 * of the wrong shape adds no row.
 */
export function autocompleteRows(
  claudeCode: readonly AutocompleteRow[],
  fromMods: unknown,
): readonly AutocompleteRow[] {
  const parsed = rows.safeParse(fromMods);
  return parsed.success ? [...claudeCode, ...parsed.data.suggestions] : claudeCode;
}
