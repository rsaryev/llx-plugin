import { warning, type PluginIssue } from '../../format/issues.ts';
import type { ScratchFiles } from '../../ports/scratch-files.ts';

/**
 * The cap on a hook's text (hooks.md, "JSON output"): "A hook's `additionalContext`,
 * `systemMessage`, and `initialUserMessage` strings, and its plain stdout, are capped at 10,000
 * characters". Each string is measured on its own; over the limit, "Claude Code saves the output to
 * a file in the session directory. It replaces the output with the file path and a preview of up to
 * the first 2,000 characters." Except for PreCompact stdout, which is cut at the cap with a marker.
 */

export const TEXT_CAP = 10_000;
export const PREVIEW_LENGTH = 2_000;

/** A text cut at the cap and the marker that says so (judgment: the docs give no marker text). */
const CUT_MARKER = `\n[output cut at ${TEXT_CAP} characters]`;

/** The first `count` characters (code points), so a cut never splits a surrogate pair. */
function firstCharacters(text: string, count: number): string {
  return Array.from(text).slice(0, count).join('');
}

const lengthOf = (text: string): number =>
  text.length <= TEXT_CAP ? text.length : Array.from(text).length;

const exceedsCap = (text: string): boolean => lengthOf(text) > TEXT_CAP;

/** What the model is told in place of a text that is saved to a file (judgment: the docs give no wording). */
const spilledText = (path: string, total: number, preview: string): string =>
  `Output too large (${total} characters). Full output saved to: ${path}\n\nPreview (first ${PREVIEW_LENGTH} characters):\n${preview}`;

export interface Limited {
  readonly text: string;
  readonly issues: readonly PluginIssue[];
}

/**
 * `text` as the model gets it: as is under the cap, else a pointer to the saved file with a
 * preview. Without a `ScratchFiles` port, or when the write fails, the text is cut at the cap with
 * a warning, so a host that cannot save a file never injects more than the cap.
 */
export async function limitText(
  name: string,
  text: string,
  scratch: ScratchFiles | undefined,
  signal: AbortSignal,
): Promise<Limited> {
  if (!exceedsCap(text)) return { text, issues: [] };
  const total = Array.from(text).length;
  const cut = firstCharacters(text, TEXT_CAP) + CUT_MARKER;
  if (scratch === undefined) {
    return {
      text: cut,
      issues: [
        warning(
          name,
          `${total} characters exceed the ${TEXT_CAP} cap and no ScratchFiles port can save them: cut`,
        ),
      ],
    };
  }
  try {
    const path = await scratch.write(name, text, signal);
    return { text: spilledText(path, total, firstCharacters(text, PREVIEW_LENGTH)), issues: [] };
  } catch (thrown) {
    const reason = thrown instanceof Error ? thrown.message : String(thrown);
    return {
      text: cut,
      issues: [
        warning(
          name,
          `${total} characters exceed the ${TEXT_CAP} cap and could not be saved (${reason}): cut`,
        ),
      ],
    };
  }
}

/** PreCompact stdout: "Claude Code cuts longer output at the cap and appends a marker." */
export const cutText = (text: string): string =>
  exceedsCap(text) ? firstCharacters(text, TEXT_CAP) + CUT_MARKER : text;
