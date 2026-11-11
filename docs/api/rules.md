# `@rsaryev/llx-plugin/rules`

Permission rules and modes: parsing, matching and the decision on a tool call.

One row per export; `scripts/check-docs.ts` (DOC3) keeps this table equal to the entry's exports.

| Name | Kind | What it is |
| --- | --- | --- |
| `AgentResponse` | type | The `response` field of `AgentResponseParse` |
| `AgentResponseParse` | type | What `parseAgentResponse` returns |
| `AgentTextBlock` | type | A final text block of the subagent, or the note that stands in for a `SubagentHandback` report |
| `AgentUsage` | type | The four keys the table names |
| `AnsweredQuestions` | type | What `answerQuestions` returns |
| `answerQuestions` | function | Answers a call programmatically: "echo back the original `questions` array and add an `answers` object mapping each question's text to the chosen answer" |
| `applyEdit` | function | The Edit tool's replacement: exact string replacement, no regex and no fuzzy matching |
| `ApprovalLifetime` | type | How long an approval lasts |
| `approvalMemory` | function | What choosing "Yes, and don't ask again" does for a tool; `undefined` for a tool the table does not list |
| `ApprovalMemory` | type | The `memory` field of `SavedApproval`; What `approvalMemory` returns |
| `ApprovalOptions` | type | What a session can change about "Yes, and don't ask again" |
| `AskedQuestions` | type | What `answerQuestions` needs of an AskUserQuestion input, taken from the SDK's `AskUserQuestionInput` |
| `availableTools` | function | The tools Claude sees, from the candidates the host can provide (order kept) |
| `backgroundCwdNote` | function | The note of a moved command that changes directory |
| `BackgroundRequest` | type | The `request` argument of `backgroundTimeLimit` |
| `BackgroundSession` | type | What the session is, as far as the background time limit goes |
| `backgroundStopNotice` | function | "`Background command "<description>" was stopped after reaching its background time limit`" |
| `backgroundTimeLimit` | function | How long a background command may run, or `undefined` for none |
| `BashEditDiff` | type | `tool_response.bashEditDiff`: "best effort and in public beta", read field by field |
| `BashEditDiffParse` | type | What `parseBashEditDiff` returns |
| `bashEditDiffTrust` | function | The two flags that say a list is incomplete and the one that says it may hold another command's changes |
| `BashEditDiffTrust` | type | How far a list can be relied on: "how complete and how reliable that list is" |
| `BashEditFile` | type | One entry of `bashEditDiff.files`: the diff of a changed file "for display" |
| `bashFileTargets` | function | The files a Bash command reads and writes |
| `BashFileTargets` | type | The files a Bash command names, as the `Read` and `Edit` rules see them |
| `bashOutputLimits` | function | The windows of a command's output |
| `BashOutputLimits` | type | What `bashOutputLimits` returns; The `limits` field of `BashOutputRequest` |
| `BashOutputRequest` | type | The `request` argument of `windowBashOutput` |
| `BashOutputWindow` | type | What `windowBashOutput` returns |
| `capGlobMatches` | function | A Glob result as Claude receives it: sorted by modification time and capped at 100 files, with a truncation flag when files were left out |
| `CappedGlob` | type | What `capGlobMatches` returns |
| `catalogEntry` | function | The entry of a documented tool, or `undefined` for any other name (an MCP tool, a typo) |
| `CatalogToolEntry` | type | What tools-reference.md says about a tool in rules |
| `CdTarget` | type | A directory a `/cd` moves to: where it resolves, and every spelling it was reached by |
| `CheckedUrl` | type | What `checkWebFetchUrl` returns |
| `checkWebFetchUrl` | function | What WebFetch does with a URL before it makes a request |
| `ClassificationRequest` | type | What a host hands `settleClassification`: the call, the mode, its reviewer and an abort signal |
| `classifyBashExit` | function | Whether Claude Code counts the finished command as a valid result rather than a failure: exit 0 always, exit 1 only for the commands above, anything else never |
| `classifyPowerShellExit` | function | The same for the PowerShell tool, whose benign list is its own (`findstr` in, `find`, `diff`, `test` and `[` out) |
| `classifyReadSize` | function | What a text read returns |
| `classifyReadTarget` | function | Whether Read refuses a file before it reads a byte: an extension it treats as binary, an image over 128 MB, a notebook over 100 MB |
| `CompletedAgentResponse` | type | `status: "completed"`: a foreground subagent, with its run telemetry |
| `createRefusalStreak` | function | The count of one turn "in auto mode with the setting on": 20 refusals in a row, with "no work went ahead in between", end it |
| `decide` | function | Whether a call may run, asks the user, is denied or goes to the host's classifier |
| `DecideContext` | type | The session facts decided outside `decide`, and the rules in force |
| `Decision` | type | The outcome of a permission check |
| `DecisionReason` | type | Why `decide` answered as it did |
| `editEncodingIssue` | function | The refusal of an Edit or NotebookEdit on a file whose bytes do not decode as UTF-8, or `undefined` when the tool may edit it |
| `EditRequest` | type | The `old_string`, `new_string` and `replace_all` of an Edit call |
| `EditResult` | type | What `applyEdit` returns |
| `effectiveBashTimeout` | function | How long a foreground Bash or PowerShell command runs |
| `effectiveExitPlanModeInput` | function | What ExitPlanMode runs with: `allowedPrompts` is |
| `effectiveGrepMultiline` | function | "By default, patterns match within a single line |
| `effectiveGrepOutputMode` | function | The output mode a Grep call runs in |
| `effectiveSearchMode` | function | The search a call runs |
| `evaluateIf` | function | Whether a hook handler with this `if` runs for this tool call |
| `evaluateRules` | function | What the rules alone say about a call: the first deny rule that matches, else the first ask rule, else the first allow rule, else nothing |
| `expandToolInputPath` | function | A copy of a tool call's input as a hook receives it: the `file_path` of `Write`, `Edit` and `Read` expanded (`expandToolPath`), every other field and tool untouched |
| `expandToolPath` | function | The absolute path Claude Code hands a hook for a file tool |
| `FetchedPart` | type | What `sliceFetched` returns |
| `FetchTimings` | type | What `webFetchTimings` returns |
| `FieldRole` | type | What a rule can do with a field: - `primary`: the content field of the tool |
| `FieldSource` | type | Where a field is documented: the SDK's input type, or only the docs (which the compiler cannot tie to the SDK) |
| `FieldSpec` | type | One field of a tool input: its type, role, source and schema |
| `FieldType` | type | The JSON types of the tables of hooks.md ("PreToolUse input") |
| `formatRule` | function | A rule's text, as `parseRule` reads it back to the same value |
| `GlobMatch` | type | The `matches` argument of `capGlobMatches` |
| `globRespectsIgnore` | function | Whether Glob respects `.gitignore`: off unless the setting turns it on |
| `GREP_OUTPUT_MODES` | constant | "`content`, `files_with_matches`, or `count`" |
| `GrepCount` | type | The `counts` argument of `totalGrepCount`; The `counts` argument of `windowGrepCounts` |
| `GrepOutputMode` | type | One of `GREP_OUTPUT_MODES` |
| `GrepWindow` | type | What `windowGrepContent` returns |
| `GrepWindowRequest` | type | The `request` argument of `windowGrepContent`; The `request` argument of `windowGrepCounts` |
| `HookRewriteCall` | type | The `call` argument of `reviewHookRewrite` |
| `HookRewriteSession` | type | The `session` argument of `reviewHookRewrite` |
| `HookRewriteVerdict` | type | What happens to a hook's rewrite of a tool input: applied, dropped or denied |
| `HostToolNames` | type | How a host's tool names correspond to Claude Code's, stated once by the host |
| `IfResult` | type | Whether a hook's `if` lets its handler run, with what the kit found wrong in the rule |
| `InPlaceEditTool` | type | A key of `ACCEPTS_UTF16LE` |
| `InputParse` | type | What `parseToolInput` returns |
| `interactiveShell` | function | The shell an interactive `!` command runs in |
| `InteractiveShell` | type | `"defaultShell": "powershell"` |
| `isKnownTool` | function | Whether `toolName` is a built-in tool Claude Code has (the removed `TaskOutput` is not) |
| `isNetworkPath` | function | Whether a path is a network path on a platform |
| `KNOWN_TOOLS` | constant | The tool names a rule can name without a typo warning: the documented tools Claude Code still has and the SDK's own tools the docs leave undescribed |
| `LaunchedAgentResponse` | type | `status: "async_launched"`: a background subagent |
| `matchBashPattern` | function | Whether a command matches a Bash rule pattern: - a `*` stands for any text, spaces included, and everything else is literal |
| `matchCdRule` | function | Whether a `Cd(<pattern>)` rule covers the target: "Deny rules check every spelling of the target, including each symlink hop it resolves through" |
| `MatchContext` | type | Everything a rule needs beside the call itself |
| `matchDomainPattern` | function | Whether the `domain:` pattern of a WebFetch rule covers the host of `url` |
| `matchesMatcher` | function | Whether `matcher` selects `value` |
| `matchRule` | function | Whether one rule covers one call |
| `mcpToolName` | function | The callable name of a tool of `server`: `mcp__<server>__<tool>` |
| `mcpToolRuleMatches` | function | Whether a rule's tool name, written without a `*`, covers the call of `toolName` |
| `ModOutcome` | type | What a mod that handles `tool.check` answered |
| `movedByTimeoutNotice` | function | "`Command did not complete within its 120s timeout and was moved to the background`", seconds of the timeout |
| `MoveSession` | type | What the session is, as far as moving a timed-out command goes |
| `NO_APPROVAL_SURFACE_DECISION_REASON` | constant | The `decision_reason` of a `permission_denied` message in `stream-json` output |
| `NO_APPROVAL_SURFACE_DENIAL` | constant | "The denial Claude reads can open with this text." |
| `normalizeMcpServerName` | function | `my.server` is `my_server`: the characters outside `A-Za-z0-9_-` become `_` |
| `normalizePermissionMode` | function | A mode name as Claude Code accepts it: a mode itself or one of its aliases; else `undefined` |
| `NOT_UTF8_MESSAGE` | constant | The message the tool result carries, verbatim |
| `NumberedLine` | type | The `lines` field of `ReadSlice` |
| `parseAgentResponse` | function | Reads the `tool_response` a PostToolUse hook receives for an Agent call |
| `parseBashEditDiff` | function | Reads `tool_response.bashEditDiff` of a Bash PostToolUse call: "the changed files" |
| `parseRule` | function | Reads one permission rule |
| `parseToolInput` | function | Reads a hook's `tool_input` against the table of its tool: a wrong type or a missing required field is an issue and nothing throws |
| `partialViewNotice` | function | The notice of a partial view: "how much of the file it received and how to read more with `offset` and `limit`" |
| `PatchHunk` | type | One hunk of an `Edit` or `Write` result's `structuredPatch` (the SDK's `FileEditOutput`) |
| `PathContext` | type | The folders and platform path rules are read against |
| `PathResolver` | type | Where a path really points, once every symlink on the way is followed |
| `PERMISSION_BEHAVIORS` | constant | The three rule behaviours of permissions.md ("Manage permissions"): allow, ask and deny |
| `PERMISSION_MODES` | constant | The permission modes of permissions.md ("Permission modes"), tied to the official `PermissionMode` union |
| `PermissionClassifier` | type | The host's reviewer for auto mode: "a second model, the classifier, reviews actions instead of you" |
| `PermissionRule` | type | One permission rule, parsed |
| `pluginMcpServerName` | function | The server name of a plugin's MCP server: the plugin name and the server key under one prefix, normalised as a whole |
| `prepareCall` | function | A call with the real location of its path, ready for the path rules |
| `PreparedCall` | type | A call after the host's own preparation: the real paths a symlink in the call resolves to, which the path rules need, and the names of a called skill |
| `PreToolUseHookOutcome` | type | What a PreToolUse hook answered: its `permissionDecision`, whether the hook exited with code 2 (a block), and whether it returned `updatedInput` beside an allow |
| `ProtectedPathOptions` | type | What the session adds to the protected paths and their exceptions |
| `READ_TOO_LARGE_MESSAGE` | constant | The error of a read that is too large: a portion with `offset` and `limit`, or Grep (wording is a judgment) |
| `ReadOutcome` | type | How much of a file Read returns: all, the first page with a notice, or an error |
| `ReadRefusal` | type | What `classifyReadTarget` returns |
| `ReadRequest` | type | The `request` argument of `readWindow` |
| `ReadSizing` | type | The `sizing` argument of `classifyReadSize` |
| `ReadSlice` | type | What `readWindow` returns |
| `readsNetworkPath` | function | Whether `call` is a read (Read, Grep, Glob) of a network path, by the path it names or any path it resolves to |
| `ReadTarget` | type | The `target` argument of `classifyReadTarget` |
| `readTokenLimit` | function | What one Read call returns at most, in tokens: 25,000, or `CLAUDE_CODE_FILE_READ_MAX_OUTPUT_TOKENS` |
| `readWindow` | function | The window of a file the Read tool returns: the contents "with line numbers", from the line `offset` for `limit` lines |
| `redirectNotice` | function | "When a URL redirects to a different host, WebFetch returns a text result that names the original URL and the redirect target instead of following it" |
| `REFUSAL_STOP_LIMIT` | constant | "The turn ends after 20 calls in a row that the classifier blocked or a safety check refused" |
| `REFUSAL_STOP_MESSAGE` | constant | What the person sees when those refusals end the turn |
| `REFUSAL_STOP_RESULT` | constant | "A `-p` run reports that turn as `error_during_execution`." |
| `RefusalEvent` | type | One call of an auto mode turn: refused by the classifier or a safety check, or work that went ahead |
| `RefusalStreak` | type | What `createRefusalStreak` returns |
| `RefusalVerdict` | type | Where the turn stands after a call: it goes on, or it ends with the message |
| `requiresPromptDespitePrefixRule` | function | `promptsDespitePrefixRule` for a subcommand's text |
| `resolveRuleDirectories` | function | The real location of every directory a `//`, `~/`, `/` or `./` deny or ask rule is written through, and of every working directory |
| `reviewHookRewrite` | function | What auto mode does with a hook's `updatedInput` |
| `RULE_FORMATS` | constant | How a tool reads what follows its name inside the parentheses of a rule |
| `RuleFormatId` | type | One of `RULE_FORMATS` |
| `ruleIssues` | function | The startup warnings of a rule list |
| `RuleOrigin` | type | Where a rule was written and what it does: the two things the text cannot say |
| `RuleParse` | type | What `parseRule` returns |
| `RuleSource` | type | Where a rule was written |
| `RuleVerdict` | type | What the rules alone say about a call: the first behaviour that matched, with the rule |
| `sandboxDomainEntry` | function | What a rule changes about the hosts sandboxed commands reach |
| `SandboxDomainEntry` | type | The host a `WebFetch(domain:...)` rule adds to a sandbox list |
| `sandboxDomainLists` | function | The two sandbox lists the `WebFetch(domain:...)` rules in `rules` contribute to |
| `SandboxList` | type | The sandbox's domain lists |
| `settleClassification` | function | The decision once the host's reviewer has answered a `classify` |
| `shouldMoveToBackground` | function | Whether a foreground command that reaches its timeout moves to the background instead of stopping |
| `sliceFetched` | function | The part of a page WebFetch reads: up to 100,000 characters from `offset`, and how much went unread |
| `Specifier` | type | What follows the tool name inside the parentheses, once read |
| `SpecifierMatcher` | type | Matches the text or domain specifier of one rule against one call |
| `SpecifierMatchers` | type | The `matchers` argument of `evaluateRules`; The `matchers` argument of `matchRule` |
| `splitCommand` | function | Splits a command line into the commands it runs |
| `SplitCommand` | type | The subcommands a command line runs, and whether the kit could read it all |
| `stripWrappers` | function | The command a subcommand runs once every leading wrapper and assignment is removed, as written |
| `structuredPatchOf` | function | The hunks of a unified diff as the `structuredPatch` of an `Edit` or `Write` result |
| `TOOL_CATALOG` | constant | One entry per documented tool: a tool the table adds fails the typecheck until it is described here |
| `TOOL_INPUT_FIELDS` | constant | One table per tool of hooks.md ("PreToolUse input") |
| `ToolCall` | type | A tool call as a rule sees it: the canonical tool name and the input Claude sent |
| `ToolNames` | type | A `HostToolNames` read both ways |
| `toolNamesOf` | function | The mapping both ways; `undefined` is the host whose tools are Claude Code's |
| `toolRequiresPermission` | function | `DecideContext.requiresPermission` for the kit's catalog: the "Permission required" column for a documented tool, and `true` for any other name |
| `ToolSession` | type | The facts of a session that decide which of the tools the host can provide Claude actually sees |
| `totalGrepCount` | function | That "covers every match" however the listing is cut |
| `validateGlobInput` | function | One issue at `tool_input.<field>` per field that holds one |
| `validateWebSearchDomains` | function | Checks WebSearch's `allowed_domains` and `blocked_domains` |
| `webFetchTimings` | function | The cache time and the download deadline of WebFetch |
| `webSearchAllowance` | function | How many more WebSearch calls are allowed |
| `webSearchLimits` | function | The limits of WebSearch |
| `WebSearchLimits` | type | The `limits` argument of `webSearchAllowance`; What `webSearchLimits` returns |
| `WebSearchMode` | type | One of `WEB_SEARCH_MODES` |
| `WebSearchSession` | type | The `session` argument of `webSearchLimits` |
| `WebSearchUsage` | type | The `usage` argument of `webSearchAllowance` |
| `wildcardBannerRow` | function | The row shown below the startup banner in an interactive session: `⚠ Allow rule Bash(git -C * status *) allows any option at its * · use an exact value` |
| `windowBashOutput` | function | What Claude receives of a command's output |
| `windowGrepContent` | function | The lines Grep returns in `content` mode, within its `offset` and `head_limit` window |
| `windowGrepCounts` | function | The per-file entries of `count` mode after `offset` and `head_limit`, with the whole total |
| `writeEncodingIssue` | function | The refusal of a Write that would replace such a file with text holding `U+FFFD` (tools-reference.md, "Non-UTF-8 files" |
