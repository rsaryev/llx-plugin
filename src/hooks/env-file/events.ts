import type { HookEvent } from '../../protocol/official.ts';
import type { ShellKind } from '../../ports/index.ts';
import type { EnvFileKind } from './ports.ts';

/**
 * hooks.md, "Persist environment variables": "`CLAUDE_ENV_FILE` is available for SessionStart, Setup,
 * CwdChanged, and FileChanged hooks. Other hook events don't have access to this variable". The
 * variables of `SessionStart` and `Setup` last the session; those of `CwdChanged` and `FileChanged`
 * "persist into subsequent Bash commands until the next CwdChanged event, when Claude Code clears them".
 */
const FILE_OF_EVENT: Readonly<Partial<Record<HookEvent, EnvFileKind>>> = {
  SessionStart: 'session',
  Setup: 'session',
  CwdChanged: 'cwd',
  FileChanged: 'cwd',
};

/** The file the hooks of this event append to, or none for an event that has no `CLAUDE_ENV_FILE`. */
export const envFileKindOf = (event: HookEvent): EnvFileKind | undefined => FILE_OF_EVENT[event];

/** What clears at the start of an event: the `CwdChanged` event clears the file of its own kind. */
const CLEARED_BY_EVENT: Readonly<Partial<Record<HookEvent, EnvFileKind>>> = {
  CwdChanged: 'cwd',
};

export const envFileClearedBy = (event: HookEvent): EnvFileKind | undefined =>
  CLEARED_BY_EVENT[event];

/**
 * "...and neither does a hook that runs in PowerShell, whether through `"shell": "powershell"` or by
 * default on Windows without Git Bash." A hook in exec form runs no shell, so it is not one.
 */
const SHELL_HAS_FILE: { readonly [S in ShellKind]: boolean } = { bash: true, powershell: false };

export const shellHasEnvFile = (shell: ShellKind | undefined): boolean =>
  shell === undefined || SHELL_HAS_FILE[shell];
