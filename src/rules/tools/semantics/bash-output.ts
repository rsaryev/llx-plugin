import type { Environment } from '../../../ports/environment.ts';
import { positiveInteger } from './env-number.ts';

/** tools-reference.md, "Output limits": characters. */
const INLINE_VALID = 30_000;
const INLINE_FAILURE = 10_000;
const PREVIEW = 2_000;
const READ_BACK_DEFAULT = 30_000;
const READ_BACK_CEILING = 150_000;
/** settings-reference.md, `bashOutputMaxChars`: "Claude Code clamps the value into the range 4000 to 128000". */
const SETTING_RANGE = { min: 4_000, max: 128_000 } as const;

export interface BashOutputLimits {
  /** How much of a valid result reaches Claude inline. */
  readonly inline: number;
  /** How much of the output Claude Code reads back from its working file. */
  readonly readBack: number;
}

/**
 * The windows of a command's output. `BASH_MAX_OUTPUT_LENGTH` sets the read-back window (30,000 by
 * default, 150,000 at most) and "doesn't raise the inline ceilings"; the `bashOutputMaxChars`
 * setting sizes the inline ceiling and the window together, clamped to 4000 to 128000, and then
 * Claude Code ignores the variable. A window below the inline ceiling lowers it too: nothing larger
 * than what was read back can arrive inline (spec/judgments.md).
 */
export function bashOutputLimits(
  env: Pick<Environment, 'get'>,
  bashOutputMaxChars?: number,
): BashOutputLimits {
  if (Number.isInteger(bashOutputMaxChars) && (bashOutputMaxChars ?? 0) > 0) {
    const size = Math.min(Math.max(bashOutputMaxChars ?? 0, SETTING_RANGE.min), SETTING_RANGE.max);
    return { inline: size, readBack: size };
  }
  const readBack = Math.min(
    positiveInteger(env, 'BASH_MAX_OUTPUT_LENGTH') ?? READ_BACK_DEFAULT,
    READ_BACK_CEILING,
  );
  return { inline: Math.min(INLINE_VALID, readBack), readBack };
}

export interface BashOutputRequest {
  readonly output: string;
  /** Whether Claude Code treats the result as valid (`classifyBashExit`) rather than a failure. */
  readonly valid: boolean;
  readonly limits: BashOutputLimits;
}

export interface BashOutputWindow {
  /** What Claude receives inline: the output, a preview, or a head-and-tail excerpt. */
  readonly text: string;
  /** True when the output went to a file in the session directory and `text` is only its preview. */
  readonly savedToFile: boolean;
}

/**
 * What Claude receives of a command's output (tools-reference.md, "Output limits"). A valid result
 * arrives inline up to the ceiling; past that it is saved to a file and Claude gets a preview of the
 * first 2,000 characters. A failure arrives inline up to 10,000 characters; past that, a
 * head-and-tail excerpt of that size cut from the read-back window, with no file path. The split
 * between head and tail is half and half (spec/judgments.md). Writing the file is the host's.
 */
export function windowBashOutput(request: BashOutputRequest): BashOutputWindow {
  const { output, valid, limits } = request;
  if (valid) {
    return output.length <= limits.inline
      ? { text: output, savedToFile: false }
      : { text: output.slice(0, PREVIEW), savedToFile: true };
  }
  const window = output.slice(0, limits.readBack);
  if (window.length <= INLINE_FAILURE) return { text: window, savedToFile: false };
  const half = INLINE_FAILURE / 2;
  return { text: window.slice(0, half) + window.slice(-half), savedToFile: false };
}
