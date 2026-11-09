/**
 * mcp.md § MCP output limits and warnings (the 10,000-token warning, `MAX_MCP_OUTPUT_TOKENS` and its
 * 25,000 default, the scope against `anthropic/maxResultSizeChars`, a result over the limit saved to
 * a file, the 16 MiB bounds of HTTP, SSE and WebSocket messages, the 50,000-character limit for text,
 * the error text of about 11,000 characters cut to its first and last 5,000), § Raise the limit for a
 * specific tool (500,000 characters, independent of the token limit), § Images in tool results (PNG,
 * JPEG, GIF and WebP saved beside the inline copy unless session persistence is off); env-vars.md
 * `MAX_MCP_OUTPUT_TOKENS`. How a token is counted, the wording of the notices and an image result
 * over the token limit are judgments (spec/judgments.md) asserted outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import {
  boundedMcpErrorText,
  limitMcpResult,
  mcpOutputLimits,
  persistedResultMessage,
  type McpCallToolResult,
} from '../../src/index.ts';
import { spec } from '../support/spec.ts';

const environment =
  (variables: Record<string, string> = {}) =>
  (name: string) =>
    variables[name];
/** One character is one token, so a boundary is easy to build. */
const perChar = (text: string): number => text.length;

const text = (length: number): McpCallToolResult => ({
  content: [{ type: 'text', text: 'x'.repeat(length) }],
});
const limitsOf = (variables: Record<string, string> = {}, maxResultSizeChars?: number) =>
  mcpOutputLimits(
    environment(variables),
    maxResultSizeChars === undefined ? {} : { maxResultSizeChars },
    perChar,
  );

spec('mcp.behavior.MCP output limits and warnings.Default limit', () => {
  test('the default maximum is 25,000 tokens', () => {
    expect(limitsOf().maxTokens).toBe(25_000);
  });

  test('a result at 25,000 tokens stays in the conversation; one token more is saved to a file', () => {
    const limits = limitsOf();
    expect(limitMcpResult(text(25_000), limits).action).toBe('inline');
    expect(limitMcpResult(text(25_001), limits).action).toBe('persist');
  });
});

spec('mcp.behavior.MCP output limits and warnings.Configurable limit', () => {
  test('MAX_MCP_OUTPUT_TOKENS sets the maximum, in either direction', () => {
    expect(limitsOf({ MAX_MCP_OUTPUT_TOKENS: '50000' }).maxTokens).toBe(50_000);
    const raised = limitsOf({ MAX_MCP_OUTPUT_TOKENS: '40000' });
    expect(limitMcpResult(text(40_000), raised).action).toBe('inline');
    const lowered = limitsOf({ MAX_MCP_OUTPUT_TOKENS: '1000' });
    expect(limitMcpResult(text(1_001), lowered).action).toBe('persist');
    expect(limitMcpResult(text(1_000), lowered).action).toBe('inline');
  });
});

spec('environment.host.MAX_MCP_OUTPUT_TOKENS', () => {
  test('unset, the default of 25000 tokens applies', () => {
    expect(limitsOf().maxTokens).toBe(25_000);
  });

  test('set, it is the maximum number of tokens in MCP tool responses', () => {
    expect(limitsOf({ MAX_MCP_OUTPUT_TOKENS: '50000' }).maxTokens).toBe(50_000);
  });

  test('the warning stays at 10,000 tokens whatever the maximum is', () => {
    expect(limitsOf({ MAX_MCP_OUTPUT_TOKENS: '50000' }).warnTokens).toBe(10_000);
    expect(
      limitMcpResult(text(10_001), limitsOf({ MAX_MCP_OUTPUT_TOKENS: '50000' })),
    ).toMatchObject({
      action: 'inline',
      warn: true,
    });
  });

  test('a tool that declares anthropic/maxResultSizeChars uses that limit for text, whatever this variable holds', () => {
    const declared = limitsOf({ MAX_MCP_OUTPUT_TOKENS: '1000' }, 200_000);
    expect(limitMcpResult(text(150_000), declared).action).toBe('inline');
    expect(limitMcpResult(text(200_001), declared).action).toBe('persist');
  });

  test('image content from such a tool is still subject to this variable: the limit is the one the variable sets', () => {
    const declared = limitsOf({ MAX_MCP_OUTPUT_TOKENS: '1000' }, 200_000);
    expect(declared.maxTokens).toBe(1_000);
    const withImage: McpCallToolResult = {
      content: [
        { type: 'image', data: 'AAAA', mimeType: 'image/png' },
        { type: 'text', text: 'x'.repeat(5_000) },
      ],
    };
    expect(limitMcpResult(withImage, declared)).toMatchObject({
      action: 'inline',
      exceedsTokenLimit: true,
    });
  });

  test('a successful text result over 50,000 characters is saved to a file regardless of this variable', () => {
    const limits = limitsOf({ MAX_MCP_OUTPUT_TOKENS: '900000' });
    expect(limitMcpResult(text(50_000), limits).action).toBe('inline');
    expect(limitMcpResult(text(50_001), limits).action).toBe('persist');
  });
});

spec('mcp.behavior.MCP output limits and warnings.Output warning threshold', () => {
  test('a warning shows when output exceeds 10,000 tokens, not at 10,000', () => {
    const limits = limitsOf();
    expect(limits.warnTokens).toBe(10_000);
    expect(limitMcpResult(text(10_000), limits)).toMatchObject({ action: 'inline', warn: false });
    expect(limitMcpResult(text(10_001), limits)).toMatchObject({ action: 'inline', warn: true });
  });

  test('"any MCP tool output": a result saved to a file warns too', () => {
    expect(limitMcpResult(text(30_000), limitsOf())).toMatchObject({
      action: 'persist',
      warn: true,
    });
  });
});

spec('mcp.behavior.MCP output limits and warnings.Over the limit', () => {
  test('a successful result with no image content over the limit is saved: the verdict carries the text and the message names the file', () => {
    const verdict = limitMcpResult(text(30_000), limitsOf());
    expect(verdict).toMatchObject({ action: 'persist', text: 'x'.repeat(30_000), tokens: 30_000 });
    const path = '/home/me/.claude/projects/p/s/tool-results/mcp-1.txt';
    expect(persistedResultMessage(path)).toContain(path);
  });

  test('every text part is saved, joined, and an embedded text resource counts as text', () => {
    const result: McpCallToolResult = {
      content: [
        { type: 'text', text: 'a'.repeat(30_000) },
        { type: 'resource', resource: { uri: 'file:///r', text: 'b'.repeat(5) } },
        { type: 'text', text: 'c' },
      ],
    };
    const verdict = limitMcpResult(result, limitsOf());
    expect(verdict.action).toBe('persist');
    expect(verdict.action === 'persist' && verdict.text).toBe(
      `${'a'.repeat(30_000)}\n${'b'.repeat(5)}\nc`,
    );
  });

  test('a result with image content is not saved, however large the text', () => {
    const result: McpCallToolResult = {
      content: [{ type: 'image', data: 'AAAA', mimeType: 'image/png' }, ...text(90_000).content],
    };
    expect(limitMcpResult(result, limitsOf()).action).toBe('inline');
  });
});

spec('mcp.behavior.MCP output limits and warnings.Character limit for text results', () => {
  test('a tool that declares no limit has its result saved once it is longer than 50,000 characters, whatever its token count', () => {
    const fewTokens = mcpOutputLimits(environment(), {}, () => 1);
    expect(limitMcpResult(text(50_000), fewTokens).action).toBe('inline');
    expect(limitMcpResult(text(50_001), fewTokens).action).toBe('persist');
  });

  test('setting MAX_MCP_OUTPUT_TOKENS does not change that threshold', () => {
    const limits = mcpOutputLimits(environment({ MAX_MCP_OUTPUT_TOKENS: '999999' }), {}, () => 1);
    expect(limitMcpResult(text(50_001), limits).action).toBe('persist');
  });
});

spec('mcp.behavior.MCP output limits and warnings.Scope', () => {
  test('the variable applies to a tool that declares no limit', () => {
    expect(limitMcpResult(text(1_001), limitsOf({ MAX_MCP_OUTPUT_TOKENS: '1000' })).action).toBe(
      'persist',
    );
  });

  test('a tool that sets anthropic/maxResultSizeChars uses that value for text, whatever MAX_MCP_OUTPUT_TOKENS is', () => {
    for (const variables of [
      {},
      { MAX_MCP_OUTPUT_TOKENS: '10' },
      { MAX_MCP_OUTPUT_TOKENS: '900000' },
    ]) {
      const limits = limitsOf(variables, 80_000);
      expect(limitMcpResult(text(80_000), limits).action).toBe('inline');
      expect(limitMcpResult(text(80_001), limits).action).toBe('persist');
    }
  });

  test('a tool may also set a limit below the default: text over its value is saved', () => {
    expect(limitMcpResult(text(2_001), limitsOf({}, 2_000)).action).toBe('persist');
  });

  test('tools that return image data are still subject to the token limit', () => {
    const limits = limitsOf({ MAX_MCP_OUTPUT_TOKENS: '100' }, 200_000);
    const result: McpCallToolResult = {
      content: [
        { type: 'image', data: 'x'.repeat(500), mimeType: 'image/png' },
        { type: 'text', text: 'x'.repeat(150) },
      ],
    };
    expect(limitMcpResult(result, limits)).toMatchObject({ exceedsTokenLimit: true });
    expect(
      limitMcpResult({ content: [{ type: 'image', data: 'A', mimeType: 'image/png' }] }, limits),
    ).toMatchObject({
      exceedsTokenLimit: false,
    });
  });
});

describe('what the docs leave open', () => {
  test('a limit that is not a positive whole number in plain digits is ignored', () => {
    for (const value of ['', '0', '-5', '1.5', 'abc', '10k', ' ']) {
      expect(limitsOf({ MAX_MCP_OUTPUT_TOKENS: value }).maxTokens).toBe(25_000);
    }
  });

  test('without a counter a token is a quarter of a character, rounded up', () => {
    const limits = mcpOutputLimits(environment(), {});
    expect(limits.countTokens('x'.repeat(4))).toBe(1);
    expect(limits.countTokens('x'.repeat(5))).toBe(2);
    expect(limits.countTokens('')).toBe(0);
  });

  test('a result with no content is empty and inline', () => {
    expect(limitMcpResult({ content: [] }, limitsOf())).toMatchObject({
      action: 'inline',
      tokens: 0,
      warn: false,
    });
  });

  test('a result with an image over the token limit stays in the conversation and is reported, never saved', () => {
    const result: McpCallToolResult = {
      content: [{ type: 'image', data: 'AAAA', mimeType: 'image/png' }, ...text(26_000).content],
    };
    expect(limitMcpResult(result, limitsOf())).toMatchObject({
      action: 'inline',
      exceedsTokenLimit: true,
    });
  });
});

describe('the text of an error that is not a result (judgment)', () => {
  test('mcp.md "MCP output limits and warnings": error text over about 11,000 characters keeps its two 5,000-character ends, as a result does', () => {
    const text = `${'a'.repeat(5_000)}${'m'.repeat(2_000)}${'z'.repeat(5_000)}`;
    const message = boundedMcpErrorText(text);
    const result = limitMcpResult({ content: [{ type: 'text', text }], isError: true }, limitsOf());
    expect(result).toMatchObject({ action: 'error', message });
    expect(message.startsWith('a'.repeat(5_000))).toBe(true);
    expect(message.endsWith('z'.repeat(5_000))).toBe(true);
    expect(message).toContain('2000 characters removed');
    expect(boundedMcpErrorText('short')).toBe('short');
  });

  test('an error cut inside a character that takes two UTF-16 units drops that half, not both', () => {
    const text = `${'a'.repeat(4_999)}\u{1F6A8}${'m'.repeat(3_000)}\u{1F6A8}${'z'.repeat(4_999)}`;
    const message = boundedMcpErrorText(text);
    expect(message).not.toMatch(
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/,
    );
    expect(message.startsWith('a'.repeat(4_999))).toBe(true);
  });
});
