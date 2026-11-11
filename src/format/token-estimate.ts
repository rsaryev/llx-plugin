/**
 * Judgment (spec/judgments.md): the docs count tokens (the skill listing budget, re-attached skill
 * content, MCP output limits) and name no tokenizer, so wherever the kit counts tokens without one
 * it takes four characters to a token, a character being a code point, as the skill listing
 * counts characters. A host with a tokenizer passes its own counter where one is taken.
 */
export const CHARS_PER_TOKEN = 4;

/** The tokens of `text` by that estimate, rounded up. */
export const estimateTokens = (text: string): number =>
  Math.ceil(Array.from(text).length / CHARS_PER_TOKEN);
