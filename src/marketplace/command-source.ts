import { error, type PluginIssue } from '../format/issues.ts';
import type { CommandResult, CommandRunner, CommandSpec } from '../ports/command-runner.ts';
import type { Environment } from '../ports/environment.ts';
import type { PluginFiles } from '../ports/files.ts';
import type { Locations } from '../ports/locations.ts';
import { containsSession, readPrintedPath } from './command-output.ts';
import { contentIssue, copyLimitIssue, linkIssue } from './command-directory.ts';
import { LINKS_NEED_POSIX, linkOnWindowsIssue } from './command-mode.ts';
import type { PluginDirectories } from './ports.ts';
import type { CommandFetchPlan } from './types.ts';

/**
 * Running a `command` source (plugins/marketplace-reference.md, "command plugin source"): the
 * command goes through the `CommandRunner` port, from the user's home directory; what it printed
 * and the directory it names are judged here, the copy or the link itself is the host's. Every
 * failure the docs list is a `PluginIssue` on `source`; nothing throws.
 */

export interface CommandSourcePorts {
  readonly runner: CommandRunner;
  /** The environment the command inherits ("Claude Code's subprocess environment"). */
  readonly environment: Environment;
  /** `homeDir()` is the directory the command runs from. */
  readonly locations: Locations;
  readonly directories: PluginDirectories;
}

export interface CommandSourceSetting {
  readonly platform: 'posix' | 'windows';
  /** The directory the session was started in: a source may not print it or a parent of it. */
  readonly sessionCwd?: string;
}

/** What a successful run leaves for the host: the directory to copy or link, as read-only files. */
export interface FetchedCommandPlugin {
  readonly directory: string;
  readonly files: PluginFiles;
  readonly mode: CommandFetchPlan['mode'];
}

/** `sh -c <command>`, or `cmd.exe /c <command>`: the exec form of the shell the docs name. */
const SHELLS: { readonly [S in CommandFetchPlan['shell']]: (command: string) => CommandSpec } = {
  sh: (command) => ({ form: 'exec', command: 'sh', args: ['-c', command] }),
  cmd: (command) => ({ form: 'exec', command: 'cmd.exe', args: ['/c', command] }),
};

const problem = (message: string): PluginIssue => error('source.command', message);

/** The failures of the run itself: did not start, timed out, exited non-zero. */
function runIssue(result: CommandResult, plan: CommandFetchPlan): PluginIssue | undefined {
  if (result.startError !== undefined) {
    return problem(`The command could not be run: ${result.startError}`);
  }
  if (result.timedOut) {
    return problem(`The command ran longer than its timeout of ${plan.timeoutMs / 1000} seconds`);
  }
  if (result.exitCode !== 0) {
    const code =
      result.exitCode === null
        ? 'was stopped before it exited'
        : `exited with code ${result.exitCode}`;
    return problem(`The command ${code}; it must exit 0`);
  }
  return undefined;
}

async function execute(
  plan: CommandFetchPlan,
  ports: CommandSourcePorts,
  signal: AbortSignal,
): Promise<CommandResult> {
  return ports.runner.run({
    spec: SHELLS[plan.shell](plan.command),
    cwd: ports.locations.homeDir(),
    env: ports.environment.snapshot(),
    timeoutMs: plan.timeoutMs,
    signal,
  });
}

/** The checks of the directory itself, in the order the docs list the failures. */
async function directoryIssue(
  files: PluginFiles,
  mode: CommandFetchPlan['mode'],
  signal: AbortSignal,
): Promise<PluginIssue | undefined> {
  const missing = await contentIssue(files, signal);
  if (missing !== undefined) return missing;
  return LINKS_NEED_POSIX[mode] ? linkIssue(files, signal) : copyLimitIssue(files, signal);
}

/** Runs the command and judges what it printed; the fetched plugin, or the issue that refuses it. */
export async function runCommandSource(
  plan: CommandFetchPlan,
  ports: CommandSourcePorts,
  setting: CommandSourceSetting,
  signal: AbortSignal,
): Promise<FetchedCommandPlugin | PluginIssue> {
  if (setting.platform === 'windows' && LINKS_NEED_POSIX[plan.mode]) return linkOnWindowsIssue();
  const result = await execute(plan, ports, signal);
  const failed = runIssue(result, plan);
  if (failed !== undefined) return failed;
  const printed = readPrintedPath(result.stdout, setting.platform);
  if ('problem' in printed) return problem(printed.problem);
  if (containsSession(printed.path, setting.sessionCwd, setting.platform)) {
    return error(
      'source',
      `The printed directory "${printed.path}" is the directory Claude Code was started in, or one of its parents`,
    );
  }
  const files = await ports.directories.open(printed.path, signal);
  if (files === undefined) {
    return error('source', `The printed directory "${printed.path}" does not exist`);
  }
  const refused = await directoryIssue(files, plan.mode, signal);
  return refused ?? { directory: printed.path, files, mode: plan.mode };
}
