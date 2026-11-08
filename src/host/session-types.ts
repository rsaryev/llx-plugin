import type { PermissionRule } from '../rules/index.ts';
import type { EffortLevel, PermissionMode } from '../protocol/official.ts';
import type { SessionLimits, ShellPermission } from '../skills/index.ts';

/**
 * What one session is opened with. The fields that change from one turn to the next are the
 * ones `TurnOptions` names (`withTurn`); `sessionId`, `transcriptPath` and `trusted` are the
 * session's for good.
 */
export interface SessionOptions {
  readonly sessionId: string;
  /** The working directory: hook input `cwd`, and where `if` path rules and shell placeholders run. */
  readonly cwd: string;
  readonly permissionMode: PermissionMode;
  readonly transcriptPath: string;
  /** The active effort of the turn: hook input `effort` and `${CLAUDE_EFFORT}`. */
  readonly effort?: { readonly level: EffortLevel };
  /** False with `-p` or through the Agent SDK. Default true. */
  readonly interactive?: boolean;
  /** Settings-file hooks may run (workspace trust). Default true. */
  readonly trusted?: boolean;
  /** Extra folders path rules in a hook's `if` treat as inside the project. */
  readonly additionalDirectories?: readonly string[];
  /**
   * The directories passed with `--add-dir` or `/add-dir`, in the order they were added. Their
   * `.claude/skills` and `.claude/commands` load (`permissions.additionalDirectories` of a settings
   * file grants file access only: skills.md, "Load skills from a directory outside the project").
   */
  readonly addedDirectories?: readonly string[];
  /**
   * The commands other sources already use: the host's built-in commands, its bundled skills and its
   * MCP prompts, as typed without the slash (`usage`, `code-review`). The plugins' skills count
   * already. Only a synced skill's short name yields to them; a skill of the folders replaces a
   * built-in or bundled command of its name (skills.md, "Resolve skills that share a name" and "When a
   * synced skill name matches another command").
   */
  readonly takenCommands?: readonly string[];
  /** The answer for a skill's shell placeholder; absent, an `ask`, which aborts the expansion. */
  readonly permissions?: ShellPermission;
  /** The user prompt being processed: hook input `prompt_id` (hooks.md, "Common input fields"). Absent until the first input. */
  readonly promptId?: string;
  /** The session's scratchpad folder: hook input `scratchpad_dir`. Absent when the session has none. */
  readonly scratchpadDir?: string;
  /** The agent the hooks fire in, for a subagent or `--agent`: hook input `agent_id` and `agent_type`. */
  readonly agent?: { readonly id?: string; readonly type?: string };
  /**
   * The workspace trust dialog was accepted for the exact folder, which the frontmatter hooks of a
   * project subagent need (hooks.md, "Hooks in skills and agents"); a `-p` session never sets it.
   */
  readonly folderTrustAccepted?: boolean;
  /**
   * What the host knows of the model: the `availableModels` allowlist, the effort cap
   * (`maxEffortLevel`) and the levels the active model supports. `session.expandSkill` applies them
   * to a skill's own `model` and `effort` (skills.md, "Frontmatter reference"); absent, none limits.
   * `CLAUDE_CODE_EFFORT_LEVEL` is not here: the kit reads it from the environment port.
   */
  readonly limits?: SessionLimits;
  /**
   * The `--agents` flag, already parsed from JSON: agent names to definitions (sub-agents.md, "Choose the
   * subagent scope"). The host reads the flag, or the file `-p` takes; `readFlagAgents` reads the value.
   */
  readonly agents?: unknown;
  /**
   * The permission rules in force (settings and `--disallowedTools`): an `Agent(name)` deny rule switches
   * that subagent off, a bare `Agent` deny rule all of them (sub-agents.md, "Disable specific subagents").
   */
  readonly permissionRules?: readonly PermissionRule[];
}
