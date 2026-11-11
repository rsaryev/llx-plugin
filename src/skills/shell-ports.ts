import type { CommandResult, CommandRun, CommandRunner } from '../ports/index.ts';

/**
 * What the commands a skill injects need beyond the shared `CommandRunner` (skills.md, "How
 * injected commands run": "Either tool runs the commands the same way it runs Claude's own shell
 * commands. They share the working directory, timeout, and output handling"). A host whose runner
 * is a plain `CommandRunner` still works: both extensions are optional, and a runner that never
 * moves a command to the background simply kills it at the timeout.
 */

/** A foreground command the Bash tool moved to the background at its timeout, still running. */
export interface BackgroundedCommand {
  /** The background task's ID, which the injected text names. */
  readonly taskId: string;
  /** The file the command's output is being written to, which the injected text names. */
  readonly outputPath: string;
}

export interface SkillCommandRun extends CommandRun {
  /**
   * The command may move to the background when it reaches its timeout instead of being killed
   * ("unless the command starts with `sleep`", with background tasks disabled, or in bare mode).
   */
  readonly moveToBackgroundOnTimeout?: boolean;
}

export interface SkillCommandResult extends CommandResult {
  /** Set when the run reached its timeout and the command was moved to the background, not killed. */
  readonly background?: BackgroundedCommand;
}

export interface SkillCommandRunner extends CommandRunner {
  run(run: SkillCommandRun): Promise<SkillCommandResult>;
}
