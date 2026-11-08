/**
 * What a `command` source printed (plugins/marketplace-reference.md, "What the command must do",
 * "Output that fails the install or update"): "exactly one line on stdout, the absolute path of the
 * plugin directory", not a UNC path on Windows, and not the directory Claude Code was started in
 * or one of its parents. Pure text handling; the messages are the kit's (spec/judgments.md).
 */

type Platform = 'posix' | 'windows';

export type PrintedPath = { readonly path: string } | { readonly problem: string };

const POSIX_ABSOLUTE = /^\//;
const WINDOWS_DRIVE = /^[A-Za-z]:[\\/]/;
const UNC = /^(?:\\\\|\/\/)/;

/** The one line, or why stdout is not one. A single trailing line break is the line's own. */
function singleLine(stdout: string): string | undefined {
  const line = stdout.replace(/\r?\n$/, '');
  return line === '' || /[\r\n]/.test(line) ? undefined : line;
}

/** The absolute path the command printed, or what is wrong with its output. */
export function readPrintedPath(stdout: string, platform: Platform): PrintedPath {
  const line = singleLine(stdout);
  if (line === undefined) {
    return {
      problem: 'The command must print exactly one line, the absolute path of the plugin directory',
    };
  }
  if (platform === 'windows' && UNC.test(line)) {
    return {
      problem: `The printed path "${line}" is a UNC (network) path, which is not accepted on Windows`,
    };
  }
  const absolute = platform === 'windows' ? WINDOWS_DRIVE.test(line) : POSIX_ABSOLUTE.test(line);
  if (!absolute) return { problem: `The printed path "${line}" is not an absolute path` };
  return { path: line };
}

/** Separators as `/`, no trailing one, and on Windows no case: how two paths of one platform are compared. */
function comparable(path: string, platform: Platform): string {
  const slashed = platform === 'windows' ? path.replaceAll('\\', '/').toLowerCase() : path;
  return slashed.replace(/\/+$/, '');
}

/** True when two spellings name one folder on `platform`: on Windows separators and capitals do not tell folders apart. */
export const samePath = (a: string, b: string, platform: Platform): boolean =>
  comparable(a, platform) === comparable(b, platform);

/** True when `printed` is `sessionDirectory` or one of its parents ("the session's own directory"). */
export function containsSession(
  printed: string,
  sessionDirectory: string | undefined,
  platform: Platform,
): boolean {
  if (sessionDirectory === undefined) return false;
  const directory = comparable(printed, platform);
  const session = comparable(sessionDirectory, platform);
  return session === directory || session.startsWith(`${directory}/`);
}
