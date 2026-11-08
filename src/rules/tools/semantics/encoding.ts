import { error, type PluginIssue } from '../../../format/issues.ts';

/** errors.md, "File is not valid UTF-8": the message the tool result carries, verbatim. */
export const NOT_UTF8_MESSAGE =
  'File is not valid UTF-8. It may use a legacy encoding such as Windows-1252, Shift-JIS or GBK, or be binary. This tool saves the whole file as UTF-8, which would replace every byte it cannot decode with U+FFFD. Nothing was written. Make the change with a shell command that reads and writes the file in its own encoding, or ask the user whether to convert the file to UTF-8 first.';

/**
 * Whether a tool that edits in place accepts a file that starts with a little-endian UTF-16
 * byte-order mark (tools-reference.md, "Non-UTF-8 files": "Claude can't use NotebookEdit on a file
 * that isn't valid UTF-8. The same goes for Edit, unless the file starts with a little-endian
 * UTF-16 byte-order mark.").
 */
const ACCEPTS_UTF16LE: { readonly [T in 'Edit' | 'NotebookEdit']: boolean } = {
  Edit: true,
  NotebookEdit: false,
};

export type InPlaceEditTool = keyof typeof ACCEPTS_UTF16LE;

const strict = new TextDecoder('utf-8', { fatal: true });

function isValidUtf8(bytes: Uint8Array): boolean {
  try {
    strict.decode(bytes);
    return true;
  } catch {
    return false;
  }
}

const startsWithUtf16LeMark = (bytes: Uint8Array): boolean =>
  bytes[0] === 0xff && bytes[1] === 0xfe;

const refusal = (path: string, message: string): PluginIssue => error(path, message);

/**
 * The refusal of an Edit or NotebookEdit on a file whose bytes do not decode as UTF-8, or
 * `undefined` when the tool may edit it. The check covers the bytes as a whole: one invalid
 * sequence is enough (errors.md).
 */
export function editEncodingIssue(
  bytes: Uint8Array,
  tool: InPlaceEditTool,
): PluginIssue | undefined {
  if (isValidUtf8(bytes)) return undefined;
  if (ACCEPTS_UTF16LE[tool] && startsWithUtf16LeMark(bytes)) return undefined;
  return refusal('tool_input.file_path', NOT_UTF8_MESSAGE);
}

const REPLACEMENT_CHARACTER = '�';

/**
 * The refusal of a Write that would replace such a file with text holding `U+FFFD`
 * (tools-reference.md, "Non-UTF-8 files": "Claude can still replace such a file with Write, unless
 * the new content contains `U+FFFD`, the character Read shows Claude in place of bytes it can't
 * decode. That guard stops Claude from writing back the garbled text it read."). `existing` is the
 * file's bytes, `undefined` for a file that is not there. "Such a file" is one `editEncodingIssue`
 * refuses for Edit; the wording of this refusal is a judgment (spec/judgments.md).
 */
export function writeEncodingIssue(
  existing: Uint8Array | undefined,
  content: string,
): PluginIssue | undefined {
  if (existing === undefined || editEncodingIssue(existing, 'Edit') === undefined) return undefined;
  return content.includes(REPLACEMENT_CHARACTER)
    ? refusal(
        'tool_input.content',
        'content contains the replacement character U+FFFD, which Read shows in place of bytes it cannot decode; the existing file is not valid UTF-8, so writing that text back would replace it with garbled text',
      )
    : undefined;
}
