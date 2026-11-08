import type { ShellKind } from '../../ports/index.ts';
import type { HookEvent } from '../../protocol/official.ts';
import { envFileClearedBy, envFileKindOf, shellHasEnvFile } from './events.ts';
import type { EnvFileStore } from './ports.ts';
import { readPowershellVariables, type PowershellVariables } from './powershell-reader.ts';

/**
 * What a command hook asks for its `CLAUDE_ENV_FILE`: the path for this event and this hook's shell,
 * or none. `shell` is `undefined` for a hook in exec form, which runs no shell.
 */
export interface HookEnvFiles {
  pathFor(
    event: HookEvent,
    shell: ShellKind | undefined,
    signal: AbortSignal,
  ): Promise<string | undefined>;
}

/** The files of one session: what hooks write them, and what the shells that run later read from them. */
export interface EnvFiles extends HookEnvFiles {
  /** Run before an event's hooks: a `CwdChanged` clears what `CwdChanged` and `FileChanged` hooks wrote. */
  beforeEvent(event: HookEvent, signal: AbortSignal): Promise<void>;
  /**
   * The scripts a Bash command runs before itself, in order: a script `CLAUDE_ENV_FILE` named at
   * launch, the file of `SessionStart` and `Setup`, the file of `CwdChanged` and `FileChanged`
   * ("Each Bash command runs the file's contents as shell code before the command itself").
   */
  scripts(signal: AbortSignal): Promise<readonly string[]>;
  /** The variables a PowerShell command receives (`readPowershellVariables` over every script). */
  powershellVariables(
    options: PowershellOptions,
    signal: AbortSignal,
  ): Promise<PowershellVariables>;
}

export interface PowershellOptions {
  readonly windows: boolean;
  /** A sandboxed PowerShell command receives none of the variables. */
  readonly sandboxed: boolean;
}

export interface EnvFilesOptions {
  /**
   * The script `CLAUDE_ENV_FILE` named in the launch environment ("any script you set `CLAUDE_ENV_FILE`
   * to before launch"). Judgment (spec/judgments.md): it is a third source that a shell runs first;
   * the hooks of the session never write it, they get the session's own files.
   */
  readonly launchScript?: string | undefined;
}

export function createEnvFiles(store: EnvFileStore, options: EnvFilesOptions = {}): EnvFiles {
  const scripts = async (signal: AbortSignal): Promise<readonly string[]> => [
    ...(options.launchScript === undefined ? [] : [options.launchScript]),
    await store.path('session', signal),
    await store.path('cwd', signal),
  ];
  return {
    async pathFor(event, shell, signal) {
      const kind = envFileKindOf(event);
      return kind === undefined || !shellHasEnvFile(shell) ? undefined : store.path(kind, signal);
    },
    async beforeEvent(event, signal) {
      const kind = envFileClearedBy(event);
      if (kind !== undefined) await store.clear(kind, signal);
    },
    scripts,
    async powershellVariables({ windows, sandboxed }, signal) {
      if (sandboxed) return { variables: {}, issues: [] };
      const texts = await Promise.all(
        (await scripts(signal)).map((path) => store.read(path, signal)),
      );
      return readPowershellVariables(texts.filter((text) => text !== undefined).join('\n'), {
        windows,
      });
    },
  };
}
