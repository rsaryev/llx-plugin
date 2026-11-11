# `@rsaryev/llx-plugin/mods`

Mods: the mods host, its API, events and UI, and the test kit `modsTesting`.

One row per export; `scripts/check-docs.ts` (DOC3) keeps this table equal to the entry's exports.

| Name | Kind | What it is |
| --- | --- | --- |
| `actionButtons` | function | The buttons the user's `binding` of the keybinding action `action` presses |
| `activeModsLine` | function | The line `/plugin` shows under its tabs: `1 mod active · first-mod`, when a mod that is not built in has loaded |
| `AGENT_STATUSES` | constant | The `status` of each entry `$.agent.list()` returns; `idle` and `waiting` require Claude Code v2.1.289 or later, and the kit implements the current behaviour |
| `AgentStatus` | type | One of `AGENT_STATUSES` |
| `AgentType` | type | A subagent type a mod registered with `$.agent.register` |
| `AnyModEventName` | type | Any mods event name: engine, classic or API |
| `API_EVENT_NAMES` | constant | The mods events named after mods API methods |
| `API_RULES` | constant | The rules of the mods API calls: a hook on one "can return `next(e)`, `{ deny: reason }`, or `{ value }`", so any other result fails the hook like a throw |
| `ApiDescription` | type | `$` as plain data: every namespace in its order, and each member with how it answers |
| `ApiEventName` | type | The `event` field of `ApiMember`; The `path` argument of `HookCall.api` |
| `ApiMember` | type | The `members` field of `ApiNamespace` |
| `ApiMemberKind` | type | How a member of `$` answers (judgment: the docs publish the declarations of the mods API, not a description of them) |
| `ApiNamespace` | type | One namespace of the mods API and its members |
| `AsyncContext` | type | An async context the host's platform keeps across `await`: Node's and Bun's `AsyncLocalStorage` fits as it is (`() => new AsyncLocalStorage()`) |
| `AsyncContextFactory` | type | Makes a fresh `AsyncContext`: `() => new AsyncLocalStorage()` |
| `AT_ONCE_CALLS` | constant | The calls that answer at once, not with a promise: `$.ui.resolve`, the timers and the fired calls |
| `atom` | function | Declares a state atom with its key and initial value |
| `Atom` | type | What `atom` returns |
| `AtomKey` | type | `{ plugin, key }` as the type declaration file names a value; `id` names one member of a family |
| `AutocompleteRow` | type | The `claudeCode` argument of `autocompleteRows`; What `autocompleteRows` returns |
| `autocompleteRows` | function | The rows shown for a `prompt.autocomplete`: Claude Code's own first, then the rows the mods answered, "below Claude Code's own" |
| `BackdropBoard` | type | The session's one backdrop: a `$.theme.set` replaces it and `$.theme.clear` removes it, whichever mod set it |
| `BackdropDrawn` | type | What `$.theme.set` resolves to |
| `backdropRender` | function | The `ui.render` event of the `Backdrop` site when the Desktop or mobile app asks to draw the session's backdrop |
| `BandState` | type | The band's collapse. "The band stays collapsed until the user expands it, even after `/clear`, and is expanded again the next time Claude Code starts" |
| `BORDER_STYLES` | constant | `Box` `borderStyle` names; any other value draws no border |
| `borderOf` | function | The border a `Box` draws: its style when the docs name it, else none |
| `BorderStyle` | type | One of `BORDER_STYLES` |
| `Budget` | type | A time limit that only runs while the code it limits has the floor |
| `BudgetOptions` | type | The `options` argument of `createBudget` |
| `CallContext` | type | Who a mods API call is made for, and where it runs |
| `changeNotice` | function | The line for a reload that failed, or `undefined` for one that worked |
| `ChunkOf` | type | What `ModChain.dispatchStream` returns; What `ModsHost.fireStream` returns |
| `clampReason` | function | A hook's `drop` reason or `config.set` `deny` reason is cut at 4,096 characters, the end of a longer one, and the drop or deny still applies |
| `CLASSIC_EVENT_NAMES` | constant | The mods events of the classic hook events (`classic.<event>`) |
| `ClassicEventName` | type | The event of a settings hook event: `classic.Stop`, `classic.PostToolUse` |
| `clickFocuses` | function | Whether a click gives a pane focus: "in the terminal needs fullscreen rendering" |
| `clientFailure` | function | What takes a failed `Client`'s place in the terminal: the line above as dimmed text, so "the rest of your drawing still shows" |
| `CloseKind` | type | One of `CLOSE_KINDS` |
| `COLLAPSE_MARK` | constant | The mark at the right end of the expanded band's first row, which a click in fullscreen rendering collapses |
| `collapsedRow` | function | The one dim row of a collapsed band: `▸ plugin panel hidden · ctrl+x ctrl+a or click to show`, naming "the keys that expand it as the user has them bound" |
| `collectControls` | function | The controls of a tree with a key, in document order |
| `CommandDef` | type | A command a mod registered with `$.command.register` |
| `CommandListing` | type | One slash command as `$.command.list()` returns it |
| `CommandOrigin` | type | Who ran a command, in `prompt.submit`'s words: `composer` for the person's Enter, `sdk`, `bridge`,.. |
| `commandPresentation` | function | How a mod command presents: fullscreen and the columns |
| `CommandPresentation` | type | Where a command's answer will show: "The fact `RenderViewport`'s `isFullscreen` carries on every terminal drawing, from the same source", and the width |
| `CommandRunDepth` | type | Where a `command.run` stands for the host's nested `runCommand` |
| `commandRunEnd` | function | Where a `command.run` chain ends, one end for the user's `/name` (`ModsHost.runCommand`) and a mod's `$.command.run` |
| `CommandRuns` | type | The commands whose body (`ModsHost.runCommand`'s `options.core`, `ModCommands.run`) runs now, followed across `await` by the host's `AsyncContext` |
| `CommandSource` | type | Where a slash command comes from |
| `CompileResult` | type | What `ModCompiler.compile` returns; The `result` argument of `scanSourceOf` |
| `CompleteResult` | type | What `$.model.complete` resolves to: `usage` holds the Claude API's token and cache fields |
| `contextUsage` | function | The `context` of `$.session.usage()` and of a `session.measure` event: `{ tokens, window, percent }` |
| `Control` | type | What `collectControls` returns |
| `controlKey` | function | The key a control is addressed by: a button's `key`, `label` or single string child; an `Input` or `Select`'s `key` |
| `CopyResult` | type | What `$.ui.copy` resolves to: `{ isCopied: true }`, or `{ isCopied: false, reason }`; a host that gives no reason for a refusal gets `no-clipboard` |
| `CrashPlan` | type | What one stop of the worker comes to |
| `createBandState` | function | The collapsed state of a band |
| `createBudget` | function | A time budget over a clock, which can pause and draw from a parent budget |
| `createHotReloadGate` | function | The question of whether to enable hot reloading |
| `createModChain` | function | The chains of hooks, one per event, and what runs them |
| `createModsApi` | function | `$` for one mod: every namespace of the table, each call an event through the chain and then a port |
| `createModSettingsReader` | function | Builds the reader used by both engine and mod reads from the settings layers the kit owns |
| `createModsHost` | function | The mods host: loads mods and runs their hooks |
| `createModsUi` | function | The interface part of mods: what `$.ui` needs, and what the host asks of it (draw a site, report a failed `Client`, deliver a posted message) |
| `createPaneRegistry` | function | The registry of a session's mod panes |
| `createPlacedRows` | function | The rows mods placed, by request id |
| `createRedrawGate` | function | Throttles redraws to the rate of `rate` and coalesces the calls that come sooner into one redraw that runs `redraw` when it happens, so it reads the data as it is then |
| `createRegistries` | function | The registries of one mods host; `asyncContext` follows the command runs (`CommandRuns`) |
| `createReplayLedger` | function | `replayed` is told, once for each kind of call, that a fresh copy's call was answered from the first |
| `createRunGate` | function | The gate over the session's own numbers: the turns and the spend come from `ModSession` |
| `createStateStore` | function | The store of mods state values |
| `createToastBoard` | function | The toasts of a session. "In the classic renderer, a mod's newer toast can take the place of its older one that's showing or waiting to show" |
| `createWorkerHealth` | function | Tracks the hooks worker's crashes and which mods to unload |
| `Credential` | type | How the session signed in |
| `decideModLoad` | function | Whether `candidate`'s hooks module loads under `policy`, and in which tier |
| `decideSite` | function | Whether `site` is raised in `surface`: the "Rendered on" column of the render sites table |
| `DECLARED_API_MEMBERS` | constant | The members of `$` the declarations name and the reference page does not |
| `DECLARED_EVENT_NAMES` | constant | The engine's own events the declarations name and the reference page does not: `prompt.change`, raised after the prompt box changed |
| `DeclaredEventName` | type | One of `DECLARED_EVENT_NAMES` |
| `deepFreeze` | function | Freezes `value` and every plain object and array inside it, in place, and returns it |
| `DeepReadonly` | type | `T` with every property, element and nested value read-only |
| `defaultElementTable` | function | The elements `surface` draws (the check marks of the elements table) |
| `DenyRuleChecker` | type | The verdict of a deny rule on a tool call, from the permission rules; `unknown` when it cannot be told |
| `Deps` | type | What every namespace of one mod's `$` needs |
| `derive` | function | Declares a state value computed from other state sources |
| `Derived` | type | A value computed from others, again only once one of them changed |
| `describeApi` | function | The shape of a mod's `$` as plain data, read from the live API (so a namespace another mod added on `engine.create` is described |
| `digitButton` | function | The button a digit typed alone into an empty prompt (and then a pause) presses: "a digit `hotkey` on a button in the band also fires" |
| `DispatchOptions` | type | The `options` argument of `ModChain.dispatch`; The `options` argument of `ModChain.dispatchStream` |
| `DispatchTrace` | type | The hooks that handle an event, and the steps they took, in chain order (a function hook that ran to an answer is a step; a generator hook, or one that failed, is not) |
| `drawFaultLine` | function | The line for an error the app hit while drawing a tree or a site's props: `first-mod: ui.render (ToolUse) threw while drawn: <error>; the engine drew its own` |
| `Drawn` | type | What a site shows once the chain settled: the tree of a mod (replacing Claude Code's drawing), Claude Code's own drawing (with the props the last `next(e)` gave it) |
| `drawsAsLink` | function | Whether a `Link` draws as a link |
| `ELEMENT_COLUMN_OF` | constant | The column of the elements table each app draws by |
| `ELEMENT_COLUMNS` | constant | The apps of the elements table: its three columns |
| `ELEMENT_NAMES` | constant | The names of the mods UI elements |
| `ELEMENT_SURFACES` | constant | The apps that draw each element (the check marks of the elements table) |
| `ElementColumn` | type | One of `ELEMENT_COLUMNS` |
| `elementFn` | function | The constructor of `name`, the one `$.ui.resolve(e)` hands out: what a host rebuilds from a name it got across a boundary |
| `ElementFn` | type | One element as `$.ui.resolve(e)` gives it: a function from props (and `children`) to a node |
| `ElementName` | type | One of `ELEMENT_NAMES` |
| `elementNameOf` | function | The element `value` builds when it is one of the kit's constructors, else `undefined` |
| `ElementNode` | type | What an element function gives back: `{ type, props, children }`, the shape `find` of the test kit returns |
| `ElementTable` | type | The elements an app draws, by name: an element the app lacks is absent ("Apps other than the terminal have no `Raster`") |
| `ElementTables` | type | The element table of each (mod, app, render site), as `ui.resolve` left it |
| `ENGINE_EVENT_NAMES` | constant | Every event of the engine's own with a name of its own: the reference's, then the declarations' others |
| `ENGINE_ORIGIN` | constant | The origin of the engine's own hooks |
| `EngineEventName` | type | One of `ENGINE_EVENT_NAMES` |
| `EngineReadOptions` | type | What Claude Code's own `settings.read` needs |
| `EngineRef` | type | What `isEngineRef` returns |
| `engineStackIssue` | function | The issue for an engine that ran out of stack at `phase` on `file`; `message` is the engine's own text (used by `load`) |
| `ESM_FORMAT` | constant | The run format that is an ES module, so one output serves both readers |
| `EVENT_RULES` | constant | The rules of this part's events, for the chain (`createModChain({ clock, rules: [EVENT_RULES,...] })`) |
| `EVENT_SPECS` | constant | The events this part of mods knows: tools, prompts, commands and configuration, turns, the session and subagents |
| `EventData` | type | The fields of an event or a call's argument: plain data a hook may have changed |
| `EventInputOf` | type | The fields the docs name on an event's input, as a type |
| `eventInputProblem` | function | Why an event fired with `input` does not fit the fields the docs name on it, or `undefined` |
| `EventOf` | type | The `input` argument of `ModChain.dispatch`; The `input` argument of `ModChain.dispatchStream` |
| `EventRule` | type | What the kit says about one event |
| `EventRuleBook` | type | The rules of the events one part of mods knows, keyed by event name |
| `EventSpec` | type | What the kit knows about one event: the fields the docs name on its input, the shapes a hook can answer with (the "A hook can return" column) |
| `FaultReport` | type | What `ui.fault` carries: where the `Client` failed and the error message (an error with none is `NO_MESSAGE`) |
| `FetchPolicyFacts` | type | What the host knows about one request; whether the mod is built in the kit knows itself |
| `FetchRequest` | type | One HTTP request of `$.http.fetch` |
| `FetchResponse` | type | What `ModFetcher.request` returns |
| `FileReport` | type | The `manifest` field of `ValidateReport`; The `contents` field of `ValidateReport` |
| `FIRED_CALLS` | constant | The calls declared to answer nothing: each returns at once and its event goes on through the chain on its own |
| `FireOptions` | type | What a caller of `fire` may give: its own signal, the core behaviour at the end of the chain, and the narrowing options the chain has |
| `FocusGrantInput` | type | What caused a `$.ui.open` that asks for focus: a command or a press is the user's; a timer or hook is the mod's |
| `FoldOptions` | type | The `options` argument of `foldRender`; The `options` argument of `ModsUi.draw` |
| `foldRender` | function | Folds what the `ui.render` chain settled on into what is drawn |
| `Fragment` | function | `<>...</>`: "a column Box around the children" |
| `frozenCopy` | function | A frozen copy of every plain object and array in `value`: the event a host fires stays its own and can still change after the hooks ran |
| `FsAncestor` | type | One instruction file `$.fs.ancestors` found: its directory, the name asked for, its text and its parts |
| `FsAncestorsRequest` | type | What `$.fs.ancestors` asks for, its paths absolute |
| `FsEntry` | type | One entry of `$.fs.list`: `{ name, kind, size, mtimeMs, isLink }`; `mtimeMs` a regular file's own, 0 for any other kind and when the host gives none |
| `FsStat` | type | What `$.fs.stat` resolves to: `{ kind, size, mtimeMs, isLink }`, and `realPath` when it was asked with `{ resolve: true }` and the path leads somewhere |
| `Gesture` | type | A key of `GESTURES` |
| `grantsFocus` | function | Whether `focus: true` is granted |
| `GuestHook` | type | One hook a hooks module registered, as the runtime hands it back: a stand-in the kit can call |
| `GuestModule` | type | What `ModRuntime.load` returns |
| `h` | function | The JSX factory: "a plain-data element from a string tag or a component" |
| `handleKey` | function | What one key does |
| `HELD_AT_TIMEOUT` | constant | The line a foreground Bash or PowerShell command gets when it reaches its timeout while the session's input is held |
| `HOOK_FAILURE_KINDS` | constant | `HookFailure.kind`: a hook threw or misreturned, or ran over its time |
| `HookAccess` | type | Admission uses the original frozen input, not a previous hook's rewrite |
| `HookCall` | type | What a hook receives from the host's runtime to reach the kit: `$` calls, `next`, and its own signal |
| `HookFailure` | type | Why a hook's `.catch` handler is asked to answer: `next.error` |
| `HookFailureKind` | type | One of `HOOK_FAILURE_KINDS` |
| `HookOrigin` | type | `{ plugin, tier }` of whoever fired an event |
| `HookReport` | type | One line the chain reports when it skips a hook: `my-mod: tool.call hook skipped: threw Error: boom` |
| `hooksModulesOff` | function | Why a shell command that loads the tester's own mods cannot |
| `HookStep` | type | What one hook of a dispatch did, as `DispatchOptions.trace` reports it |
| `hookTightensOnly` | function | Whether a `tool.check` hook can only tighten a call that is not read-only, in this mode |
| `HotkeyContext` | type | The `context` argument of `actionButtons`; The `context` argument of `digitButton` |
| `hotkeyTable` | function | The button each hotkey presses now: a hotkey presses its button only while the pane or band has keyboard focus |
| `HotReloadAnswer` | type | What became of the hot-reloading question |
| `HotReloadGate` | type | What `createHotReloadGate` returns |
| `HotReloadState` | type | What a host keeps for the gate, so a resumed session still knows |
| `initialFocus` | function | The control that has the focus when a pane opens |
| `INPUT_CHANGED` | constant | The two texts of the denial: the server-side review, and the review some terminal and VS Code sessions name |
| `inputChangedDenial` | function | The denial of a call whose input a hook changed after the review |
| `InputReview` | type | A key of `INPUT_CHANGED` |
| `INSTRUCTION_FILE_KINDS` | constant | Every tier an instruction file can belong to |
| `Invalidator` | type | The `invalidator` field of `ModsUi`; The `invalidator` field of `UiParts` |
| `isElementNode` | function | An element: a known `type`, `props` that are a record and `children` that are a list |
| `isEngineOwnEvent` | function | Whether `name` is one of the engine's own events: a mod's call of one "runs the same chain with the calling hook alone skipped", every hook below the caller included |
| `isEngineRef` | function | Whether a value is a reference to an engine element |
| `isHookBody` | function | Whether a hook's answer is a body it streams: an async generator (or another async iterator with `next`), which is what a hook on a streaming event is |
| `isStatusStackVisible` | function | "The stack is hidden while a permission request or a dialog shows." |
| `isValidModName` | function | Whether `name` can name a command, a tool, a subagent type or a pane: letters, digits, `_` and `-`, up to 64 characters |
| `joinHandlers` | function | The plain tree with each control's callbacks back on it, found by the control's key |
| `jsonBytes` | function | The UTF-8 bytes of `value` written as JSON, or `undefined` when it cannot be |
| `jsonChars` | function | The characters of `value` written as JSON, or `undefined` when it cannot be (a cycle, a bigint, nothing to write) |
| `JsonObject` | type | What `contextUsage` returns; What `mergeModSettingsLayers` returns |
| `JsonValue` | type | A JSON value: what crosses between the kit and a mod's code |
| `JsxTag` | type | A tag JSX compiles to: an element's name, one of its constructors, or a component of the mod's |
| `KeyContext` | type | The `context` argument of `handleKey` |
| `KeyEffect` | type | What a key does while a pane or the band has keyboard focus |
| `KeyResult` | type | What `handleKey` returns |
| `KeyState` | type | The `state` argument of `handleKey`; The `state` field of `KeyResult` |
| `LoadedMod` | type | The `loaded` field of `ModLoadReport`; What `ModsHost.registerBuiltIn` returns |
| `ManagedModData` | type | Identity facts the embedding host knows before it emits an event |
| `MATCHER_MS` | constant | How long the engine has to test one pattern against one value (judgment: the docs give no limit for a matcher) |
| `MatcherEngine` | type | Runs a regular expression of a matcher outside the host's thread, or under a limit |
| `MatcherPattern` | type | One pattern ready to test strings |
| `matchesEvent` | function | Whether `event` passes `matcher` in this thread: every field the matcher names lets the event's field through (a list, any of its values |
| `memberOf` | function | The member of `source` for the event's `requestId`; `source` itself when the event has none |
| `mergeModSettingsLayers` | function | The same key-specific merge and managed exceptions as the host's settings, not a shallow merge |
| `mergeToolCheck` | function | The decision a call gets, from the decision Claude Code reached (what `next(e)` resolves to) and the one a mod answered |
| `MOD_EVENT_GROUPS` | constant | The events a mod can handle that have a name of their own, by group |
| `MOD_EVENT_NAMES` | constant | The 48 documented events, flat, in the order of the reference |
| `MOD_LIMITS` | constant | The limits on mods: hook time and sizes |
| `MOD_NAME_PATTERN` | constant | Command, tool, subagent type and pane names: letters, digits, `_` and `-`, up to `nameChars` |
| `MOD_SCAN_ISSUE_CODES` | constant | The one list of what a hooks module scan refuses, so a host tells the issues apart by `code` rather than by the words of `message` |
| `MOD_TIERS` | constant | A mod's priority group, in the order the chain runs them |
| `ModAccount` | type | The session's sign-in, as `$.session.identity()` answers it to a mod managed settings install |
| `ModAgents` | type | The `agents` field of `ModSessionPorts` |
| `ModApiSettlementOptions` | type | The `options` argument of `settleModApi` |
| `ModApprovalFacts` | type | Whether a call a user's mod approved still reaches the auto-mode classifier |
| `modApprovalSkipsClassifier` | function | True when the approved call runs without a classifier check |
| `ModAudio` | type | The ports a host may leave out (`ModOptionalPorts`, host-ports.ts) and what they answer |
| `ModCandidate` | type | What the host knows about a plugin that has a hooks module |
| `ModCatchNext` | type | `next` in a `.catch` handler: the failure, and whether the hook had called `next` |
| `ModChain` | type | What `createModChain` returns; The `chain` field of `Deps` |
| `ModChainOptions` | type | The `options` argument of `createModChain` |
| `ModCommands` | type | The `commands` field of `ModSessionPorts` |
| `ModCompiler` | type | TypeScript, TSX and JSX hooks modules to JavaScript; the host owns the compiler and chooses the format its engine runs |
| `ModConfig` | type | The `config` field of `ModSessionPorts` |
| `ModelCall` | type | The `call` argument of `ModModels.complete` |
| `ModEnv` | type | The environment variables a mod reads and sets; `snapshot` is the environment a command gets |
| `ModEventGroup` | type | A key of `MOD_EVENT_GROUPS` |
| `ModEventInput` | type | The fields of an event, as plain data |
| `ModEventName` | type | One of `MOD_EVENT_NAMES` |
| `ModFetcher` | type | The `fetcher` field of `ModPlatformPorts` |
| `ModFetchFacts` | type | The `facts` argument of `modFetchVerdict` |
| `modFetchVerdict` | function | With `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` the variable "stops only the mods built into Claude Code, plus any request that carries the session's Anthropic credentials" |
| `ModFetchVerdict` | type | What `modFetchVerdict` returns |
| `ModFs` | type | The host's file system, with the same permissions as the user running Claude Code |
| `ModHook` | type | A mod's hook for one event |
| `ModHookStream` | type | What `next(e)` is on a streaming event: the stream of everything beneath |
| `ModHostPorts` | type | Every port the mods API reaches, as the kit holds them once the optional ones are filled |
| `ModHostPortsInput` | type | What a host gives `createModsHost`: the platform and session ports, and any of the optional ones |
| `ModInterface` | type | The interface a host draws and the facts about it only the host knows |
| `modLineChannel` | function | Where `kind` of line is read in `session` |
| `ModLineChannel` | type | What `modLineChannel` returns; The `channel` field of `ModNotice` |
| `ModLineKind` | type | The lines the page lists: a refused hooks module, one that did not load, a hook skipped, a refusal by another mod, a stop of the hooks worker |
| `ModLineSession` | type | The `session` argument of `modLineChannel` |
| `ModLoadDecision` | type | What `decideModLoad` returns |
| `ModLoadReport` | type | What `ModsHost.load` returns; What `ModsHost.loadMod` returns |
| `ModMatcher` | type | A filter on an event's fields |
| `ModMatcherValue` | type | A value a matcher field can hold: a literal, or a regular expression (serialisable as `{ $regexp, flags }`) |
| `ModModels` | type | The session's credentials and models |
| `ModNext` | type | `next`: the following hooks, then Claude Code's own behaviour |
| `ModNotice` | type | A line for people (not the debug log) and where it is read |
| `ModNotifications` | type | The host that raises notifications: takes one of `plugin`'s back by its `key` |
| `ModOptionalPorts` | type | The ports a host may leave out: the declarations say what each call answers where the capability is missing (`OPTIONAL_PORT_DEFAULTS`) |
| `modOptions` | function | The options of one mod: each declared field's saved value, else its default |
| `ModOptions` | type | What `modOptions` returns |
| `ModOrder` | type | What `orderMods` returns |
| `ModPlatformPorts` | type | The ports of the machine the session runs on: time, paths, files, processes, the network, the environment and a plugin's store |
| `ModPlugin` | type | A plugin the host found: what the policy decides on, and its folder |
| `ModPluginInfo` | type | A loaded mod, as the chain knows it: its name, and the `$` its hooks receive |
| `ModPluginRef` | type | The `plugin` argument of `createModsApi` |
| `ModPromptBox` | type | The prompt box beyond its text: decorations a plugin paints, and the media of the prompt in flight |
| `ModPrompts` | type | The `prompts` field of `ModSessionPorts` |
| `ModRegistries` | type | What `createRegistries` returns; The `registries` field of `Deps` |
| `ModRuntime` | type | The host evaluates one compiled hooks module in an isolate it chooses (a worker, an isolate, a child process), calls its `register(on, options)` |
| `MODS_API` | constant | The mods API by namespace and method name: the `$` argument every hook receives, the reference's members and then the declarations' others |
| `MODS_API_REFERENCE` | constant | The mods API by namespace and method name as the reference page lists it, in its order |
| `MODS_APPS` | constant | The places of the docs' table (`claude -p` and the Agent SDK are one: `print`) |
| `MODS_MINIMUM_VERSION` | constant | The first Claude Code that loads mods, by where it runs |
| `ModsApi` | type | The `api` argument of `describeApi`; The `direct` field of `HookCall` |
| `ModsApiHandle` | type | What `createModsApi` returns |
| `ModsApiOptions` | type | What every mod's `$` shares: the chain its calls fire events through, the ports they reach, what mods registered |
| `ModsApp` | type | One of `MODS_APPS` |
| `ModScan` | type | What `scanHooksModule` returns |
| `ModScanIssue` | type | A scan issue: every one is an error, its message opening with the file |
| `ModScanIssueCode` | type | One of `MOD_SCAN_ISSUE_CODES` |
| `ModSession` | type | The `session` argument of `createRunGate`; The `session` field of `ModSessionPorts` |
| `ModSessionPorts` | type | The ports of the session itself: its transcript, turns, prompts, agents, commands, tools, models and settings |
| `ModSettingsReader` | type | Mods' own port for settings (not the settings stream's `SettingsSources`) |
| `ModsFiredMember` | type | The calls declared to answer nothing (`FiredEventName`) return `undefined` at once |
| `ModsHost` | type | What `createModsHost` returns; The `host` field of `ModToolFlow` |
| `ModsHostOptions` | type | The mods runtime a host embeds: the chain, the events, the API, the interface and the loader wired together |
| `ModsMember` | type | A method of the mods API: every call is asynchronous, as it is an event through the chain and then a port |
| `ModsMethod` | type | A method of one mods API namespace |
| `ModsNamespace` | type | A key of `MODS_API` |
| `ModsNamespaceApi` | type | `$`: the namespaces of the mods API, each holding its methods by name |
| `ModSpawner` | type | `spawn` of `$.process`: a long-running command whose output streams |
| `ModsPolicyInput` | type | The `policy` argument of `decideModLoad`; The `policy` argument of `hooksModulesOff` |
| `ModsRegistered` | type | What mods registered, as a host reads it (`ModsHost.registered`) |
| `ModsSettingsFile` | type | The keys of one settings file that affect mods, as the SDK types them |
| `ModsStreamMember` | type | `$.process.spawn` streams the command's output, so it returns the stream and not a promise |
| `ModsSyncMember` | type | `$.ui.resolve(e)` answers at once: the docs destructure its result without `await` |
| `modsTesting` | namespace | The test kit of plugins/mods/test.md, and the fakes a host tests its mods integration with |
| `ModsTimerMember` | type | `$.clock.after` and `$.clock.every` return their timer at once, as `setTimeout` does |
| `ModStore` | type | One JSON file per mod; the kit owns `get`, `set`, `delete`, `keys` and the size limit |
| `ModsUi` | type | What `createModsUi` returns; The `ui` field of `ModsHost` |
| `ModsUiOptions` | type | The `options` argument of `createModsUi` |
| `modsVersionProblem` | function | What a version too old says, or `undefined` when mods load (wording ours, judgment) |
| `ModsWhere` | type | Where the session runs, as far as mods care |
| `ModTheme` | type | The apps connected to the session that draw a backdrop: the Desktop app and the mobile app |
| `ModTier` | type | One of `MOD_TIERS` |
| `ModTimer` | type | What `$.clock.after` and `$.clock.every` give back: `cancel()` stops the timer, also one whose event is still on its way through the chain |
| `ModToolFlow` | type | Host-supplied effects of one tool call, in the ordering of mods/events.md, "When tool.check fires" |
| `ModToolFlowResult` | type | What the host presents to the model; presentation is separate from the tool's raw result |
| `ModTools` | type | The `tools` field of `ModSessionPorts` |
| `ModTurns` | type | The `turns` field of `ModSessionPorts` |
| `ModUses` | type | What a policy mod reads in `e.uses` of `plugin.register`: calls without the `$.` prefix |
| `nameProblem` | function | Why `name` cannot name a `what` (`command`, `tool`...), or `undefined` when it can |
| `NextOutput` | type | What `next(e)` gives back: a promise of the result, or for a streaming event a stream of chunks that ends in it |
| `nextTurnText` | function | The text of the next turn and whether it breaks the prompt cache |
| `NextTurnText` | type | What `nextTurnText` returns |
| `NoticeKind` | type | A key of `STOPPED_NOTICES` |
| `NoticeOutcome` | type | `delivered` reached the conversation at once, `held` waits for the user's next input, `dropped` is gone |
| `NotifyResult` | type | What `$.ui.notify` resolves to |
| `offLine` | function | The line shown when mods in the hooks worker are off for the session |
| `OpenOrigin` | type | Who caused a `$.ui.open`: something the user did (a command, a button), or the mod by itself (a timer, a `turn.start` hook) |
| `OpenRequest` | type | What `$.ui.open` takes |
| `OPTIONAL_PORT_DEFAULTS` | constant | What a missing optional port answers: `$.audio.play` plays nothing and resolves, "having no player" |
| `OrderedMod` | type | The `ordered` field of `ModOrder`; The `candidate` field of `ModPlugin` |
| `orderMods` | function | The mods the policy lets load, with the tier each runs in, in running order |
| `OWN_TIME_CALLS` | constant | The calls whose time is the calling hook's own |
| `paneColumns` | function | The width a pane gets: what `$.ui.open({ columns })` asked, or the width the user set |
| `PaneInfo` | type | A pane a mod opened: what it asked for and whether it appears |
| `PanePlacement` | type | What `vscodePanePlacement` returns |
| `PaneRegistry` | type | What `createPaneRegistry` returns; The `panes` field of `ModsUi` |
| `parseOpen` | function | The request of a `$.ui.open` call, or an error that starts `ui.open:` (the docs quote `ui.open: focus is true or left out` |
| `parsePluginDirs` | function | `CLAUDE_CODE_PLUGIN_DIRS`: "Absolute paths separated by `:`, or `;` on Windows" |
| `PlacedRow` | type | What `PlacedRows.list` returns; What `PlacedRows.rewind` returns |
| `PlacedRows` | type | What `createPlacedRows` returns; The `placed` field of `ModsUi` |
| `Placement` | type | What `$.ui.open` resolves to: `{ isPlaced: true }`, or `{ isPlaced: false, reason }` for a pane that waits |
| `placePane` | function | Whether a pane appears: one opened by something the user did appears at any width |
| `PlaceResult` | type | What `$.ui.place` resolves to: `{ isPlaced: true, requestId }`, or `isPlaced: false` with why |
| `PlainDataLimits` | type | The `limits` argument of `plainDataProblem` |
| `plainDataProblem` | function | The first limit `value` goes past, or `undefined` when it fits |
| `PlainDataProblem` | type | Which limit a value went past, first found |
| `PluginNamespace` | type | `$.plugin`: this plugin's name and directory, which are values, not calls |
| `promptDroppedText` | function | The line the user sees when a `prompt.submit` hook drops their prompt: "they see `Prompt dropped by a hook:` followed by your reason" |
| `PromptMedia` | type | One slice of an image or document of the prompt in flight (`PromptMedia`,:9466): its bytes as base64, at most 4 MiB a call |
| `PromptPainted` | type | What `$.prompt.paint` resolves to (`PromptPainted`,:9786): whether the runs stand, and the box as it is |
| `Props` | type | The props of an element, as plain data and callbacks |
| `propsReachSite` | function | Whether the `props` a hook passes to `next` change what the app draws at `site`: in the panel they do not change the question card, though "draws your elements above it" |
| `QUEUE_DROPS` | constant | What a call that waited in the queue gives when the user stops the turn before it ran |
| `read` | function | The value, or the atom's default while nothing was written; a derived value is computed |
| `readEngineSettings` | function | Claude Code's own read of the session's merged settings |
| `ReadOnlyCall` | type | A tool call as `tool.check` sees it: the tool's name and its arguments |
| `ReadOnlyChecks` | type | What only the host knows: the two checks that decide a call of Bash or of an MCP tool |
| `REDRAW_RATES` | constant | How often a site redraws: 10 a second, or 30 in the terminal for the visible pane, the expanded band and the hint line |
| `RedrawCause` | type | A key of `UNASKED_REDRAW` |
| `RedrawGate` | type | What `createRedrawGate` returns |
| `RedrawRate` | type | A key of `REDRAW_RATES` |
| `redrawsUnasked` | function | Whether a redraw cause redraws without a request |
| `ReentryInfo` | type | An event fired from inside a mods API call made by `plugin` |
| `REFUSAL_REASONS` | constant | Why the session takes no new work from a mod |
| `REGISTER_RULES` | constant | The rule of `plugin.register`: `{ refuse: reason }` with a string reason, or the result of `next(e)` (judgment |
| `RegisteredHook` | type | What a hook registers: the event (or `*` or `classic.*`), an optional matcher, and the hook |
| `RegisteredKind` | type | What the registries hold: what a host lists, and what it is told changed |
| `registeredView` | function | The read surface over `registries` |
| `RegisterTier` | type | The tiers a mod registers in |
| `Registry` | type | What a mod registered, by name |
| `ReloadOutcome` | type | What reloading one mod came to |
| `RENDER_SITE_NAMES` | constant | The sites, in the order of the reference table |
| `RENDER_SITES` | constant | The sites a mod renders at: their props, request and surfaces |
| `renderEvent` | function | The `ui.render` event for one site, or why it is not raised: the site is not drawn in that app, or the request lacks its id or (in the VS Code extension) its viewport |
| `RenderEvent` | type | What a `ui.render` hook receives as `e` |
| `RenderRequest` | type | The `request` argument of `ModsUi.draw`; The `request` argument of `renderEvent` |
| `RenderSite` | type | A key of `RENDER_SITES` |
| `RenderSiteDef` | type | One render site: its props, request and surfaces |
| `REPLAYED_CALLS` | constant | The calls that start work, which a fresh copy must not start twice |
| `ReplayedCall` | type | One of `REPLAYED_CALLS` |
| `replayedLine` | function | The line for people when a call was not made again |
| `ReplayLedger` | type | What `createReplayLedger` returns; The `replay` field of `Deps` |
| `ReplayMode` | type | The first `session.start` of a copy records its calls; the one of a fresh copy replays them |
| `ResendFacts` | type | What Claude reads on the next turn for a prompt section or tool description invalidated by a mod |
| `resizedColumns` | function | Ctrl+X then an arrow key: "Left or Up gives it more room, and Right or Down gives the room back" |
| `ResultOf` | type | What `ModChain.dispatch` returns; What `ModChain.dispatchStream` returns |
| `routeControl` | function | Routes a user's gesture to a control by its key |
| `Routed` | type | The `servers` argument of `languageIdFor`; The `servers` argument of `lspExtensionConflicts` |
| `RouteOptions` | type | The `options` argument of `routeControl` |
| `RunCommandOptions` | type | What `ModsHost.runCommand` takes besides the command: the fire options, and who ran it |
| `RunGate` | type | What the session says about new work: the host tells it what happened to the session's input (`interrupt`, `userInput`, `endInput`), the limits come from the run |
| `RunLimits` | type | `--max-turns` and `--max-budget-usd` of a `claude -p` run, or the Agent SDK's turn and spend limits |
| `runModPromptSubmit` | function | Restore a dropped prompt and its message |
| `runModToolCall` | function | Managed PreToolUse → tool.call → other PreToolUse → tool.check → review/prompt → execution |
| `RunOutput` | type | The module as the host's engine runs it, in the format the host chose; the kit never reads `format`, it hands it to `ModRuntime.load` |
| `runScopedModCall` | function | Admission for a host-backed mods API method |
| `scanHooksModule` | function | The static scan of one file of a hooks module |
| `ScannedCall` | type | One mods API call, `store.get`, and the function of the file it is made in when the hook passed `$` to it |
| `ScannedHook` | type | What a static scan of a hooks module found: the events it hooks, the mods API calls it makes, the environment variables and the `$.state` values it reads and writes |
| `ScanOutput` | type | The module as the scan reads it: ESM, the one format the scan understands |
| `scanSourceOf` | function | The code the scan reads: the `scan` output, else the `run` output when it is an ES module |
| `Scope` | type | The context the calls of one mod run in |
| `ScopeBook` | type | The scopes of the other loaded mods, which a lent method's calls run in the caller's context |
| `selects` | function | Whether `pattern` selects `event`: `*` every event but a telemetry one (`Glob`,:5346), `ns.*` every one under that namespace (`telemetry.*` the telemetry events) |
| `SESSION_END_REASONS` | constant | Why a session ends, tied to the official `ExitReason` union: an SDK update that adds or drops a reason fails the typecheck here |
| `SessionBackdrop` | type | The session's backdrop, as the `Backdrop` render site's props: the fields `$.theme.set` was given and `plugin`, the mod that set it |
| `SessionEndReason` | type | One of `SESSION_END_REASONS`: the `reason` of `session.end` |
| `SessionEntry` | type | One entry of `$.session.messages()` |
| `SessionIdentity` | type | How the session is signed in: `kind` (`claude.ai`, `console`, `api-key`, `none`, a cloud provider's name) and whether the server vouched for the account |
| `SettingsLayer` | type | `{ source, settings }` for one source in use that holds settings |
| `settingsLayersForMods` | function | The layers a `settings.read` hook receives |
| `settleModApi` | function | The mods API a hook on `engine.create` changed |
| `sideloadRefusal` | function | The error startup exits with when managed `disableSideloadFlags` is set and a plugin, agent or MCP server was sideloaded by flag |
| `sizeProblem` | function | Why a tree is "not drawn", or `undefined` |
| `skillPromptEvent` | function | The `skill.prompt` event for a skill |
| `SkillPromptEvent` | type | What `skillPromptEvent` returns |
| `SkillSource` | type | A skill as the host knows it when it expands the skill's text for Claude |
| `SkipKind` | type | Why a hook was skipped, as the line classes it: it threw, it ran over a time limit, or what it returned had the wrong shape |
| `SkippedMod` | type | The `skipped` field of `ModOrder` |
| `SkipTier` | type | The tiers a hook can skip to with `next.to`: every tier but `prepend` |
| `SPACING_STEPS` | constant | What each spacing step is, in terminal cells |
| `spacingCells` | function | The cells a spacing prop of a `Box` takes |
| `SpacingCells` | type | Terminal cells a spacing value is across and down |
| `SpacingStep` | type | A key of `SPACING_STEPS` |
| `SpawnChunk` | type | A piece of what a long-running command wrote |
| `SpecifiedEventName` | type | A key of `EVENT_SPECS` |
| `splitHandlers` | function | The tree as plain data, and the callbacks it held by control key |
| `SplitTree` | type | A drawn tree as plain data, and its controls' callbacks apart, by the key each control is addressed by |
| `StackPhase` | type | Where the engine ran out of stack: following the file's imports, or running the file |
| `STATE_LIBRARY_SOURCE` | constant | The `$.state` helpers as JavaScript text, for a host that bundles a mod's modules for an isolate |
| `StateEntry` | type | What `$.state.get` answers: the value, absent while nothing was written, and its version |
| `StateHost` | type | What the helpers need of `$`: its `state` namespace |
| `StateListener` | type | What a store tells its listeners: the value's plugin and key, and `id` for a family's member |
| `StateRef` | type | A value of `$.state`: `{ plugin, key }`, and `id` for one member of a family (`memberOf`) |
| `StateSource` | type | The `sources` field of `Derived` |
| `StateStore` | type | What `createStateStore` returns; The `state` field of `Deps` |
| `StateValue` | type | What `read` gives for a source: an atom's or a derived value's type; a bare key's is unknown |
| `StateWrite` | type | What `$.state.set` answers: whether it wrote, and the version the value has now |
| `STOPPED_NOTICES` | constant | What happens to a notice for the conversation that comes while the session is stopped |
| `STOPPED_TOAST` | constant | The toast Claude Code shows when the user stopped a turn and a mod then tried to start work on its own and was refused |
| `STREAM_EVENTS` | constant | The mods events that stream |
| `StreamEventName` | type | One of `STREAM_EVENTS` |
| `suggestionRefusedBy` | function | What refuses a `$.prompt.suggest`, such as the VS Code panel |
| `SurfaceModuleSpan` | type | Where a `Client`'s `module` literal sits in the text scanned |
| `SyncEventName` | type | The mods events that run synchronously |
| `TELEMETRY_EVENTS` | constant | The telemetry events |
| `TELEMETRY_FILTER` | constant | The filter of telemetry events sent to the collector |
| `TelemetryMark` | type | One use of a feature, as `$.telemetry.mark` takes it: the feature, how its use went, why, and its properties |
| `TelemetrySink` | type | Where usage records go |
| `TextBlock` | type | A block of `prompt` or `system`; `cache` marks a cache breakpoint after it |
| `textStyle` | function | How an app draws a `Text`'s weight and typography |
| `TextStyle` | type | What `textStyle` returns |
| `TIERS` | constant | The chain's five tiers, outermost first |
| `TimerEventName` | type | The calls that return a timer and not a promise |
| `ToastBoard` | type | What `createToastBoard` returns; The `toasts` field of `ModsUi` |
| `ToolCallEnd` | type | How a tool call ended, for the text Claude reads when a hook withholds its result |
| `ToolCheckContext` | type | The `context` argument of `mergeToolCheck` |
| `ToolCheckMode` | type | How the host states the mode's part of the merge |
| `ToolDecision` | type | What `tool.check` decides: `allow`, `ask` or `deny`, with an optional reason |
| `ToolDef` | type | A tool a mod registered with `$.tool.register`; `fullName` is what Claude sees |
| `toolReadOnlyReport` | function | `true` when the tool reports `call` as read-only, otherwise `undefined`: the field is absent, not `false` |
| `TraceEntry` | type | One settled run of a link beneath a hook, as `next.trace` lists it |
| `TraceOutcome` | type | What the chain decided for one link, as `next.trace` names it: `returned` its result stood; `passed` it returned what its last `next()` resolved to |
| `TreeChild` | type | The `children` field of `ElementNode` |
| `treeProblem` | function | Why `tree` is not a valid drawing of `site` for `surface`, or `undefined` |
| `UI_SURFACES` | constant | What the mods reference says about the interface, as data: the render sites with the fields of `e.props`, what `e.requestId` is and the apps that raise them |
| `uiApi` | function | `$.ui` for one mod: every call an event through the chain and then the interface port |
| `UiParts` | type | What `$.ui` reaches: the interface a host draws, and what the kit keeps for it |
| `uiRules` | function | The rules of the interface events: a `ui.render` hook returns an element tree or the result of `next(e)` |
| `UiSurface` | type | One of `UI_SURFACES` |
| `unansweredCommandReply` | function | The reply when a command a mod registered reaches the end of the `command.run` chain with no answer |
| `unloadedLine` | function | The line shown when a mod was unloaded for crashing the hooks worker |
| `unsentReason` | constant | The reason of a `$.session.send` that was not delivered while the session refuses new work: to a subagent that finished, and to a teammate of an agent team |
| `update` | function | Writes `change` of the current value and answers the new one; a shaped atom stores `{ shape, value }` |
| `ValidateInput` | type | `claude plugin validate <directory>` for a mod |
| `validateMod` | function | Validates a mod: its manifest and module |
| `ValidateReport` | type | The `--json` object |
| `versionAtLeast` | function | Whether `version` is `minimum` or later; a text that is no version is never at least anything |
| `Viewport` | type | `e.viewport`: `columns`, `rows` and `isFullscreen` |
| `VSCODE_IGNORED` | constant | The props the VS Code extension ignores: it draws the element as if they were left out |
| `VSCODE_LABELS` | constant | What the panel frames: "From the token-chart plugin" for a drawing, "Edited by the token-chart plugin" for a rewrite |
| `vscodePanePlacement` | function | `e.props.placement` and `e.viewport.isFullscreen` of a pane for a panel `widthPx` wide |
| `watchesPluginDirs` | function | Whether a session reloads `--plugin-dir` mods when a file changes |
| `whereModsRun` | function | What `where` says about hooks and drawing; `reachesCloud` is whether the plugin reaches a cloud session |
| `WhereModsRun` | type | What `whereModsRun` returns |
| `Wildcard` | type | One of `WILDCARDS` |
| `WILDCARDS` | constant | The wildcards `on` takes in place of an event name |
| `withDefaultPorts` | function | `given` with each optional port it left out filled from `OPTIONAL_PORT_DEFAULTS` |
| `withheldResultText` | function | The text the model sees for a tool result a mod withheld |
| `WORKER_STOP_LIMIT` | constant | "The worker stopped three times and Claude Code couldn't trace the stops to one mod" |
| `WorkerCrash` | type | A stop of the hooks worker, as the host's runtime saw it |
| `WorkerHealth` | type | What `createWorkerHealth` returns |
| `WrittenModGate` | type | The three ways the page lists a session where it cannot load |
| `writtenModRefusal` | function | Why a mod Claude wrote cannot load in this session, or `undefined` when it can once it is approved |
| `WrittenModRefusal` | type | What `writtenModRefusal` returns |
| `WrittenModSession` | type | The `session` argument of `writtenModRefusal` |
