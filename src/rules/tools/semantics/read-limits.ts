import type { Environment } from '../../../ports/environment.ts';
import { positiveInteger } from './env-number.ts';

/** tools-reference.md, "Large files": "at most 25,000 tokens" and "refuses a whole file over 256 KB". */
const DEFAULT_TOKEN_LIMIT = 25_000;
const WHOLE_FILE_BYTES = 256 * 1024;
const MEGABYTE = 1024 * 1024;

/** "Images: Read refuses an image file larger than 128 MB"; "a notebook file over 100 MB". */
const IMAGE_BYTES = 128 * MEGABYTE;
const NOTEBOOK_BYTES = 100 * MEGABYTE;

/**
 * What one Read call returns at most, in tokens: 25,000, or `CLAUDE_CODE_FILE_READ_MAX_OUTPUT_TOKENS`
 * (env-vars.md: "Override the default token limit for file reads"). A value that is not a positive
 * integer counts as unset (spec/judgments.md).
 */
export const readTokenLimit = (env: Pick<Environment, 'get'>): number =>
  positiveInteger(env, 'CLAUDE_CODE_FILE_READ_MAX_OUTPUT_TOKENS') ?? DEFAULT_TOKEN_LIMIT;

export interface ReadTarget {
  readonly path: string;
  readonly bytes: number;
}

export interface ReadRefusal {
  readonly reason: 'binary-extension' | 'image-too-large' | 'notebook-too-large';
  readonly message: string;
}

/** The extensions the docs name as binary ("such as `.xlsx`, `.parquet`, `.heic`, or `.zip`"). */
const BINARY_EXTENSIONS = new Set(['xlsx', 'parquet', 'heic', 'zip']);
/** The image types Read returns as visual content (tools-reference.md, "Read tool behavior"). */
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);

const extensionOf = (path: string): string => {
  const name = path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1);
  return name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : '';
};

interface RefusalRule {
  readonly refusal: ReadRefusal;
  readonly applies: (extension: string, bytes: number) => boolean;
}

const REFUSALS: readonly RefusalRule[] = [
  {
    refusal: {
      reason: 'binary-extension',
      message:
        'Read cannot read a file of this binary type: use a skill for the format, or a shell command or script that reads it',
    },
    applies: (extension) => BINARY_EXTENSIONS.has(extension),
  },
  {
    refusal: {
      reason: 'image-too-large',
      message: 'The image is over 128 MB: resize it or export a smaller copy, then read that copy',
    },
    applies: (extension, bytes) => IMAGE_EXTENSIONS.has(extension) && bytes > IMAGE_BYTES,
  },
  {
    refusal: {
      reason: 'notebook-too-large',
      message:
        'The notebook is over 100 MB: read a portion of it, such as a slice of cells, with a shell command',
    },
    applies: (extension, bytes) => extension === 'ipynb' && bytes > NOTEBOOK_BYTES,
  },
];

/**
 * Whether Read refuses a file before it reads a byte (tools-reference.md, "Read tool behavior"): an
 * extension it treats as binary, an image over 128 MB, a notebook over 100 MB. Megabytes are
 * 1024 x 1024 bytes and only the four extensions the docs name are modelled (spec/judgments.md);
 * the wording of the refusals is a judgment too.
 */
export function classifyReadTarget(target: ReadTarget): ReadRefusal | undefined {
  const extension = extensionOf(target.path);
  return REFUSALS.find((rule) => rule.applies(extension, target.bytes))?.refusal;
}

export interface ReadSizing {
  /** The size of the text file on disk. */
  readonly bytes: number;
  /** What the text to return comes to, in tokens: the whole file, or the `offset` and `limit` window. */
  readonly tokens: number;
  /** The call passes `offset` or `limit`. */
  readonly windowed: boolean;
  /** The call passes `allow_large: true`. */
  readonly allowLarge: boolean;
  /** The room left in the context window, in tokens; `allow_large` is sized against it. */
  readonly contextRoomTokens?: number | undefined;
}

/** `whole`: all of it; `partial`: the first page and a `PARTIAL view` notice; `refused`: an error. */
export type ReadOutcome = 'whole' | 'partial' | 'refused';

/**
 * What a text read returns (tools-reference.md, "Large files"). Over the default limits: a whole
 * file over 256 KB is refused, a whole file over the token limit gives its first page with a
 * `PARTIAL view` notice, and an `offset` or `limit` read over the token limit is refused. With
 * `allow_large` the read "is sized against the room left in the session's context window instead of
 * the default limits"; over that room it is refused (spec/judgments.md: the docs do not say what
 * a read over the room gets). Without a measured room `allow_large` has no effect.
 */
export function classifyReadSize(sizing: ReadSizing, env: Pick<Environment, 'get'>): ReadOutcome {
  const { allowLarge, contextRoomTokens, tokens, windowed, bytes } = sizing;
  if (allowLarge && contextRoomTokens !== undefined) {
    return tokens <= contextRoomTokens ? 'whole' : 'refused';
  }
  if (!windowed && bytes > WHOLE_FILE_BYTES) return 'refused';
  if (tokens <= readTokenLimit(env)) return 'whole';
  return windowed ? 'refused' : 'partial';
}

/**
 * The notice of a partial view: "how much of the file it received and how to read more with
 * `offset` and `limit`". It always starts with `PARTIAL view`; the rest is a judgment.
 */
export const partialViewNotice = (shownLines: number, totalLines: number): string =>
  `PARTIAL view: showing the first ${shownLines} of ${totalLines} lines; read more with offset and limit.`;

/** The error of a read that is too large: a portion with `offset` and `limit`, or Grep (wording is a judgment). */
export const READ_TOO_LARGE_MESSAGE =
  'The file is too large to read in one call: read a portion with offset and limit, or search for specific content with Grep instead.';
