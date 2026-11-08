import type { HookGate } from './hook-gate.ts';

/**
 * The commands that follow the hooks (settings-reference.md, `disableAllHooks` "Status line and file
 * suggestion gates" and `allowManagedHooksOnly`; goal.md, "Requirements"): the status line, the file
 * suggestion command, the subagent status line, plugin monitors and `/goal`. The kit gives the
 * decision; rendering, starting a monitor and running a command stay the host's.
 */
export interface CommandGates {
  /**
   * "Off entirely": managed settings set `disableAllHooks`, or the folder is not trusted under the
   * workspace trust rule of hooks in settings files. Checked before the narrowing.
   */
  readonly commandsDisabled: {
    readonly statusLine: boolean;
    readonly fileSuggestion: boolean;
    readonly subagentStatusLine: boolean;
  };
  /**
   * "Narrowed to managed settings": `allowManagedHooksOnly`, a `disableAllHooks` that is `true`
   * outside managed settings after precedence, or `--safe-mode`. A managed value runs; any other is
   * skipped without a warning.
   */
  readonly commandSettingsNarrowedToManaged: boolean;
  /** A plugin's monitors do not start under `allowManagedHooksOnly` unless the plugin is force-enabled. */
  monitorsRun(pluginForceEnabled: boolean): boolean;
  /** `/goal` "depends on hooks": not while hooks are disabled, restricted to managed ones, or untrusted. */
  readonly goalCommandAvailable: boolean;
}

/** The facts about the session the host knows and the settings do not. */
export interface CommandSessionFacts {
  /** The folder is trusted. Defaults to `true`. */
  readonly folderTrusted?: boolean;
  /** Claude Code was started with `--safe-mode`. Defaults to `false`. */
  readonly safeMode?: boolean;
}

export function createCommandGates(gate: HookGate, session: CommandSessionFacts): CommandGates {
  const trusted = session.folderTrusted ?? true;
  const off = gate.managedDisable || !trusted;
  return {
    commandsDisabled: { statusLine: off, fileSuggestion: off, subagentStatusLine: off },
    commandSettingsNarrowedToManaged:
      gate.managedOnly || gate.otherDisable || (session.safeMode ?? false),
    monitorsRun: (pluginForceEnabled) => !gate.managedOnly || pluginForceEnabled,
    goalCommandAvailable:
      trusted && !gate.managedOnly && !gate.managedDisable && !gate.otherDisable,
  };
}
