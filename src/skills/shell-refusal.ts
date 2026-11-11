import type { SkillShell } from '../format/skill-types.ts';

/**
 * The commands the shell tools refuse to run (errors.md, "No shell command in a skill or command
 * was run"). Judgment (spec/judgments.md): a file with CRLF line endings is not refused for its
 * carriage returns, and the check comes before the permission check.
 */

const isControl = (code: number): boolean =>
  code <= 0x08 || (code >= 0x0b && code <= 0x1f) || (code >= 0x7f && code <= 0x9f);

/** "PowerShell tool: also U+FEFF or U+180E". */
const isPowerShellOnly = (code: number): boolean => code === 0xfeff || code === 0x180e;

/**
 * The characters each tool refuses (errors.md): "a raw control character other than a tab or
 * newline" for either tool, and for PowerShell also U+FEFF and U+180E.
 */
const REFUSED: { readonly [S in SkillShell]: (code: number) => boolean } = {
  bash: isControl,
  powershell: (code) => isControl(code) || isPowerShellOnly(code),
};

const TOOL_LABEL: { readonly [S in SkillShell]: string } = {
  bash: 'Bash',
  powershell: 'PowerShell',
};

/** Each refused character shown as the replacement mark. */
const shown = (command: string, shell: SkillShell): string =>
  Array.from(command, (char) => (REFUSED[shell](char.codePointAt(0) ?? 0) ? '�' : char)).join('');

/** The message of errors.md for a command the tool does not accept, or `undefined` when it does. */
export function refusalOf(command: string, name: string, shell: SkillShell): string | undefined {
  const marked = shown(command, shell);
  if (marked === command) return undefined;
  return (
    `No shell command in ${name} was run, because the ${TOOL_LABEL[shell]} tool does not accept one of them: ` +
    'command contains control characters that would be hidden in the approval dialog. ' +
    'Unprintable characters are shown as � below: remove them from the skill or command file, ' +
    `or from the arguments or options substituted into it.\n${marked}`
  );
}
