import type { PolicyView } from '../settings/index.ts';
import type { OptionValues } from '../settings/plugins/index.ts';
import type { HostPlugin } from './types.ts';
import type { HookPorts } from '../hooks/index.ts';
import type { Locations } from '../ports/index.ts';
import type { DecideContext, HostToolNames, PermissionRule } from '../rules/index.ts';
import type { MonitorLedgerState } from './session-core.ts';
import type { EffortLevel, PermissionMode } from '../protocol/official.ts';
import type { SessionLimits, ShellPermission } from '../skills/index.ts';
import type { HostSkill } from './session-host-skills.ts';
import type { PluginSession } from './session.ts';

/**
 * What one session is opened with. The fields that change from one turn to the next are the
 * ones `TurnOptions` names (`withTurn`); `sessionId`, `transcriptPath` and `trusted` are the
 * session's for good.
 */
export interface SessionOptions {
  /**
   * The ports this session binds itself: the environment, the model evaluators, the MCP caller, the
   * observer and the like, for a host that shares one `PluginHost` among sessions and so cannot
   * give them to the host once. Each given port replaces the host's of that name for everything the
   * session resolves: its hooks, skills, workflows, agents, MCP and LSP servers and monitors; a port
   * left out stays the host's. The environment `${VAR}` reads is this port's with the settings `env`
   * Claude Code writes into its process (env-vars.md, "Set variables in settings files"). The
   * locations are not among them (`locations`). Judgment (spec/judgments.md): the docs do not
   * describe the embedding.
   */
  readonly ports?: Partial<Omit<HookPorts, 'locations'>>;
  /**
   * Where this session's things are: its project folder (`CLAUDE_PROJECT_DIR`, "the project root
   * where the session started"; hooks.md, "Reference scripts by path"), and the folder and data
   * folder of each plugin it runs, its own (`plugins`) included. Given, it replaces the host's
   * `ports.locations` for everything the session resolves: hooks, skills, agents, MCP and LSP
   * servers, monitors, the folders it reads. Fixed for the session: a turn that moves `cwd` (into a
   * worktree, say) leaves the project folder where it was (hooks.md, "Worktrees are different").
   * Absent, the host's. Judgment (spec/judgments.md): the docs do not describe a host serving
   * several projects.
   */
  readonly locations?: Locations;
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
   * The skills the host supplies itself, built in or registered at run time by its extensions, read
   * at each use: return the same array while they are unchanged, a new one when they change. They are
   * bundled skills to the kit (`HostSkill`): listed after the plugins' and the folders' skills, a
   * folder skill of the same name replaces one, and their commands are taken for a synced skill's
   * short name even while `disableBundledSkills` removes them.
   */
  readonly hostSkills?: () => readonly HostSkill[];
  /**
   * The commands other sources already use: the host's built-in commands and its MCP prompts, as
   * typed without the slash (`usage`, `mcp__github__pr`). The plugins' skills and `hostSkills` count
   * already. Only a synced skill's short name yields to them; a skill of the folders replaces a
   * built-in or bundled command of its name (skills.md, "Resolve skills that share a name" and "When a
   * synced skill name matches another command").
   */
  readonly takenCommands?: readonly string[];
  /**
   * The answer for a skill's shell placeholder. Absent: `decide` over `permissionContext` with the
   * skill's `allowed-tools` as allow rules (skills.md, "Permission checks on injected commands").
   */
  readonly shellPermission?: ShellPermission;
  /**
   * What `decide` reads for a skill's shell placeholder: `startPermissions(...).context`. Absent, the
   * session's own `permissionMode`, `permissionRules` and directories, with neither auto nor bypass
   * mode available.
   */
  readonly permissionContext?: DecideContext;
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
  /**
   * This session's settings after `createPolicyView`: the user, project and local files of its own
   * project, with any layer the host adds (a `flagSettings` layer for `--settings`). Given, they
   * replace the host's `settings` for everything the session exposes: which plugins run
   * (`enabledPlugins`), their saved options (`pluginConfigs`), the hook gates, the customization lock,
   * skill overrides and the settings environment. Fixed for the session (`withTurn` keeps them); an
   * update's plugins, `userConfig` and parent settings reach it, an update's `settings` does not.
   * Absent, the session reads the host's. Judgment (spec/judgments.md): the docs do not describe a
   * host serving several projects.
   */
  readonly settings?: PolicyView;
  /**
   * This session's own plugins, beside the host's (which are the user-scope installs, there in every
   * project): its project's project and local installs, a project folder of plugins, `--plugin-dir`
   * plugins (`<name>@inline`). They run in this session only. One under a host plugin's id replaces it
   * here; one with a host plugin's manifest name and another origin takes the documented order
   * (managed, then `@inline`, then installed, then `@skills-dir`, then `@synced`; plugins/loading.md,
   * "Name conflicts"). Whether each runs is decided as for the host's: `enabled`, else this session's
   * `enabledPlugins`, else the manifest's `defaultEnabled`. Fixed for the session. Judgment
   * (spec/judgments.md) for the layering.
   */
  readonly plugins?: readonly HostPlugin[];
  /**
   * The saved values of this session's plugins by plugin id (the host's secure store for this
   * project), in the form of `PluginHostOptions.userConfig`: an option by its key, a bundled server's
   * setting under `<server>.<key>`. Given, they replace the host's `userConfig` for this session; they
   * win over the `pluginConfigs` of the settings. Fixed for the session.
   */
  readonly userConfig?: Readonly<Record<string, OptionValues>>;
  /**
   * How the host's tool names correspond to Claude Code's, when its tools carry other names. The
   * session reads every tool name in Claude Code's terms through it: the `tool_name` of a dispatched
   * event (so a hook's `matcher` and `if` and its input see `Write`, not `write_file`) and the call
   * `checkTool` decides (so the permission rules match it). The tool input, `updatedInput` and every
   * other tool name the host passes stay the host's to map. Absent, the names are Claude Code's.
   * Fixed for the session: a name it does not list is the same on both sides, so an MCP tool the
   * host calls by its `mcp__<server>__<tool>` name needs no entry, including one whose server
   * connects mid-session or per run. Judgment (spec/judgments.md).
   */
  readonly toolNames?: HostToolNames;
  /**
   * The ledger of the session this one replaces (`session.monitorLedger()`): the monitors it handed
   * out are not handed out again and the skills that ran still trigger theirs. Judgment
   * (spec/judgments.md).
   */
  readonly monitorLedger?: MonitorLedgerState;
  /**
   * The chat session a subagent's session runs in: the two share one live monitor ledger, so a
   * skill the subagent runs counts for the chat and no monitor starts twice (plugins/components.md,
   * "Monitors": a monitor "runs in the background for the whole session"). Takes the place of
   * `monitorLedger`.
   */
  readonly parentSession?: PluginSession;
}
