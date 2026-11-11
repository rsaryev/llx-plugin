# `@rsaryev/llx-plugin/skills`

Skills and commands: scanning, the catalog, invocation, expansion and lifecycle.

One row per export; `scripts/check-docs.ts` (DOC3) keeps this table equal to the entry's exports.

| Name | Kind | What it is |
| --- | --- | --- |
| `admitSkillHooks` | function | Whether a skill's hooks fit what its source already registered |
| `AllowedToolsSubstituted` | type | What `substituteAllowedTools` returns |
| `ArgumentInput` | type | Argument substitution: `$ARGUMENTS`, `$ARGUMENTS[N]`, `$N` and `$name` over the original text in one pass |
| `attachesFileReferences` | function | Whether an expansion of a skill from `origin` attaches its references; `isolated`: a cloud or Cowork session |
| `buildVariables` | function | The scope `loading/resolve` substitutes in, and the names this skill leaves as written |
| `checkInvocation` | function | Whether `by` may start `skill`, with the reason and the text to give back when not |
| `CommandEntriesLoaded` | type | The manifest's `commands` object map: each entry becomes a command named after the plugin prefix and its key |
| `ContainerRequest` | type | One skills container that is not a scope's `.claude/skills`: the folder a plugin's manifest lists under `skills`, a store's or a curator's skills directory |
| `countSkillHooks` | function | The hooks and matcher characters of one skill's `hooks`: "A matcher with several hooks under it counts once for each hook" |
| `DenialReason` | type | Why a skill invocation is refused |
| `DISTRIBUTION_PATHS` | constant | Where a skill is distributed |
| `DistributionPath` | type | One of `DISTRIBUTION_PATHS` |
| `EffortChoice` | type | The `effort` field of `TurnOverrides` |
| `EMPTY_LEDGER` | constant | The ledger of a session with no skill loaded |
| `Execution` | type | What `resolveExecution` returns |
| `ExecutionContext` | type | The `context` field of `ExpandRequest`; The `ctx` argument of `resolveExecution` |
| `ExecutionEnvironment` | type | The two variables a skill's execution reads |
| `ExpandPolicy` | type | The managed settings that take a skill's `allowed-tools` or `hooks` away |
| `ExpandPorts` | type | The `ports` argument of `expandSkill` |
| `ExpandRequest` | type | The `request` argument of `expandSkill` |
| `ExpandSession` | type | The values a skill's variables need beyond the request itself (see `SkillSession`) |
| `expandSkill` | function | Expands `skill` for one invocation |
| `Expansion` | type | The `expansion` field of `MentionExpansion`; What `expandSkill` returns |
| `Exposure` | type | What one state leaves visible: "Listed to Claude" and "In `/` menu" of the docs table |
| `exposureOf` | function | What the skill's state leaves visible to Claude and to the user |
| `FileReference` | type | The files a text names with `@` |
| `findInjections` | function | The placeholders of `content`, in order, without overlap |
| `ForkAgents` | type | The host's catalog: the startup context of a subagent type, or `undefined` when no such agent exists |
| `ForkLaunch` | type | How a forked skill launches: the subagent, its task and system prompt |
| `ForkResult` | type | What `launchFork` returns |
| `ForkStartContext` | type | What a subagent loads when it starts |
| `frontmatterIssues` | function | The hard error of an upload or packaging for a `SKILL.md`, or none |
| `HooksAdmission` | type | What `admitSkillHooks` returns |
| `hookSourceOf` | function | The source a skill counts under: the project, the personal folder, or one plugin |
| `HookUsage` | type | The `used` argument of `admitSkillHooks`; What `countSkillHooks` returns |
| `Injection` | type | What `findInjections` returns |
| `InjectionContext` | type | The `context` argument of `runInjections` |
| `InjectionKind` | type | Where a skill asks for dynamic context: an inline command or a command block |
| `InjectionPorts` | type | The `ports` argument of `runInjections` |
| `InjectionResults` | type | What `runInjections` returns |
| `Invocable` | type | A skill or a command file: both carry the two frontmatter fields |
| `Invocation` | type | The `invocation` argument of `invokeSkill` |
| `invocationPolicy` | function | The whole matrix for one skill: the frontmatter and the override together. "Description not in context" for `disable-model-invocation: true` |
| `InvocationPolicy` | type | The `policy` field of `SessionSkill`; What `invocationPolicy` returns |
| `InvocationVerdict` | type | What `checkInvocation` returns |
| `Invoker` | type | One of `INVOKERS` |
| `INVOKERS` | constant | Who starts a skill: the user typing `/name`, Claude through the Skill tool, a subagent's `skills` list (preloading) |
| `invokeSkill` | function | Records an invocation |
| `isDormant` | function | It sets `paths` and no touched file has activated it yet: the listing names it alone |
| `isLeading` | function | Whether a skill mention leads the message |
| `launchFork` | function | The launch of a forked skill |
| `LeadingMention` | type | A mention that starts the message: the skill runs |
| `listedAs` | function | What the model's listing says of a skill before the budget |
| `ListingBudget` | type | The `budget` field of `ListingOptions` |
| `ListingEntry` | type | The `entry` argument of `listingLine`; The `entries` field of `ModelListingResult` |
| `listingLine` | function | Judgment: the docs give the content of a line, not its form |
| `ListingOptions` | type | The `options` argument of `listedAs`; The `options` argument of `modelListing` |
| `loadCommandEntries` | function | Load every entry of a `commands` object map |
| `LoadedSkill` | type | One invocation that is in the conversation |
| `MentionOptions` | type | The `options` argument of `MentionPart.messageMentions`; The `options` argument of `readSkillMentions` |
| `menuEntries` | function | The rows of the `/` menu, in the official `SlashCommand` shape: the skills a user may type (`user-invocable: false` and an `off` override are hidden) |
| `MenuOptions` | type | The `options` argument of `menuEntries` |
| `ModelAvailability` | type | What the host knows about which models may run (`availableModels`, the permission mode) |
| `ModelKept` | type | The `modelKept` field of `TurnOverrides` |
| `modelListing` | function | The skills the model reads about, with the description of the least used dropped first until the listing fits the budget |
| `ModelListing` | type | What the model is told about a skill: name and description, name only, or nothing |
| `ModelListingResult` | type | The `model` field of `SkillsListing`; What `modelListing` returns |
| `NamedInvocable` | type | A catalog row: the skill and every name that invokes it, the listed command first |
| `NameHolder` | type | Who holds a name: a skill or command file of the folders, or (absent) another source of commands |
| `NestedScan` | type | Skills of a `.claude/skills` below the working directory |
| `OVERRIDE_EXPOSURE` | constant | The docs table, a row per state: the registry the policy, the listing and the menu read |
| `overrideMenuLabel` | function | The menu label of a skill override state |
| `OverrideState` | type | The `override` field of `SessionSkill`; The `state` argument of `overrideMenuLabel` |
| `parseArguments` | function | `raw` split into arguments the way a shell would: `"hello world" second` is two |
| `PathGateOptions` | type | Whether a skill's `paths` activate it for a file |
| `PlannedCommand` | type | One command to run: what is checked, what the shell gets, and its placeholder (for messages) |
| `readExecutionEnvironment` | function | Reads the environment that affects skill execution |
| `readFileReferences` | function | The references of `text`, in order, each once |
| `readSkillMentions` | function | The skills a message mentions |
| `reattachAfterCompaction` | function | What auto-compaction carries forward after the summary |
| `ReattachOptions` | type | The `options` argument of `reattachAfterCompaction` |
| `ReferenceBase` | type | The `base` argument of `readFileReferences` |
| `Resolution` | type | What `resolveFolderSkills` returns |
| `ResolvedFolderSkill` | type | The `resolved` field of `Resolution` |
| `resolveExecution` | function | Inline, or a forked subagent and whether the caller waits for it |
| `ResolveFolderOptions` | type | The `options` argument of `resolveFolderSkills` |
| `resolveFolderSkills` | function | Resolves the skills and commands scanned from the folders into names |
| `resolveShell` | function | Which tool runs a skill's `` !`command` `` blocks, or the one failure that stops the invocation |
| `resolveTurnOverrides` | function | The model and effort a skill sets for the rest of the turn, or for its forked subagent |
| `ruleActivatesFor` | function | Whether a memory rule loads for `filePath`, which Claude read, wrote or edited |
| `ruleBase` | function | The folder a rule's patterns are relative to |
| `runInjections` | function | Runs the commands one after another, in order (they share the working directory) |
| `SCAN_SCOPES` | constant | Where skills and command files are read from, one rule per scope |
| `ScanContext` | type | The `context` argument of `scanFolders`; The `context` argument of `scanNested` |
| `scanFolders` | function | Every scope of a session, in precedence order |
| `ScannedEntry` | type | What a scan of the scope folders returns |
| `scanNested` | function | The skills of the directories between the working directory and the file Claude touched, outermost first, leaving out the ones the session already scanned (`loaded`) |
| `ScanOutcome` | type | What `scanFolders` returns; What `scanSkillContainer` returns |
| `ScanRequest` | type | What a scan is asked for |
| `ScanScope` | type | One of `SCAN_SCOPES` |
| `scanSkillContainer` | function | The skills of `container` (a path relative to `dir`, `.` for `dir` itself) read through the port |
| `ScopeFileKind` | type | A skill folder or an older command file |
| `scopeFilePath` | function | Where a skill or command file named `name` of `scope` lives, below `scopeFolder`: the scope's `.claude` folder (for `user`, the configuration directory) |
| `SessionLimits` | type | What the host knows about the session beyond the environment the kit reads itself |
| `ShadowedEntry` | type | An entry that lost its name to another, for a host that wants to say so |
| `ShellArguments` | type | How a `!` command receives the invocation's arguments: `pasted` (default, as Claude Code) or `environment-reference` |
| `ShellAvailability` | type | The `shells` field of `ExpandRequest`; The `tools` argument of `resolveShell` |
| `ShellCall` | type | One shell command a skill runs, as a permission rule sees it |
| `ShellPermission` | type | The host's answer for one command: what its permission rules and the skill's grants decide |
| `ShellResolution` | type | What `resolveShell` returns |
| `skillActivatesFor` | function | Whether the skill is active for `filePath` when the session's directory is `cwd` |
| `SkillDelivery` | type | What enters the conversation for an invocation |
| `SkillLedger` | type | The `ledger` argument of `invokeSkill`; What `invokeSkill` returns |
| `skillLookup` | function | The rows by name |
| `SkillLookup` | type | What `skillLookup` returns; The `catalog` argument of `stackSkills` |
| `SkillMention` | type | Where a message names a skill |
| `skillNamesOf` | function | The skill's command first, then every other name, then the aliases the host knows (a bundled skill's alias, `/review` for `/code-review` |
| `SkillOverrides` | type | `skillOverrides` as the SDK types it: skill name to one of four states |
| `SkillPluginSource` | type | Where a plugin came from, which the host knows and the kit cannot see |
| `SkillsDirectoryPlugin` | type | A skill folder that is also a plugin, `<name>@skills-dir` |
| `SkillSession` | type | The `session` argument of `buildVariables` |
| `SkillVariablePorts` | type | The ports a skill's variables are read through |
| `SkillVariables` | type | What `substituteVariables` needs: the shared scope and the names this skill leaves as written |
| `Stack` | type | What `stackSkills` returns |
| `StackOptions` | type | Several skills in one message: at the terminal prompt `/write-tests /fix-issue 123` loads both skills and passes `123` to each |
| `stackSkills` | function | The skills a message starts with and the argument text they share |
| `startTurn` | function | The user sends a message: the skills' content stays, but "an `allowed-tools` grant clears when you send your next message" |
| `substitute` | function | Arguments first, then `${CLAUDE_*}` over the result (so over the inserted arguments too) |
| `substituteAllowedTools` | function | The `allowed-tools` of a skill with `${CLAUDE_*}` replaced in its Bash rules |
| `substituteArgumentPieces` | function | `substituteArguments` over the pieces of one text, for a text cut at its `` !`command` `` placeholders (`skills/expand`) |
| `substituteArguments` | function | `$ARGUMENTS`, `$ARGUMENTS[N]`, `$N` and `$name` in `content` |
| `substituteVariables` | function | `${CLAUDE_*}` in skill content: the paths written in |
| `Substitution` | type | What `substitute` returns |
| `SubstitutionInput` | type | The `input` argument of `substitute` |
| `TokenCounter` | type | The `tokens` field of `ReattachOptions` |
| `Trigger` | type | What fires a skill; the last two always wait for a forked skill's result |
| `TurnOverrides` | type | What `resolveTurnOverrides` returns |
| `TurnSession` | type | The `session` argument of `resolveTurnOverrides` |
| `VariableSource` | type | Anything with an origin; a `Command` has no folder of its own |
| `VariablesSubstituted` | type | What `substituteVariables` returns |
| `WaitReason` | type | Why a forked skill waits for its result instead of running in the background |
| `YieldedName` | type | A name an entry would have liked and did not get, and who has it |
