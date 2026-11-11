import type { PathContext } from '../../types.ts';
import { absolutePath, homeExpanded, normalizeAbsolute } from '../../path/posix.ts';
import { isRecord } from '../../../protocol/is-record.ts';

type At = Pick<PathContext, 'cwd' | 'home' | 'platform'>;

const DRIVE_FOLDER = /^\/([a-z])(?:\/(.*))?$/;

const WINDOWS_LOOK = {
  posix: (path: string): string => path,
  windows: (path: string): string => {
    const drive = DRIVE_FOLDER.exec(path);
    if (drive === null) return path.replaceAll('/', '\\');
    const [, letter = '', rest = ''] = drive;
    return `${letter.toUpperCase()}:\\${rest.replaceAll('/', '\\')}`;
  },
} satisfies { readonly [P in PathContext['platform']]: (path: string) => string };

const isUnc = (path: string): boolean => path.startsWith('\\\\') || path.startsWith('//');

/**
 * The absolute path Claude Code hands a hook for a file tool (hooks.md, "PreToolUse input"): "expands
 * `~` and relative paths before hooks run", and "On Windows, the path arrives with backslash
 * separators". `.` and `..` fold, in an absolute path too, so no spelling hides the target; a UNC
 * path keeps its two leading backslashes (spec/judgments.md).
 */
export function expandToolPath(path: string, at: At): string {
  const spelled = homeExpanded(path, at.home);
  if (at.platform === 'windows' && isUnc(spelled)) {
    return `\\${normalizeAbsolute(spelled.replaceAll('\\', '/')).replaceAll('/', '\\')}`;
  }
  return WINDOWS_LOOK[at.platform](absolutePath(spelled, at));
}

/** "For the file tools `Write`, `Edit`, and `Read`, `tool_input.file_path` is always absolute." */
const FILE_TOOLS: ReadonlySet<string> = new Set(['Write', 'Edit', 'Read']);

/**
 * A copy of a tool call's input as a hook receives it: the `file_path` of `Write`, `Edit` and `Read`
 * expanded (`expandToolPath`), every other field and tool untouched. An input that is not an object
 * has no fields, and a `file_path` that is not text is left as it was.
 */
export function expandToolInputPath(
  toolName: string,
  input: unknown,
  at: At,
): Record<string, unknown> {
  if (!isRecord(input)) return {};
  const copy = { ...input };
  const { file_path: path } = input;
  if (FILE_TOOLS.has(toolName) && typeof path === 'string') {
    copy.file_path = expandToolPath(path, at);
  }
  return copy;
}
