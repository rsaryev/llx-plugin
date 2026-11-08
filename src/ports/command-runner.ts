/**
 * One process run, as `command` hooks, `` !`cmd` `` in skills, status lines and command sources
 * need it. The kit never builds a process line: it says which form it wants and the host runs it.
 * Long-running processes (stdio MCP servers, LSP servers, monitors) are not runs: they stay the
 * host's.
 */
export type ShellKind = 'bash' | 'powershell';

/** `exec`: the program and its arguments, no shell. `shell`: one line the named shell parses. */
export type CommandSpec =
  | { readonly form: 'exec'; readonly command: string; readonly args: readonly string[] }
  | { readonly form: 'shell'; readonly command: string; readonly shell: ShellKind };

export interface CommandRun {
  readonly spec: CommandSpec;
  readonly cwd: string;
  /** The whole environment of the process: the host adds nothing and removes nothing. */
  readonly env: Readonly<Record<string, string>>;
  readonly stdin?: string;
  /** Absent means no limit (a hook marked `async`). The port enforces it and reports `timedOut`. */
  readonly timeoutMs?: number;
  /** Interleave stderr into `stdout` as the process wrote it; `stderr` is then empty. */
  readonly mergeStderr?: boolean;
  readonly signal: AbortSignal;
}

export interface CommandResult {
  /** `null` when the process was killed (a timeout, an abort) or never started. */
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
  /** Why the process did not start (no such program, no shell); absent when it ran. */
  readonly startError?: string;
}

export interface CommandRunner {
  run(run: CommandRun): Promise<CommandResult>;
}
