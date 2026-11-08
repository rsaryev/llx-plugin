import { error, type PluginIssue } from '../../../format/issues.ts';
import type { HandlerEntry } from '../context.ts';

/**
 * hooks.md, "PowerShell started no program": "A hook with this error ran in PowerShell, which prints a
 * `command` that is only quoted strings, such as `"command": "\"C:\\Tools\\guard.exe\""`, instead of
 * running it." The fixes: `"shell": "powershell"` "to print text, such as JSON, and the hook exits 0";
 * `"shell": "powershell"` and `&` before the quoted path to run a script or a `.exe` whose path has a
 * variable; no inner quotes for one `.exe` at a path without `$`; exec form (`command` and `args`) or
 * Git Bash for a script written for Bash.
 *
 * Judgment (spec/judgments.md): the docs give the error's name and fixes, not when the kit may say it.
 * It says it for a shell-form hook that runs in PowerShell by the host's default (no `shell` field)
 * whose command is only quoted strings; "set `shell`: `powershell`" is the fix that makes the hook
 * exit 0, so a hook that names the shell is the author's choice and runs as written. A string is
 * `"..."` (a backtick or `""` inside is an escape) or `'...'` (`''` inside is one quote); several
 * strings separated by white space are still only strings.
 */

const DOUBLE = '"(?:[^"`]|`[\\s\\S]|"")*"';
const SINGLE = "'(?:[^']|'')*'";
const ONLY_QUOTED_STRINGS = new RegExp(
  `^\\s*(?:${DOUBLE}|${SINGLE})(?:\\s+(?:${DOUBLE}|${SINGLE}))*\\s*$`,
);

export const onlyQuotedStrings = (command: string): boolean => ONLY_QUOTED_STRINGS.test(command);

/** What the hook's error says: the docs' sentence first, then the fixes. */
export const NO_PROGRAM =
  'PowerShell started no program: the command is only quoted strings, which PowerShell prints instead of running. ' +
  'Set "shell": "powershell" to print the text, put & before the quoted path to run a script, ' +
  'remove the inner quotes to run one .exe, or use exec form ("command" and "args"), or install Git Bash for a script written for Bash.';

/** The hook did not run: PowerShell was the host's default for it and the command is only quoted strings. */
export function noProgramIssue(
  entry: HandlerEntry<'command'>,
  field: string,
  command: string,
): PluginIssue | undefined {
  return entry.handler.shell === undefined && onlyQuotedStrings(command)
    ? error(field, NO_PROGRAM)
    : undefined;
}
