import type { McpCallToolResult } from '../protocol/official.ts';
import type { McpTransport } from './mcp-config.ts';
import type { EnvLookup } from './mcp-env.ts';
import type { McpToolHints } from './mcp-tool.ts';

/**
 * How large an MCP tool result may be and what happens to one that is too large (mcp.md, "MCP output
 * limits and warnings", "Raise the limit for a specific tool", "Images in tool results"; env-vars.md,
 * `MAX_MCP_OUTPUT_TOKENS`). Pure over data: saving a file, showing a warning and counting tokens with
 * a real tokenizer are the host's, handed in or done with the verdict.
 */
export const MCP_DEFAULT_MAX_OUTPUT_TOKENS = 25_000;
/** "Claude Code displays a warning when any MCP tool output exceeds 10,000 tokens." */
export const MCP_OUTPUT_WARNING_TOKENS = 10_000;
/** "Saves a successful result with no image content to a file once it's longer than 50,000 characters." */
export const MCP_TEXT_PERSIST_CHARS = 50_000;

const MIB = 1024 * 1024;
/** "Passes 16 MiB" (HTTP and SSE: one response body or one event) and "one message over 16 MiB" (WebSocket). */
export const MCP_MESSAGE_BYTES = 16 * MIB;

/** "Error text longer than about 11,000 characters keeps only its first 5,000 and last 5,000 characters." */
const ERROR_TEXT_LIMIT = 11_000;
const ERROR_TEXT_KEPT = 5_000;

export interface McpOutputLimits {
  /** `MAX_MCP_OUTPUT_TOKENS`, or 25,000. */
  readonly maxTokens: number;
  readonly warnTokens: number;
  /** The character threshold for text: the tool's own `anthropic/maxResultSizeChars`, or 50,000. */
  readonly textChars: number;
  /** The tool declares its own limit: "that value instead for text content, regardless of" the variable. */
  readonly declared: boolean;
  readonly countTokens: (text: string) => number;
}

/**
 * Judgments (spec/judgments.md): a variable that is not a positive whole number in plain digits is
 * ignored (the docs name no behaviour for one); without a tokenizer a token is a quarter of a
 * character, rounded up.
 */
const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

function positiveWhole(text: string | undefined): number | undefined {
  if (text === undefined || !/^\d+$/.test(text)) return undefined;
  const value = Number(text);
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

/**
 * The limits for one tool. "The environment variable applies to tools that don't declare their own
 * limit"; a tool that does uses its value for text, and its images still meet `MAX_MCP_OUTPUT_TOKENS`.
 */
export function mcpOutputLimits(
  lookup: EnvLookup,
  hints: Pick<McpToolHints, 'maxResultSizeChars'> = {},
  countTokens: (text: string) => number = estimateTokens,
): McpOutputLimits {
  return {
    maxTokens: positiveWhole(lookup('MAX_MCP_OUTPUT_TOKENS')) ?? MCP_DEFAULT_MAX_OUTPUT_TOKENS,
    warnTokens: MCP_OUTPUT_WARNING_TOKENS,
    textChars: hints.maxResultSizeChars ?? MCP_TEXT_PERSIST_CHARS,
    declared: hints.maxResultSizeChars !== undefined,
    countTokens,
  };
}

export type McpResultVerdict =
  | {
      readonly action: 'inline';
      readonly tokens: number;
      /** The output passed the warning threshold. */
      readonly warn: boolean;
      /** Image content makes the result subject to the token limit and it is over it; the host decides. */
      readonly exceedsTokenLimit: boolean;
    }
  | {
      readonly action: 'persist';
      /** The text to save to a file; the conversation gets `persistedResultMessage(path)` instead. */
      readonly text: string;
      readonly tokens: number;
      readonly warn: boolean;
    }
  | {
      readonly action: 'error';
      /** What Claude receives as the tool's error message. */
      readonly message: string;
      /** Characters cut out between the kept ends. */
      readonly removed: number;
    };

type McpContentPart = McpCallToolResult['content'][number];

/**
 * The text each kind of content part holds; a kind with none holds none. Judgment: an embedded
 * resource's text is text content (the docs speak of "text content"); a binary resource has none.
 */
function textOf(part: McpContentPart): string | undefined {
  if ('resource' in part) return 'text' in part.resource ? part.resource.text : undefined;
  return 'text' in part ? part.text : undefined;
}

interface ImagePart {
  readonly data: string;
  readonly mimeType: string;
}

/** Audio parts carry `data` and `mimeType` too: the kind decides, the fields narrow. */
const IMAGE_TYPES: ReadonlySet<string> = new Set(['image']);

const imageOf = (part: McpContentPart): ImagePart | undefined =>
  IMAGE_TYPES.has(part.type) && 'data' in part && 'mimeType' in part
    ? { data: part.data, mimeType: part.mimeType }
    : undefined;

const joined = (result: McpCallToolResult): string =>
  result.content.flatMap((part) => textOf(part) ?? []).join('\n');

/** Judgment: the marker's wording; the docs say it "says how many characters were removed". */
const removedMarker = (removed: number): string => `\n[... ${removed} characters removed ...]\n`;

function errorVerdict(text: string): McpResultVerdict {
  if (text.length <= ERROR_TEXT_LIMIT) return { action: 'error', message: text, removed: 0 };
  const removed = text.length - 2 * ERROR_TEXT_KEPT;
  const message = `${text.slice(0, ERROR_TEXT_KEPT)}${removedMarker(removed)}${text.slice(-ERROR_TEXT_KEPT)}`;
  return { action: 'error', message, removed };
}

/** Whether the text is too large to stay in the conversation, for a result with no image content. */
function tooLarge(text: string, tokens: number, limits: McpOutputLimits): boolean {
  return limits.declared
    ? text.length > limits.textChars
    : tokens > limits.maxTokens || text.length > limits.textChars;
}

/**
 * What to do with a tool result. An error result is exempt from the limits and has its text bounded.
 * A successful one with no image content is saved when it is over the limit; one with image content is
 * never saved ("a successful result with no image content") and reports whether it is over the token
 * limit. The images' data counts towards the tokens (judgment, spec/judgments.md).
 */
export function limitMcpResult(
  result: McpCallToolResult,
  limits: McpOutputLimits,
): McpResultVerdict {
  const text = joined(result);
  if (result.isError === true) return errorVerdict(text);
  const images = result.content.flatMap((part) => imageOf(part) ?? []);
  const tokens =
    limits.countTokens(text) +
    images.reduce((sum, image) => sum + limits.countTokens(image.data), 0);
  const warn = tokens > limits.warnTokens;
  if (images.length > 0) {
    return { action: 'inline', tokens, warn, exceedsTokenLimit: tokens > limits.maxTokens };
  }
  return tooLarge(text, tokens, limits)
    ? { action: 'persist', text, tokens, warn }
    : { action: 'inline', tokens, warn, exceedsTokenLimit: false };
}

/** What replaces a saved result in the conversation: "a message that names the file path" (wording is the kit's). */
export const persistedResultMessage = (path: string): string =>
  `The result was too large to show here and was saved to ${path}. Read that file when you need the content.`;

/** What tells Claude where the original of an image result is saved (wording is the kit's). */
export const imageResultNote = (path: string): string =>
  `The original image was saved to ${path}. Use tools such as Bash to crop, convert or reuse it.`;

export interface McpImageFile {
  readonly mimeType: string;
  readonly extension: string;
  /** The base64 data as the server sent it: "the original bytes". */
  readonly data: string;
}

/** "A PNG, JPEG, GIF, or WebP image": the media types saved, and the extension of each. */
const IMAGE_EXTENSIONS: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

/**
 * The image files to save beside the inline copy. With session persistence off
 * (`--no-session-persistence`, `CLAUDE_CODE_SKIP_PROMPT_HISTORY`) "Claude Code writes no image file".
 */
export function mcpImageFiles(result: McpCallToolResult, persist: boolean): McpImageFile[] {
  if (!persist) return [];
  return result.content.flatMap((part) => {
    const image = imageOf(part);
    if (image === undefined || !Object.hasOwn(IMAGE_EXTENSIONS, image.mimeType)) return [];
    const extension = IMAGE_EXTENSIONS[image.mimeType];
    return extension === undefined
      ? []
      : [{ mimeType: image.mimeType, extension, data: image.data }];
  });
}

/** What a transport does with a message over its bound. */
export type McpOversize = 'fail-request' | 'close-connection';

const OVERSIZE: { readonly [T in McpTransport]: McpOversize | undefined } = {
  // "Claude Code stops reading it and the request fails."
  http: 'fail-request',
  sse: 'fail-request',
  // "Claude Code closes the connection, and calls in progress on that server fail."
  ws: 'close-connection',
  // The docs state no bound for a stdio server's messages.
  stdio: undefined,
};

/** What happens to a message of `bytes` (after decompression) from a server of `transport`: `undefined` when it is fine. */
export function oversizedMcpMessage(
  transport: McpTransport,
  bytes: number,
): McpOversize | undefined {
  return bytes > MCP_MESSAGE_BYTES ? OVERSIZE[transport] : undefined;
}
