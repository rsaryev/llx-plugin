# `@rsaryev/llx-plugin/agents`

Subagents, their catalog, and workflows.

One row per export; `scripts/check-docs.ts` (DOC3) keeps this table equal to the entry's exports.

| Name | Kind | What it is |
| --- | --- | --- |
| `ActionCategory` | type | One of `ACTION_CATEGORIES` |
| `Admission` | type | What `admitAgent` returns |
| `admitAgent` | function | Whether the run may start one more agent, given how many `agent()` calls it has started |
| `afterAgentFailure` | function | Whether the run goes on after an `agent()` call failed |
| `afterAttempt` | function | What follows an attempt that ended without finishing |
| `AfterFailure` | type | What `afterAgentFailure` returns |
| `afterHandbackDenial` | function | What follows the `denials`-th denial of one subagent's handback (1 for the first) |
| `afterInvalidOutput` | function | What follows an attempt whose output failed validation: `failures` holds the validation failure of every attempt so far, the last one being the attempt that just ended |
| `AfterInvalidOutput` | type | What `afterInvalidOutput` returns |
| `AgentCall` | type | An `agent()` call the script starts now: its prompt and the fingerprint of its options |
| `AgentCatalog` | type | The `catalog` argument of `agentMentions`; The `catalog` argument of `agentTypeahead` |
| `AgentFailure` | type | The `failure` argument of `afterAgentFailure` |
| `AgentFolderScope` | type | The scope folders an agent file is read from; `project` also stands for an added directory |
| `agentFolderTrust` | function | Whether the folder an agent file came from is trusted: its own entry says so ("trust the folder the agent file came from") |
| `AgentFolderTrust` | type | What `agentFolderTrust` returns |
| `AgentFolderTrustInput` | type | The `input` argument of `agentFolderTrust` |
| `AgentHookContext` | type | The `ctx` argument of `selectAgentHooks` |
| `agentHookGroups` | function | What the agent's hooks are for this run |
| `AgentHookSelection` | type | What `selectAgentHooks` returns |
| `AgentMcpResolution` | type | What `resolveAgentMcpServers` returns |
| `AgentMention` | type | The `mentions` field of `MentionsFound` |
| `agentMentions` | function | The subagents a message mentions, from both spellings ("You can also type the mention manually without using the picker: `@agent-<name>` for local subagents, or `@agent-` followed by the scoped name for plugin subagents") |
| `AgentRunKind` | type | How the agent runs: "spawned as a subagent" or "as the main session via `--agent`" |
| `AgentScanContext` | type | Reads the agents folders through the `FolderScan` port |
| `AgentScanOutcome` | type | What `scanAgents` returns |
| `AgentSetting` | type | The `agent` setting as the settings resolved it: the name, and the plugin when it is a plugin default |
| `AgentSources` | type | Which definition a name means and which subagents the settings switch off ("Disable specific subagents": `Agent(name)` deny rules, or the `Agent` tool itself) |
| `AgentToolFields` | type | An agent as far as its tools go: the two frontmatter fields of the SDK's `AgentDefinition` |
| `agentTypeahead` | function | The subagents to offer after `@` |
| `ATTEMPT_ENDINGS` | constant | How an attempt ended without finishing: the whole stall window without output, a response stream that went silent, or a restart asked for |
| `AttemptEnding` | type | One of `ATTEMPT_ENDINGS` |
| `attemptLabels` | function | The labels of attempt `attempt` (from 1), which follows an attempt that ended as `previous` |
| `AttemptLabels` | type | The `/workflows` labels of an attempt: `(retry 1)` after the name, `attempt 2 (stalled)` in the detail |
| `AttemptVerdict` | type | What `afterAttempt` returns |
| `AutoCompactInput` | type | The `input` argument of `effectiveAutoCompactWindow` |
| `BACKGROUND_BUILTIN_TOOLS` | constant | The built-in tools a background subagent keeps (the second filter); every MCP tool stays |
| `BackgroundInput` | type | The `input` argument of `runsInBackground` |
| `BaselineAction` | type | One tool call as far as a mode's baseline is concerned |
| `baselineDecision` | function | What `mode` does with `action` before any rule, hook or classifier verdict |
| `BaselineDecision` | type | A mode's baseline on a tool call: a permission behaviour, or `classify` for the background classifier |
| `builtinAgents` | function | The built-in subagents a session registers, in the page's order |
| `BuiltinModelInput` | type | A built-in, and the connection it is run over |
| `BuiltinPolicy` | type | What switches the built-ins off |
| `CALL_SITES` | constant | Where an `agent()` call sits in the script |
| `CallSite` | type | One of `CALL_SITES` |
| `canRestartOnRequest` | function | Whether a restart asked for on attempt `attempt` is allowed: it counts toward the five |
| `CatalogAgent` | type | The `agents` field of `AgentCatalog`; The `disabled` field of `AgentCatalog` |
| `catalogAgentOf` | function | The catalog entry of an agent read from a file, the flag or a plugin |
| `CatalogSource` | type | Where a catalog agent comes from, in the shape `SessionSkill.source` has (`format/component-source`) |
| `catalogTier` | function | The row of the Priority column a source ranks by |
| `CatalogTier` | type | One subagent a session can run, whatever it came from: a built-in, the `--agents` flag, a file of the managed, project, user or added-directory folders, or a plugin |
| `checkAgainstAllowlist` | function | Applies the allowlist to the model a subagent was about to run on |
| `checkAgentSchema` | function | The contradictions the kit can prove in a `schema` before the subagent starts, each an error that names the key; none means the call goes on |
| `CheckedModel` | type | What `checkAgainstAllowlist` returns |
| `checkFanOut` | function | Nothing in the list runs when it is too long |
| `claudeMdScopes` | function | The CLAUDE.md files a subagent starts with |
| `ClaudeMdScopes` | type | What `claudeMdScopes` returns |
| `Connection` | type | One of `CONNECTIONS` |
| `CONNECTIONS` | constant | How the session reaches Claude, as far as the Explore rule tells the ways apart |
| `effectiveAutoCompactWindow` | function | The auto-compact window a subagent compacts at |
| `effectiveCacheTtl` | function | The `cacheTtl` the frontmatter contributes to a subagent's requests: it "ignores `1h` while your Claude subscription is using usage credits" |
| `FAILURE_CAUSES` | constant | Why the `agent()` call failed, and the error whose start says why |
| `FAN_OUT_CALLS` | constant | The calls that take a list of work |
| `FanOutCall` | type | One of `FAN_OUT_CALLS` |
| `GrantEnvironment` | type | What decides whether a subagent may be set to a mode when the main conversation allows it |
| `HandbackAfterDenial` | type | What `afterHandbackDenial` returns |
| `hasStalled` | function | "Time the agent spends waiting on its own tool calls or on a usage-limit reset doesn't count toward the stall window." |
| `hooksTrustGate` | function | `folderTrusted` is the host's one answer to "did the user accept the trust dialog for this very folder" |
| `inlineServerLifecycle` | function | "Inline servers defined here are connected when the subagent starts... and disconnected when it finishes" |
| `InlineServerLifecycle` | type | When a scoped server connects and goes away, for the run the agent file starts |
| `inspectWorkflowScript` | function | Inspects a workflow script |
| `Interruption` | type | One of `INTERRUPTIONS` |
| `INTERRUPTIONS` | constant | What can interrupt a run. "A run pauses on its own only for agent permission prompts and a usage-limit wait": nothing else pauses it |
| `interruptRun` | function | Whether the run waits for it, or refuses it (judgment: the docs give no wording for the refusal) |
| `LEAVE_WAYS` | constant | Resume after you leave the session |
| `LeaveWay` | type | One of `LEAVE_WAYS` |
| `Leaving` | type | What leaving a session does to a running workflow: whether it stopped and where Claude relaunches it |
| `LEAVING` | constant | How each way of leaving leaves the run |
| `mainSessionFirstTurn` | function | The first user turn to submit for an agent run as the main session agent: its `initialPrompt`, "Prepended to any user-provided prompt" |
| `MainStance` | type | One of `MAIN_STANCES` |
| `McpPolicy` | type | The restrictions the main session's MCP servers are under, as the host evaluates them |
| `McpSkipReason` | type | The `skipped` field of `AgentMcpResolution` |
| `MemoryContext` | type | The `ctx` argument of `planAgentMemory` |
| `MemoryPlan` | type | What `planAgentMemory` returns |
| `MentionsFound` | type | What `agentMentions` returns |
| `MetaPatch` | type | The fields a rewrite sets; a field not given is left as written |
| `MODEL_ALIASES` | constant | The family aliases an Agent tool call's `model` parameter takes |
| `ModelAlias` | type | One of `MODEL_ALIASES` |
| `ModelAllowlist` | type | What the organization's `availableModels` allowlist says, as the host evaluates it |
| `ModelCheckInput` | type | The `input` argument of `checkAgainstAllowlist` |
| `modelFamily` | function | The family alias of a model: the alias itself, or the one a model ID embeds (`claude-opus-5-5`, `claude-opus-5-5[1m]` and `my-gateway/claude-opus-5-5` are `opus`) |
| `ModelSource` | type | Where the chosen model came from |
| `modelValueAccepted` | function | Whether the `model` field of a definition, or the `model` parameter of an Agent call, may hold the value |
| `modelValueKind` | function | Which form a `model` value is: one of the aliases `sonnet`, `opus`, `haiku`, `fable`; `inherit` |
| `ModelValueKind` | type | The three forms the frontmatter `model` field takes |
| `namedSubagent` | function | What a `name` on the Agent call does: with agent teams enabled it makes the subagent addressable |
| `NamedSubagent` | type | What `namedSubagent` returns |
| `NamedSubagentInput` | type | The `input` argument of `namedSubagent` |
| `Nesting` | type | What `nestingAt` returns |
| `nestingAt` | function | What the depth limit does to an agent `layer` layers below the main conversation (0 is the main conversation |
| `NO_WAIT_CAUSES` | constant | Why a workflow does not wait out a usage limit |
| `NOTHING_TO_RESUME` | constant | The error of a relaunch that finds no saved results at all: it never starts the run over on its own |
| `NoWaitCause` | type | One of `NO_WAIT_CAUSES` |
| `parseToolEntry` | function | Reads one entry of the field, as `readAgent` keeps it (a comma inside parentheses is not a split) |
| `Pause` | type | What `interruptRun` returns |
| `PERMISSION_MODE_INPUTS` | constant | The values `permissionMode` accepts in a subagent file: the six modes' config values "and `manual` as an alias for `default`" |
| `PERMISSION_MODE_TRAITS` | constant | The registry: a mode added to the SDK's union fails the typecheck here |
| `PermissionModeTraits` | type | What the docs say of a mode, apart from its prompting table row (`baselineDecision`) |
| `permissionSubagentPromptSurface` | function | Its own tool calls are checked against the permission rules as it runs, and where the prompt shows depends on whether it runs in the foreground or the background |
| `PhaseEntry` | type | A `phases` entry as written: a title, or an object with a `title` and whatever else it carries (judgment) |
| `PhaseReport` | type | What the kit can say about a workflow script without running it |
| `planAgentMemory` | function | The persistent memory of a subagent from its `memory` scope |
| `planPreloadedSkills` | function | The skills a subagent preloads from its `skills` field |
| `planReplay` | function | The decisions for a script that starts `calls` in this order |
| `planWorkflowSave` | function | Plans saving a workflow under a file name, or the issue that refuses the name |
| `PreloadPlan` | type | The `skipped` field of `PreloadedSkills`; What `planPreloadedSkills` returns |
| `ProjectTrustEntry` | type | One project's entry of `~/.claude.json`, which holds the answer to the trust dialog |
| `readScriptHead` | function | Splits a script at the end of its `meta` statement and reads the literal |
| `readWorkflowMeta` | function | The `meta` of a script and what is wrong with it |
| `RECORDED_WHEN_STOPPED` | constant | How the saved record keeps an agent that had not finished when it was stopped: "Stopping the whole run doesn't count any agent as failed" |
| `refuseLinks` | function | The first of `mustNotBeLinks` that is a symbolic link |
| `relaunch` | function | What a relaunch does |
| `Relaunch` | type | What `relaunch` returns; What `relaunchAfter` returns |
| `relaunchAfter` | function | What Claude's relaunch does after the person left in `way` |
| `RelaunchFacts` | type | The `facts` argument of `relaunch`; The `facts` argument of `relaunchAfter` |
| `RelaunchIn` | type | Where the run can be picked up again |
| `removedFromSubagent` | function | Whether a subagent of this run never gets the built-in tool `tool`: the first filter, then (for a background run) the second |
| `Replay` | type | What `planReplay` returns; What `replayAgent` returns |
| `replayAgent` | function | What the agent the script starts now does: returns its saved result or runs again |
| `ReplayState` | type | Where the replay is: the next saved agent, and whether everything from here runs again, and why |
| `RERUN_CAUSES` | constant | Why an agent runs again |
| `RerunCause` | type | One of `RERUN_CAUSES` |
| `resolveAgentMcpServers` | function | The MCP servers an agent's `mcpServers` field gives it |
| `resolveAgents` | function | The agents of every source, one definition per name, minus what a deny rule switched off |
| `resolveSavedWorkflows` | function | Resolves saved workflows by name; the one closest to the working directory wins |
| `resolveSubagentEffort` | function | The effort a subagent runs at: the environment variable, then the invocation parameter, then the `effort` field |
| `resolveSubagentModel` | function | The model a subagent runs on, in "the subagent model order" of sub-agents.md |
| `resolveSubagentPermissionMode` | function | The permission mode a subagent runs in: "The main conversation's permission mode decides whether Claude Code uses the value you set" |
| `resolveSubagentTools` | function | The tools a subagent gets, or the refusal Claude Code gives when the `tools` list resolves to nothing |
| `resolveSubagentType` | function | The subagent an Agent tool call runs |
| `Restart` | type | A workflow agent attempt that starts again: its number (from 2) and labels |
| `ResumedSessionAgent` | type | What `resumeSessionAgent` returns |
| `resumeSessionAgent` | function | The agent of a resumed session |
| `rewriteWorkflowMeta` | function | Sets fields of the `meta` literal and keeps every other byte of the script |
| `runsInBackground` | function | Whether a subagent runs in the background. "With nothing configured, a subagent that Claude spawns from your main conversation starts in the background" |
| `SAVE_SCOPES` | constant | Where a saved workflow is written and which one `/<name>` runs |
| `SAVED_STATUSES` | constant | Which agents run again when a workflow run is relaunched |
| `SavedAgent` | type | One agent of the earlier run, in the order it started |
| `SavedResolution` | type | What `resolveSavedWorkflows` returns |
| `SavedScan` | type | What `scanSavedWorkflows` returns |
| `SavedScanRequest` | type | Reads the saved workflows through the `FolderScan` port |
| `SavedStatus` | type | One of `SAVED_STATUSES` |
| `SavedWorkflow` | type | A workflow file found in a save location |
| `SaveOutcome` | type | What `planWorkflowSave` returns |
| `SavePlan` | type | The `plan` argument of `refuseLinks` |
| `SaveRequest` | type | The `request` argument of `planWorkflowSave` |
| `SaveScope` | type | One of `SAVE_SCOPES` |
| `scanAgents` | function | Every agents folder of a session: managed, the project (and the added directories), personal |
| `ScannedAgent` | type | The `entries` field of `AgentScanOutcome`; The `scanned` field of `AgentSources` |
| `scanSavedWorkflows` | function | Scans the user and repository folders for saved workflows |
| `ScriptHead` | type | A script split at the end of its `meta` statement |
| `ScriptReport` | type | What `inspectWorkflowScript` returns |
| `ScriptScope` | type | How much of a script to tokenize: the `meta` statement only, or all of it for a scan of the body |
| `selectAgentHooks` | function | The groups of the agent's frontmatter that fire for one occurrence of an event |
| `selectSessionAgent` | function | The subagent a session runs as: `--agent <name>` over the `agent` setting ("`--agent` takes precedence over this key for one session") |
| `SESSION_KINDS` | constant | When a run hits your usage limit: the run pauses instead of failing the agent, when all of the conditions hold; when one does not, the affected agent fails |
| `SessionAgentChoice` | type | What `selectSessionAgent` returns |
| `sessionAgentLabel` | function | The startup header's mark: "The agent name appears as `@<name>`" |
| `SessionAgentSource` | type | Where the choice of the session agent came from: `--agent` ("The CLI flag overrides the setting"), the `agent` key of a settings source, or a plugin's default `agent` |
| `SessionKind` | type | One of `SESSION_KINDS` |
| `Shadowed` | type | The `shadowed` field of `AgentCatalog` |
| `SilenceInput` | type | The `input` argument of `hasStalled` |
| `SkillCatalog` | type | What the host knows about its skills; narrow so the skills package need not be imported |
| `SkillSkipReason` | type | The `skipped` field of `PreloadPlan` |
| `spawnableAgents` | function | The catalog an agent sees through its Agent tool |
| `spawnDepthLimit` | function | `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`: "the number of subagent layers you want below your main conversation" |
| `spawnRefusal` | function | Why an Agent call may not spawn `subagentType` under the caller's `spawnTypes` (`resolveSubagentTools`), or `undefined` when the allowlist lets it through |
| `SpawnTypes` | type | What the `Agent` tool may spawn: a list of types, any type, or none (without the tool) |
| `StallWindowInput` | type | The `input` argument of `stallWindowMs` |
| `stallWindowMs` | function | How long Claude Code waits for output from an agent before it ends the attempt |
| `StartContext` | type | What a subagent loads when it starts |
| `STOP_SCOPES` | constant | What a workflow stop covers: the whole run or one agent |
| `StopScope` | type | One of `STOP_SCOPES` |
| `structuredOutputAttempts` | function | How many attempts a subagent's structured output gets: `MAX_STRUCTURED_OUTPUT_RETRIES` or 5 |
| `SubagentEffortInput` | type | The `input` argument of `resolveSubagentEffort` |
| `SubagentModeBasis` | type | How the mode came about: `inherited` (nothing set), `set` (its own applies), `main` (the main's held) |
| `SubagentModel` | type | What `resolveSubagentModel` returns |
| `SubagentModelInput` | type | The `input` argument of `resolveSubagentModel` |
| `SubagentPermission` | type | What `resolveSubagentPermissionMode` returns |
| `SubagentPermissionInput` | type | What decides the subagent's mode beyond its own `permissionMode` |
| `SubagentPromptSurface` | type | Where a subagent's permission prompts appear |
| `SubagentRun` | type | How a subagent is started, as far as its tools are concerned |
| `SubagentTypeOutcome` | type | What `resolveSubagentType` returns |
| `ToolEntry` | type | One entry of the `tools` or `disallowedTools` field: a tool name, with the specifier it was written with, or `Agent(type,...)` |
| `toolEntryMatches` | function | Whether `entry` names the tool `toolName` |
| `ToolPool` | type | The tools the main conversation offers: what a subagent inherits from (a host passes it) |
| `ToolRefusal` | type | The entries, by what went wrong |
| `ToolsOutcome` | type | What `resolveSubagentTools` returns |
| `truncateMemoryIndex` | function | The part of a `MEMORY.md` index that the subagent's system prompt includes: "the first 200 lines or 25KB..., whichever comes first" |
| `turnLimitOutcome` | function | Whether the subagent has reached `maxTurns`: "Maximum number of agentic turns before the subagent stops" |
| `TurnLimitOutcome` | type | What `turnLimitOutcome` returns |
| `TypeaheadEntry` | type | What `agentTypeahead` returns |
| `usageLimitDecision` | function | Whether the run waits for the reset or the agent that hit the limit fails |
| `UsageLimitDecision` | type | What `usageLimitDecision` returns |
| `UsageLimitFacts` | type | The `facts` argument of `usageLimitDecision` |
| `workflowArgs` | function | The `args` global for a call |
| `WorkflowArgs` | type | Input to a saved workflow |
| `workflowConcurrency` | function | How many agents a run executes at once: 16, "fewer when Claude Code has fewer CPUs available", or the variable's value from 1 to 256 |
| `WorkflowFailureCause` | type | One of `FAILURE_CAUSES` |
| `WorkflowMeta` | type | The `meta` field of `PluginWorkflow`; What `readWorkflowMeta` returns |
| `worktreeDisposition` | function | What happens to a subagent's worktree when it finishes |
| `WorktreeDisposition` | type | What `worktreeDisposition` returns |
