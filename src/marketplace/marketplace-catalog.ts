import { error } from '../format/issues.ts';
import { readMarketplace } from '../format/marketplace/marketplace.ts';
import type { MarketplaceContext, MarketplaceResult } from '../format/marketplace/types.ts';
import { parseJson, invalidJsonSyntax } from '../format/read-json.ts';
import type { PluginFiles } from '../ports/files.ts';

/**
 * Reading a marketplace's catalog once the host has it (plugins/marketplace-reference.md, "Fields by
 * type"): the text of a `url` download or a `file` source, or a `directory` source, "the directory
 * that contains `.claude-plugin/marketplace.json`". Both are `readMarketplace` over the parsed file;
 * invalid JSON or a missing file keeps the marketplace from loading, never a throw.
 */

export const MARKETPLACE_FILE = '.claude-plugin/marketplace.json';

/** The marketplace a `marketplace.json` text holds. */
export function readMarketplaceText(text: string, context: MarketplaceContext): MarketplaceResult {
  const parsed = parseJson(text);
  return 'value' in parsed
    ? readMarketplace(parsed.value, context)
    : {
        marketplace: undefined,
        issues: [error(MARKETPLACE_FILE, invalidJsonSyntax(parsed.problem))],
      };
}

/** The marketplace of a directory, through `files` rooted at it. */
export async function readMarketplaceDirectory(
  files: PluginFiles,
  context: MarketplaceContext,
  signal?: AbortSignal,
): Promise<MarketplaceResult> {
  const text = await files.readText(MARKETPLACE_FILE, signal);
  return text === undefined
    ? {
        marketplace: undefined,
        issues: [error(MARKETPLACE_FILE, 'The marketplace file is missing')],
      }
    : readMarketplaceText(text, context);
}
