/**
 * One token estimate for every count the kit makes without a tokenizer (judgment, spec/judgments.md):
 * the docs count tokens and name no tokenizer, so four characters (code points, as the skill
 * listing counts characters) make a token, rounded up.
 */
import { expect, test } from 'bun:test';
import { CHARS_PER_TOKEN, estimateTokens } from '../../src/format/token-estimate.ts';
import { mcpOutputLimits } from '../../src/format/mcp-output.ts';

test('four characters to a token, rounded up', () => {
  expect(CHARS_PER_TOKEN).toBe(4);
  expect(estimateTokens('')).toBe(0);
  expect(estimateTokens('abcd')).toBe(1);
  expect(estimateTokens('abcde')).toBe(2);
});

test('a character is a code point: an emoji outside the BMP is one character, not two', () => {
  expect(estimateTokens('😀😀😀😀')).toBe(1);
});

test('MCP output limits count with the same estimate by default', () => {
  expect(mcpOutputLimits(() => undefined).countTokens('😀😀😀😀')).toBe(1);
});
