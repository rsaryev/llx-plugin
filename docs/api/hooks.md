# `@rsaryev/llx-plugin/hooks`

The hook engine: selection, running the handlers, reading their output and the verdict.

One row per export; `scripts/check-docs.ts` (DOC3) keeps this table equal to the entry's exports.

| Name | Kind | What it is |
| --- | --- | --- |
| `allowedTerminalSequence` | function | The value itself when every part is allowlisted, else `undefined`: the field is ignored |
| `BackgroundDelivery` | type | What `async` and `asyncRewake` hooks hand over once their process ends |
| `BackgroundOutcome` | type | How a background hook's process ended: `cancelled`, `timed-out` or `failed` |
| `BackgroundResult` | type | What a background hook reports once its process ends |
| `BackgroundRun` | type | A hook running in the background: the engine goes on, and reads `done` when it settles |
| `BlockInfo` | type | The action is held back; `reason` is the text Claude or the user is given, as the docs route it |
| `BlockRoute` | type | Who is shown the text of a block, as the docs route it: `claude` (the denial reason, the feedback), `user` (the block message), both (`PostToolBatch` |
| `BlockVia` | type | Why the action is held back, and how it was decided |
| `BodyReading` | type | An `http` hook's body: "2xx with an empty body: success"; "2xx with a JSON object body: parsed using the same JSON output schema" |
| `buildHookInput` | function | The JSON a command hook reads on stdin and an HTTP hook receives as its POST body, from the event's facts and the session: the common input fields, then the event's own |
| `BuiltHookInput` | type | The input of an event: the official shape, plus the documented `scratchpad_dir` |
| `BuiltInput` | type | What `buildHookInput` returns |
| `Cadence` | type | Per session, per turn, and on every tool call |
| `canonicalMatcherModel` | function | The canonical name of the model a switch goes to, which `PreModelSwitch` and `PostModelSwitch` matchers compare against |
| `CAPPED_FIELDS` | constant | The groups of fields an event can discard |
| `CappedField` | type | One of `CAPPED_FIELDS` |
| `Cell` | type | One cell of `EXIT_TABLE`: the result, the fields applied and where the message comes from |
| `CHECKED_TOOL_OUTPUTS` | constant | The tools whose output shape the kit checks |
| `checkOutput` | function | Checks a hook's JSON output against the event's schema |
| `ClassifierNote` | type | The `note` argument of `restoredNote`; What `restoredNote` returns |
| `ClassifierTrust` | type | How much the classifier may trust the note |
| `CommandRawRun` | type | What running a command hook returns |
| `CommonInput` | type | The fields every event's input has |
| `composePrompt` | function | The prompt with every `$ARGUMENTS` replaced by `inputJson` and every `\$` by `$`, in one pass so the input JSON is never unescaped or searched for the placeholder again |
| `consumedByRun` | function | Whether the session removes this handler after the run |
| `createEnvFiles` | function | The `CLAUDE_ENV_FILE` files of a session over an `EnvFileStore` |
| `createHookEngine` | function | The engine over the real stages: select, build, run through the ports, read, merge |
| `createHookRegistry` | function | An immutable registry; `with` appends, `without` drops by id, each returning a new one (itself when nothing changes) |
| `createOnceClaims` | function | The claims of `once` hooks: each runs once per session |
| `createOutputStage` | function | The real output stage the engine takes: parse, cap, merge |
| `createStopBlockCap` | function | The cap on how many times Stop hooks block in a row |
| `DeferResolution` | type | What `resolveDefer` returns |
| `DeferTurn` | type | What the host knows of the turn the tool call belongs to |
| `Delivery` | type | Where the reason goes |
| `DispatchRequest` | type | The `request` argument of `HookEngine.dispatch` |
| `ENV_FILE_KINDS` | constant | The port of `CLAUDE_ENV_FILE`: the host owns the files, the kit decides which one an event's hooks write and when one is cleared |
| `EnvFileKind` | type | One of `ENV_FILE_KINDS` |
| `envFileKindOf` | function | The file the hooks of this event append to, or none for an event that has no `CLAUDE_ENV_FILE` |
| `EnvFiles` | type | The files of one session: what hooks write them, and what the shells that run later read from them |
| `EnvFilesOptions` | type | The `options` argument of `createEnvFiles` |
| `EnvFileStore` | type | The `envFiles` field of `PluginHostOptions`; The `store` argument of `createEnvFiles` |
| `EVENT_CATALOG` | constant | Every hook event's cadence, handler types and the tools that never fire it |
| `EventEffects` | type | The `effects` field of `HookOutcome`; The `effects` argument of `finalizeEffects` |
| `EventFactsOf` | type | The `facts` argument of `buildHookInput`; The `facts` field of `DispatchRequest` |
| `EventInfo` | type | One row of `EVENT_CATALOG` |
| `escapeReminderTags` | function | A text with every `<system-reminder>` and `</system-reminder>` tag's `<` replaced by `&lt;`, as Claude receives a hook's string |
| `eventsSupporting` | function | The events that run handlers of this type |
| `EventWithSpecificOutput` | type | Events whose JSON output has an event-specific part |
| `EXIT_TABLE` | constant | What a command hook's exit code and stdout mean together |
| `EXIT2_RULES` | constant | What exit code 2 does for each hook event |
| `Exit2Effect` | type | What exit 2 does to the thing the event guards |
| `Exit2Rule` | type | What exit code 2 does for one event: whether it blocks, its effect and where stderr goes |
| `ExitClass` | type | The table of "Exit code output": what a hook's stdout and its exit code come to together |
| `exitClassOf` | function | The class of an exit code: zero, two or other |
| `ExitedRun` | type | A run that ended: the exit code and what the process wrote |
| `Feedback` | type | Text from a hook that goes to Claude or to the user without blocking anything |
| `Fields` | type | Whether the JSON fields count |
| `fileChangedWatchList` | function | The matcher "serves two roles" |
| `finalizeEffects` | function | The effects of an event once a block applied |
| `firesForTool` | function | Whether a call to `toolName` fires `event` at all |
| `ForegroundRun` | type | A run that ended another way |
| `groupDeliveries` | function | The deliveries as one value, in the order given; pure |
| `HandlerResult` | type | The raw run and the issues the run itself found (warnings, a refusal) |
| `HandlerRun` | type | A short record of one handler's run for the host's log |
| `HandlerStatus` | type | What a hook's run came to |
| `handlerTimeoutMs` | function | The limit in milliseconds the port enforces on this handler, or `undefined` for none (an `async` command hook) |
| `HandlerVerdict` | type | The reading of one handler's run |
| `hasRunnableHandler` | function | Whether some registered handler of the event could run in this session |
| `HeldOpenResult` | type | What a runner answers when it can tell that a process the hook started still holds the output open |
| `HOOK_EVENTS` | constant | Every hook event Claude Code fires, in its documented order |
| `HOOK_HANDLER_TYPES` | constant | Every handler type, in the order hooks.md lists them ("Hook handler fields") |
| `HookEngine` | type | What `createHookEngine` returns |
| `HookEngineOptions` | type | What the engine cannot read off a port: the machine, and the output stage |
| `HookEnvFiles` | type | What a command hook asks for its `CLAUDE_ENV_FILE`: the path for this event and this hook's shell, or none |
| `HookHandler` | type | One handler: a command, an HTTP request, an MCP tool call, a prompt or an agent |
| `HookHandlerOf` | type | The handler of type `T` |
| `HookHandlerType` | type | The `handlerTypes` field of `EventInfo`; The `type` argument of `eventsSupporting` |
| `HookInputOf` | type | The input Claude Code sends a hook on event `E` |
| `HookMatcherGroup` | type | One `{ matcher, hooks }` group under an event |
| `HookNotice` | type | A `<hook name> hook error` notice, verbatim as the docs show it |
| `HookObserver` | type | The host's window onto a dispatch: `started` is the run stage's, the others the engine's |
| `HookOutcome` | type | What an event came to, merged over every handler that ran |
| `hookPermissionMode` | function | The `permission_mode` a hook receives: one of `"default"`, `"plan"`, `"acceptEdits"`, `"auto"` |
| `HookPorts` | type | The ports the engine runs handlers through: each handler type needs its own |
| `HookRegistry` | type | What is installed: pure and immutable, built by the host from enabled plugins, settings, skills and agents |
| `HookSession` | type | What the host knows about the running session, beside the event |
| `HookSource` | type | The `source` field of `RegisteredHandler`; The `source` argument of `Exit2Rule.missingFileIsError` |
| `HookSourceKind` | type | Where a registered handler was declared |
| `HookSpecificOutput` | type | The event-specific part of a hook's JSON output, for the events that have one |
| `HookSpecificOutputOf` | type | The `hookSpecificOutput` of one hook event |
| `HooksSettings` | type | The shape of hook configuration, derived from the official `Settings` type |
| `HookStarted` | type | `statusMessage`: "Custom spinner message displayed while the hook runs" |
| `HttpFailedRun` | type | The request never got an answer ("Connection failure: non-blocking error") |
| `HttpHookPolicy` | type | The two outer limits on `http` hooks |
| `HttpRun` | type | The server answered: any status, with the body as text |
| `IfEvaluator` | type | Evaluates one `if` rule against a tool call, with whatever context rules need (cwd, home) |
| `ifEvaluatorFor` | function | The evaluator of permission rule syntax over a match context the host (or the engine) built |
| `InterpretContext` | type | What the run of `entry` on `event` came to |
| `interpretRun` | function | The verdict of one handler's raw run |
| `INTERRUPT_KEYS` | constant | What a user's interrupt does to the hooks of an event. - `PostToolUse` |
| `InterruptKey` | type | One of `INTERRUPT_KEYS` |
| `isPromptEvent` | function | Whether an event takes a prompt or agent hook's `ok: false` |
| `limitDelivery` | function | What a background hook delivers, under the same cap and escape as a foreground hook's text |
| `MATCHER_TARGETS` | constant | What each hook event's matcher is tested against |
| `MATCHER_VALUES` | constant | The documented matcher values of the events that have a fixed set of them |
| `MatcherTarget` | type | What one event's matcher is tested against |
| `MatcherValue` | type | What a matcher is tested against: a value (possibly absent), or nothing to filter on |
| `McpRun` | type | The MCP tool answered: `isError` is the tool's own flag, `text` its text content |
| `MergedBlock` | type | The merge of every hook's output on one event (hooks hold no knowledge of its rules) |
| `MergedOutput` | type | What `mergeOutputs` returns; What `OutputStage.merge` returns |
| `mergeOutputs` | function | `facts` carry what a rule needs from the event (`source`, `tool_name`) |
| `mergeWatchPaths` | function | Hooks.md, "CwdChanged" and "FileChanged" output: `watchPaths` |
| `MessageFrom` | type | What the message of the outcome is made of |
| `ModelCatalog` | type | The canonical name of a model; the host knows its models |
| `ModelFailedRun` | type | The model did not answer, or answered something that is not the response schema |
| `ModelRun` | type | The model's verdict, validated against the response schema |
| `MonitorTreatment` | type | How a Monitor call reached a hook through a `Bash` matcher or its own |
| `okFalseEffect` | function | What the verdict of a prompt or agent hook does on `event` |
| `OkFalseEffect` | type | What `okFalseEffect` returns |
| `OkFalseOptions` | type | The `options` argument of `okFalseEffect` |
| `OnceClaims` | type | The `once` handlers of a session: held while a dispatch runs one, spent after its first successful run (a background one when its process ends) |
| `OUTPUT_CAPS` | constant | `terminalSequence` is dropped nowhere here |
| `OutputCap` | type | Which capped output fields an event accepts and which it discards |
| `OutputStage` | type | The output stage the verdict and the dispatch lean on: `hooks/output` implements it |
| `OutputStageOptions` | type | The `options` argument of `createOutputStage` |
| `ParsedOutput` | type | A hook's parsed JSON output, as the output stage (`hooks/output`) checked it for its event |
| `ParsedPermissionUpdates` | type | What `parsePermissionUpdates` returns |
| `parseHookOutput` | function | The output stage's `parse`: the checked output, or why it failed |
| `ParseOutput` | type | The `parse` field of `InterpretContext`; The `parse` field of `OutputStage` |
| `parsePermissionUpdates` | function | The valid entries of `raw` and an issue for each that is not: an entry never takes its neighbours down |
| `ParseResult` | type | The output stage's reading of one JSON value (`parseHookOutput`): the output, or why it failed |
| `permissionRequestDecision` | function | The decision once the `PermissionRequest` hooks have answered |
| `planTimeouts` | function | The plan of one dispatch: `selected` are the handlers of `event` that will run |
| `PowershellOptions` | type | The `options` argument of `EnvFiles.powershellVariables` |
| `PowershellReadOptions` | type | The `options` argument of `readPowershellVariables` |
| `PowershellVariables` | type | What `EnvFiles.powershellVariables` returns; What `readPowershellVariables` returns |
| `preToolUseHookOutcome` | function | What the permission check (`decide`) reads of the `PreToolUse` hooks |
| `PromptEvent` | type | The events that run `prompt` and `agent` hooks (`PermissionRequest`: prompt only) |
| `RawRun` | type | What running any hook returns: the command runs and the runs of the remote types |
| `readAsyncResponse` | function | Reads an async hook's response: the whole stdout, or one line of its own |
| `readBody` | function | Reads an HTTP hook's response body as empty, JSON or text |
| `readPowershellVariables` | function | The variables a PowerShell command receives out of the text of every file the session's hooks wrote |
| `readStdout` | function | Reads a command hook's stdout as empty, JSON or plain text |
| `RegisteredHandler` | type | What `HookScope.hookEntries` returns; The `entry` argument of `consumedByRun` |
| `RemoteRawRun` | type | The raw run of an HTTP, MCP tool or model hook |
| `resolveDefer` | function | The resolution of the merged `effects` of a `PreToolUse` dispatch in `turn` |
| `resolveWorktreePath` | function | The worktree path a `WorktreeCreate` outcome asks the session to use, or why creation fails |
| `restoredNote` | function | A host that stores a note and gives it back to the classifier after a resume passes it through this |
| `Result` | type | The `result` field of `Cell` |
| `RunContext` | type | The `context` argument of `runHandler` |
| `runHandler` | function | Runs one handler: tells the host it started (`statusMessage`), then hands it to the runner of its type |
| `runLimited` | function | Runs `run` for every handler at once, except that at most `limit` prompt or agent handlers are running at any moment; the rest start, in order, as running ones finish |
| `runnableHandlers` | function | The handlers of `entries` that would run in the session, in order |
| `RunPorts` | type | The ports a run uses; a host passes the ones its handlers need |
| `selectHandlers` | function | The handlers an event runs: the registered handlers of the event that nothing gates off (`disableAllHooks`, workspace trust, a disabled plugin) |
| `Selection` | type | What the select stage returns |
| `SelectRequest` | type | The `request` argument of `selectHandlers` |
| `serializeHookInput` | function | One JSON text for both transports: stdin of a command hook, body of an HTTP hook |
| `SessionEndLimits` | type | The limits `SessionEnd` hooks share: one budget for the event, and the default of each hook |
| `SettledDeliveries` | type | What a host takes from the deliveries of background hooks |
| `settleDeliveries` | function | Waits for the promises of `HookOutcome.background` and groups what they delivered, in the order of the promises |
| `SkippedRun` | type | A hook that did not run, and why (a refused shell-form `${user_config.*}`) |
| `SOURCE_POLICY` | constant | One row per kind: a registry over the union, so a new kind is a compile error here |
| `SourcePolicy` | type | What a kind of declaration site decides about its handlers, wherever the hooks read it |
| `StartObserver` | type | The part of the host's hook observer the run stage drives; the other callbacks are the engine's |
| `StderrChannel` | type | Where the stderr of an exit-2 hook goes |
| `StdoutClass` | type | "JSON object that passes schema validation", "JSON that can't be parsed or fails schema validation", "Plain text, or nothing" |
| `StdoutReading` | type | What a hook's stdout is: empty, one JSON object or plain text |
| `StopBlockCap` | type | What `createStopBlockCap` returns; The `stopCap` field of `HookEngineOptions` |
| `stripAnsi` | function | `text` without its ANSI escape sequences (CSI, OSC and two-character escapes) |
| `SUBPROCESS_KINDS` | constant | The environment of a subprocess Claude Code starts |
| `subprocessEnvironment` | function | The environment a subprocess of this kind inherits, with what Claude Code sets for it |
| `SubprocessEnvironmentInput` | type | The `input` argument of `subprocessEnvironment` |
| `SubprocessKind` | type | One of `SUBPROCESS_KINDS` |
| `supportsHandlerType` | function | Whether `event` runs handlers of this type; any other is skipped |
| `TaggedOutput` | type | One handler's output as the merge reads it |
| `TimeoutPlan` | type | What an event adds to the timeouts of its handlers; computed once per dispatch |
| `ToolCallView` | type | A tool call as a hook's `if` reads it |
| `UserInterrupt` | type | The key the user pressed while a tool ran, and what the host knows of what they queued |
| `withoutSpent` | function | The registry without the registrations a run spent; the same registry when none is in it |
| `WorktreeAnswer` | type | What a merged `WorktreeCreate` outcome holds of the hooks' answers |
| `WorktreeLocation` | type | What the host knows about where the hook ran |
| `WorktreePath` | type | The path, or why creation fails |
