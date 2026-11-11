import { parseJson as parseJsonText } from '../../format/read-json.ts';

/**
 * What the flag strategies share when they read a value: a JSON text, and a value that holds
 * several space-separated entries ("`--channels`: space-separated list", "`--plugin-url`:
 * space-separated URLs in a single quoted value", "`--mcp-config`: JSON files or strings
 * (space-separated)", cli-reference.md, "CLI flags").
 */

export type Parsed = { readonly value: unknown } | { readonly problem: string };

/** The parsed JSON, or the parser's own message: the kit's one JSON reader. */
export const parseJson = (text: string): Parsed => parseJsonText(text);

const WHITESPACE = /\s+/;

/** The entries of one value, split on whitespace; blanks are dropped. */
export const wordsOf = (value: string): readonly string[] =>
  value.split(WHITESPACE).filter((word) => word !== '');
