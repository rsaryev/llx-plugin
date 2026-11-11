import type { PluginIssue } from '../format/issues.ts';
import type { SkillShell } from '../format/skill-types.ts';
import type { Environment, Locations, ScratchFiles } from '../ports/index.ts';
import type { HooksSettings } from '../protocol/hook-config.ts';
import type { EffortLevel, PermissionMode } from '../protocol/official.ts';
import type { ExpandPolicy, SkillPluginSource } from './expand-policy.ts';
import type { FileReference } from './file-references.ts';
import type {
  Execution,
  ExecutionContext,
  ShellAvailability,
  TurnOverrides,
  TurnSession,
} from './execution.ts';
import type { SkillCommandRunner } from './shell-ports.ts';
import type { ShellPermission } from './shell-run.ts';
import type { ShellArguments } from './shell-arguments.ts';
import type { SkillSession } from './variables.ts';

/** The request, the ports and the result of expanding a skill (see `expand.ts`). */

/** The values a skill's variables need beyond the request itself (see `SkillSession`). */
export type ExpandSession = Pick<
  SkillSession,
  'pluginId' | 'userConfig' | 'windows' | 'isolatedSession' | 'skillRoot' | 'shellPaths'
> & {
  /** Where the skill's plugin was loaded from; default `installed`. Only a plugin skill reads it. */
  readonly pluginSource?: SkillPluginSource;
  /** How a `!` command receives the arguments (the host's `shellArguments`); default `pasted`. */
  readonly shellArguments?: ShellArguments;
};

/** What the host knows about the session beyond the environment the kit reads itself. */
export type SessionLimits = Omit<TurnSession, 'effortEnvironment'>;

export interface ExpandRequest {
  /** The text after the command name, as typed. */
  readonly arguments: string;
  readonly sessionId: string;
  /** The session's effort level: `${CLAUDE_EFFORT}` when the skill sets none and none is forced. */
  readonly effort?: EffortLevel;
  /** Auto mode changes what a command that needs approval does. */
  readonly permissionMode?: PermissionMode;
  /** The `disableSkillShellExecution` setting. */
  readonly disableShellExecution: boolean;
  readonly shells: ShellAvailability;
  /** Who fired the skill and in what kind of session (`backgroundTasksDisabled` is read from the environment). */
  readonly context: Omit<ExecutionContext, 'backgroundTasksDisabled'>;
  /** The model allowlist, the effort cap and the model's supported levels. */
  readonly limits?: SessionLimits;
  readonly session?: ExpandSession;
  readonly policy?: ExpandPolicy;
  /** The session shell's working directory; default `Locations.projectDir()`. */
  readonly cwd?: string;
  /** The `bashOutputMaxChars` setting: how much of a command's result arrives inline. */
  readonly bashOutputMaxChars?: number;
  /** Bare mode: a command that reaches its timeout stops instead of moving to the background. */
  readonly bare?: boolean;
  /**
   * The environment a command runs with, for the shell it runs in: a Bash or PowerShell subprocess's
   * (`subprocessEnvironment`). Default the host's environment as the port gives it.
   */
  readonly commandEnvironment?: (shell: SkillShell) => Readonly<Record<string, string>>;
  readonly signal: AbortSignal;
}

export interface ExpandPorts {
  readonly runner: SkillCommandRunner;
  /** Where a command's output past the inline ceiling is saved; without it only the preview is injected. */
  readonly scratch?: ScratchFiles;
  readonly locations: Locations;
  readonly environment: Environment;
  /** The host's answer for each command: its rules, the skill's grants and the mode. */
  readonly permissions: ShellPermission;
}

export type Expansion =
  | {
      readonly ok: true;
      /** What the model receives. */
      readonly text: string;
      /**
       * The files the text names with `@` (`readFileReferences`), which the host attaches as it does
       * the files a user's `@` names; none for a synced skill outside an isolated session. The
       * `@` references stay in `text` as written.
       */
      readonly references: readonly FileReference[];
      /** `allowed-tools` with `${CLAUDE_*}` substituted in its Bash rules: pre-approved for this turn. */
      readonly grants: readonly string[];
      /**
       * The `allowed-tools` the managed settings withheld: `allowManagedPermissionRulesOnly` or the
       * hooks lock ("Run `/status` to list each skill whose `allowed-tools` Claude Code has ignored").
       */
      readonly ignoredGrants: readonly string[];
      /** `disallowed-tools`: removed from the pool for this turn. */
      readonly disallowed: readonly string[];
      readonly execution: Execution;
      readonly turn: TurnOverrides;
      /** Registered when the skill is invoked and kept for the rest of the session. */
      readonly hooks?: HooksSettings;
      /** Warnings that did not stop the expansion. */
      readonly issues: readonly PluginIssue[];
    }
  | { readonly ok: false; readonly issues: readonly PluginIssue[] };
