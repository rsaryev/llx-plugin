import { warning, type PluginIssue } from '../../../format/issues.ts';
import type { RunContext } from '../context.ts';

/**
 * hooks.md, "Hook handler fields": "Handlers run in the current directory with Claude Code's
 * environment. If the current directory no longer exists, for example a worktree or temp directory
 * that another shell deleted mid-session, Claude Code runs command hooks from the first of these
 * that still exists: the directory the session started in, the project root, your home directory,
 * or the system temp directory. Claude Code records a warning naming the fallback directory."
 */
export interface WorkingDirectory {
  readonly cwd: string;
  readonly issues: readonly PluginIssue[];
}

export async function workingDirectory(context: RunContext): Promise<WorkingDirectory> {
  const { locations } = context.ports;
  const candidates = [
    context.cwd,
    context.startDirectory,
    locations.projectDir(),
    locations.homeDir(),
    context.tempDirectory,
  ].filter((directory): directory is string => directory !== undefined);
  const found = await locations.existingDirectory([...new Set(candidates)], context.signal);
  // Judgment (spec/judgments.md): when none of them exists the process is started in `cwd`
  // anyway, and the port reports that it could not start.
  if (found === undefined || found === context.cwd) return { cwd: context.cwd, issues: [] };
  return {
    cwd: found,
    issues: [
      warning(
        'hooks.cwd',
        `The working directory ${context.cwd} no longer exists; the hook runs from ${found}.`,
      ),
    ],
  };
}
