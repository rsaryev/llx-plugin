/**
 * mcp.md § MCP output limits and warnings (error results, the 16 MiB bounds of HTTP, SSE and WebSocket messages)
 * and § Images in tool results (PNG, JPEG, GIF and WebP saved beside the inline copy unless session
 * persistence is off). The thresholds are in mcp-output.test.ts.
 */
import { describe, expect, test } from 'bun:test';
import {
  imageResultNote,
  limitMcpResult,
  mcpImageFiles,
  mcpOutputLimits,
  oversizedMcpMessage,
} from '../../src/entry/format.ts';
import { type McpCallToolResult } from '../../src/index.ts';
import { spec } from '../support/spec.ts';

const environment =
  (variables: Record<string, string> = {}) =>
  (name: string) =>
    variables[name];
/** One character is one token, so a boundary is easy to build. */
const perChar = (text: string): number => text.length;

const limitsOf = (variables: Record<string, string> = {}, maxResultSizeChars?: number) =>
  mcpOutputLimits(
    environment(variables),
    maxResultSizeChars === undefined ? {} : { maxResultSizeChars },
    perChar,
  );

spec('mcp.behavior.MCP output limits and warnings.Error results', () => {
  const failed = (length: number): McpCallToolResult => ({
    isError: true,
    content: [{ type: 'text', text: `${'a'.repeat(length / 2)}${'b'.repeat(length / 2)}` }],
  });

  test('error text of about 11,000 characters or less reaches Claude whole', () => {
    const verdict = limitMcpResult(failed(11_000), limitsOf());
    expect(verdict).toEqual({
      action: 'error',
      message: 'a'.repeat(5_500) + 'b'.repeat(5_500),
      removed: 0,
    });
  });

  test('error text one character over 11,000 is cut: the boundary is exclusive', () => {
    const verdict = limitMcpResult(
      { isError: true, content: [{ type: 'text', text: 'x'.repeat(11_001) }] },
      limitsOf(),
    );
    expect(verdict).toMatchObject({ action: 'error', removed: 1_001 });
  });

  test('longer error text keeps its first 5,000 and last 5,000 characters with a marker that says how many were removed', () => {
    const verdict = limitMcpResult(failed(20_000), limitsOf());
    expect(verdict.action).toBe('error');
    if (verdict.action !== 'error') return;
    expect(verdict.removed).toBe(10_000);
    expect(verdict.message.startsWith('a'.repeat(5_000))).toBe(true);
    expect(verdict.message.endsWith('b'.repeat(5_000))).toBe(true);
    const marker = verdict.message.slice(5_000, verdict.message.length - 5_000);
    expect(marker).toContain('10000');
  });

  test('an error result is an error verdict, never saved to a file, however large', () => {
    const verdict = limitMcpResult(failed(500_000), limitsOf());
    expect(verdict.action).toBe('error');
  });

  test('Claude receives the result text as the error message: text parts joined by a newline', () => {
    const result: McpCallToolResult = {
      isError: true,
      content: [
        { type: 'text', text: 'first' },
        { type: 'text', text: 'second' },
      ],
    };
    expect(limitMcpResult(result, limitsOf())).toEqual({
      action: 'error',
      message: 'first\nsecond',
      removed: 0,
    });
  });
});

spec('mcp.behavior.MCP output limits and warnings.Response size from HTTP and SSE servers', () => {
  const MIB = 1024 * 1024;

  test('a response that passes 16 MiB stops being read and the request fails', () => {
    for (const transport of ['http', 'sse'] as const) {
      expect(oversizedMcpMessage(transport, 16 * MIB)).toBeUndefined();
      expect(oversizedMcpMessage(transport, 16 * MIB + 1)).toBe('fail-request');
    }
  });

  test('stdio has no stated bound', () => {
    expect(oversizedMcpMessage('stdio', 10 * 1024 * MIB)).toBeUndefined();
  });
});

spec('mcp.behavior.MCP output limits and warnings.Message size from WebSocket servers', () => {
  const MIB = 1024 * 1024;

  test('one message over 16 MiB closes the connection', () => {
    expect(oversizedMcpMessage('ws', 16 * MIB)).toBeUndefined();
    expect(oversizedMcpMessage('ws', 16 * MIB + 1)).toBe('close-connection');
  });
});

describe('the limits together (mcp.md, "MCP output limits and warnings")', () => {
  test('the limits together: 10,000 tokens warn, 25,000 tokens and 50,000 characters save, 16 MiB bounds a message', () => {
    const limits = mcpOutputLimits(environment(), {}, perChar);
    expect(limits).toMatchObject({ warnTokens: 10_000, maxTokens: 25_000, textChars: 50_000 });
  });
});

spec('mcp.behavior.Images in tool results', () => {
  const image = (mimeType: string, data = 'QUJD') => ({ type: 'image' as const, data, mimeType });

  test('PNG, JPEG, GIF and WebP results are saved to a file, the original bytes, beside the inline copy', () => {
    const result: McpCallToolResult = {
      content: [image('image/png'), image('image/jpeg'), image('image/gif'), image('image/webp')],
    };
    expect(mcpImageFiles(result, true)).toEqual([
      { mimeType: 'image/png', extension: 'png', data: 'QUJD' },
      { mimeType: 'image/jpeg', extension: 'jpg', data: 'QUJD' },
      { mimeType: 'image/gif', extension: 'gif', data: 'QUJD' },
      { mimeType: 'image/webp', extension: 'webp', data: 'QUJD' },
    ]);
  });

  test('with session persistence off (--no-session-persistence, CLAUDE_CODE_SKIP_PROMPT_HISTORY) no image file is written and Claude receives only the inline copy', () => {
    const result: McpCallToolResult = { content: [image('image/png')] };
    expect(mcpImageFiles(result, false)).toEqual([]);
  });

  test('other media types and text are not saved as images', () => {
    const result: McpCallToolResult = {
      content: [image('image/svg+xml'), image('application/pdf'), { type: 'text', text: 'x' }],
    };
    expect(mcpImageFiles(result, true)).toEqual([]);
  });

  test('Claude is given the path of the file', () => {
    expect(imageResultNote('/p/tool-results/img-1.png')).toContain('/p/tool-results/img-1.png');
  });
});
