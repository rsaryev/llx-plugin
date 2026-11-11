/**
 * tools-reference.md, "Shell selection in settings, hooks, and skills": `"defaultShell": "powershell"`
 * "routes interactive `!` commands through PowerShell. Requires the PowerShell tool to be enabled."
 * (A command hook's `shell` and a skill's `shell` are read by `hooks` and `skills`.)
 */
export type InteractiveShell = 'bash' | 'powershell';

/**
 * The shell an interactive `!` command runs in. Judgment (spec/judgments.md): any `defaultShell`
 * other than `powershell`, and `powershell` while the PowerShell tool is off, leaves Bash.
 */
export const interactiveShell = (input: {
  readonly defaultShell: string | undefined;
  readonly powerShellToolEnabled: boolean;
}): InteractiveShell =>
  input.defaultShell === 'powershell' && input.powerShellToolEnabled ? 'powershell' : 'bash';
