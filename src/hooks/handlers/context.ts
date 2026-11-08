import type { PluginIssue } from '../../format/issues.ts';
import type { ResolvedUserConfig } from '../../loading/resolve/index.ts';
import type { CommandRunner, Environment, Locations, ShellKind } from '../../ports/index.ts';
import type { HookHandlerOf, HookHandlerType } from '../../protocol/hook-config.ts';
import type { RegisteredHandler } from '../contracts.ts';
import type { StartObserver } from './status.ts';
import type { TimeoutPlan } from './timeouts.ts';

/**
 * What a handler needs to run, and what it hands back. Only the part the command handler
 * (hooks.md, "Command hook fields") uses is here; the other handler types extend `RunPorts` and
 * `RawRun` in their own files, so the stage that interprets a run reads one union.
 */

/** The ports a run uses; a host passes the ones its handlers need. */
export interface RunPorts {
  readonly runner: CommandRunner;
  readonly locations: Locations;
  readonly environment: Environment;
  readonly observer?: StartObserver;
}

export interface RunContext {
  readonly ports: RunPorts;
  /** The JSON a command hook reads on stdin (`serializeHookInput`). */
  readonly input: string;
  /** Where Claude is working now (`cwd` of the input). */
  readonly cwd: string;
  /** The directory the session started in: the first fallback when `cwd` is gone. */
  readonly startDirectory?: string;
  /** The system temp directory: the last fallback. The kit cannot name it (L3); the host does. */
  readonly tempDirectory?: string;
  /** The host is Windows: its paths come back with backslashes. */
  readonly windows: boolean;
  /**
   * What a hook with no `shell` field runs in: `bash`, or `powershell` on Windows without Git
   * Bash. The kit cannot tell which (hooks.md, "Exec form and shell form"), the host says.
   */
  readonly defaultShell: ShellKind;
  /** The saved options of a plugin, for `${user_config.*}` and `CLAUDE_PLUGIN_OPTION_<KEY>`. */
  readonly userConfigOf?: (pluginId: string) => ResolvedUserConfig;
  readonly timeouts: TimeoutPlan;
  readonly signal: AbortSignal;
}

/** A registered handler whose official handler is one type. */
export type HandlerEntry<T extends HookHandlerType> = Omit<RegisteredHandler, 'handler'> & {
  readonly handler: HookHandlerOf<T>;
};

/** A run that ended: the exit code and what the process wrote. */
export interface ExitedRun {
  readonly kind: 'exited';
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * A run that ended another way. `timed-out` discards the output ("Claude Code cancels a hook that
 * reaches its timeout, discarding the hook's output"); `not-started` is a program that did not
 * start (a missing script); `cancelled` is a process killed by the session (an abort).
 */
export type ForegroundRun =
  | ExitedRun
  | { readonly kind: 'timed-out' }
  | { readonly kind: 'not-started'; readonly message: string }
  | { readonly kind: 'cancelled' };

/** A hook that did not run, and why (a refused shell-form `${user_config.*}`). */
export interface SkippedRun {
  readonly kind: 'skipped';
  readonly reason: string;
}

/** What a background hook reports once its process ends. */
export interface BackgroundResult {
  readonly run: ForegroundRun;
  /**
   * `asyncRewake` only: the text that wakes Claude, the stderr (stdout when stderr is empty) of a
   * run that exited with code 2.
   */
  readonly wake?: string;
}

/** A hook running in the background: the engine goes on, and reads `done` when it settles. */
export interface BackgroundRun {
  readonly kind: 'background';
  readonly done: Promise<BackgroundResult>;
}

/** What running a command hook returns. */
export type CommandRawRun = ForegroundRun | SkippedRun | BackgroundRun;

/** The raw run and the issues the run itself found (warnings, a refusal). */
export interface HandlerResult {
  readonly run: CommandRawRun;
  readonly issues: readonly PluginIssue[];
}
