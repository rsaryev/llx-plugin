# API

The public API of `@rsaryev/claude-plugin-kit`: what a host (an agent, an IDE, a cloud service)
calls to support Claude Code plugins. Each part says whether it is **done** (exported and tested)
or **planned** (designed here, not built yet). A planned part changes only through this doc.

## Principles

1. **Claude Code's shapes are Claude Code's.** Hook inputs and outputs, tool inputs, agent
   definitions, MCP configs, permission modes and settings are the official types of
   `@anthropic-ai/claude-agent-sdk`, re-exported (docs/SPEC.md, "Official types"). The kit never
   declares a copy, so an SDK update that changes one breaks the build where it matters.
2. **The kit knows no machine.** It never touches a disk, a process, the network or a clock. A
   host passes **ports** (below) and decides where each effect runs: a local shell, a cloud
   sandbox, a container. The same plugin behaves the same through any of them.
3. **Read once, run many.** Loading turns a folder into a typed, validated `Plugin`; a host keeps
   it (in memory, in a database) and opens sessions over it without reading files again.
4. **Problems are values.** Every reader returns its result with `PluginIssue[]` in the shape
   `claude plugin validate` reports; nothing throws for a bad plugin.
5. **One closed set, one registry.** Events, handler types, component kinds are `as const` lists
   tied to the official unions; what differs per member is a strategy in a registry typed over the
   union, so a member Anthropic adds fails the typecheck until it is handled.

## Format (done: the manifest)

Pure functions over parsed JSON and file text. No ports.

```ts
import { readManifest, validateManifest } from '@rsaryev/claude-plugin-kit';

const { manifest, issues } = readManifest(JSON.parse(text)); // as Claude Code loads it
const report = validateManifest(JSON.parse(text)); // as `claude plugin validate` reports
```

| Function                            | Status  | Does                                                                  |
| ----------------------------------- | ------- | --------------------------------------------------------------------- |
| `readManifest(raw)`                 | done    | `plugin.json` as loaded: unknown keys stripped, any error blocks load |
| `validateManifest(raw)`             | done    | plus the validator: reserved names, kebab-case, missing metadata      |
| `readMarketplace(raw)`              | planned | `marketplace.json`: entries, sources, strict mode                     |
| `readSkill(path, text)`             | planned | `SKILL.md` frontmatter and body                                       |
| `readCommand(path, text)`           | planned | a command file (the older skill format)                               |
| `readAgent(path, text)`             | planned | an agent file → official `AgentDefinition`                            |
| `readHooksFile(raw)`                | done    | `hooks/hooks.json` → official `HooksSettings`: events, matcher groups, every handler field; an error leaves no hooks, as Claude Code does |
| `readHooksSettings(raw)`            | done    | the bare event map (inline `hooks`, skill frontmatter, `settings.json`) |
| `matchesMatcher(matcher, value, mode?)` | done | a hook `matcher` against the field its event filters on: match-all, exact list, unanchored regex; `'narrow'` for FileChanged and StopFailure |
| `readMcpConfig(raw)`                | planned | `.mcp.json` → official `McpServerConfig` map                          |
| `readLspConfig(raw)`, `readMonitors(raw)`, `readOutputStyle(...)` | planned | the remaining component files |

## Loading (planned)

```ts
import { loadPlugin } from '@rsaryev/claude-plugin-kit';

const { plugin, issues } = await loadPlugin({ files, fallbackName: 'formatter' });
```

`files` is the `PluginFiles` port: read access to one plugin folder, wherever it is (a disk, an
object store, a sandbox, an archive in memory). `loadPlugin` finds every component in the
standard layout and the manifest's paths (plugins/manifest-reference.md, "Standard layout", "How
each key combines with its default location") and returns a `Plugin`:

```ts
interface Plugin {
  readonly name: string;
  readonly manifest: PluginManifest | undefined;
  readonly skills: readonly Skill[]; // namespaced `<plugin>:<skill>`
  readonly commands: readonly Command[];
  readonly agents: readonly PluginAgent[]; // official AgentDefinition + name and source
  readonly hooks: HooksSettings; // official
  readonly mcpServers: Readonly<Record<string, McpServerConfig>>; // official
  readonly lspServers: Readonly<Record<string, LspServer>>;
  readonly monitors: readonly Monitor[];
  readonly outputStyles: readonly OutputStyle[];
  readonly settings: Pick<Settings, 'agent' | 'subagentStatusLine'>; // official
  readonly userConfig: Readonly<Record<string, UserConfigOption>>;
  readonly hasBin: boolean;
}
```

### Variable substitution (done: `loading/resolve`)

What a plugin's `${...}` references become, shared by hooks, skills, MCP, LSP and monitors so none
writes placeholder code of its own (plugins/manifest-reference.md, "Environment variables"):

```ts
import { substituteSurface, exportedEnvironment } from '@rsaryev/claude-plugin-kit';

const scope = { pluginId: 'fmt@acme', locations, environment, userConfig, windows: false };
const { text, issues, referenced } = await substituteSurface('hook-exec', '${CLAUDE_PLUGIN_ROOT}/run', scope);
const env = await exportedEnvironment('hook-command', scope); // what the process receives
```

| Name                                            | Does                                                                                   |
| ----------------------------------------------- | -------------------------------------------------------------------------------------- |
| `substituteTemplate(text, scope, policy, path)` | `${CLAUDE_PLUGIN_ROOT}`, `${CLAUDE_PLUGIN_DATA}`, `${CLAUDE_PROJECT_DIR}`, `${user_config.KEY}`, `${VAR}`, `${VAR:-default}` in one pass; unresolved references stay as written with a warning |
| `substituteDeep(value, scope, policyFor, base)` | the same over every string of a JSON value, one policy per path, the host asked once per variable |
| `substituteSurface(surface, text, scope)`       | `substituteTemplate` with the policy of a `Surface` (`SURFACE_POLICY`)                 |
| `SURFACE_POLICY`, `SURFACE_COMPONENT`           | per surface (exec/shell/PowerShell hook, monitor, MCP stdio/remote/`headersHelper`, LSP, Markdown content): which `${user_config.*}` values, whether `${VAR}` expands, how paths are written |
| `VARIABLE_FIELDS`                               | the table "Where each variable resolves": fields per component, and what it exports   |
| `exportedEnvironment(component, scope)`         | the path variables and `CLAUDE_PLUGIN_OPTION_<KEY>` a process receives                |
| `pluginDataId(id)`                              | the `<id>` of the data folder: other characters than letters, digits, `_`, `-` become `-` |
| `referencesUserConfig(text)`, `optionEnvName`   | the shell-field check runs on the template; `api_token` is `CLAUDE_PLUGIN_OPTION_API_TOKEN` |

A field that refuses `${user_config.*}` (shell-form hook, monitor, `headersHelper`) never gets the
value: the reference stays as written, and the resolver reports the documented error. The data
folder is asked of `Locations.pluginData` (with the sanitized id) only when a text references it.
Skills pass their own variables as `scope.extra` (`CLAUDE_SKILL_DIR`, `CLAUDE_SESSION_ID`); they
are substituted on every surface and win over `${VAR}`, so pass only what the surface should see.

A remote MCP server (`mcp-remote`) reads the credential variables mcp.md names as empty in `url`
and `headers`, even when unset and with a `:-default`. `substituteDeep` returns `value: unknown`;
the caller narrows it (a schema parse). `exportedEnvironment` asks the host for the data folder of
every hook, stdio and LSP process, referenced or not.

Choosing the hook surface is the caller's: a command hook with `args` is `hook-exec`; shell form is
`hook-shell` (bash) or `hook-powershell`. A hook with no `shell` field runs in PowerShell on Windows
without Git Bash (hooks.md, "Exec form and shell form"), and the kit cannot tell the host's shell, so
the caller passes `hook-powershell` there.

## Ports (done)

Interfaces the host implements, in `src/ports/` (type-only, one file per port, all exported from the
package). Each is small, takes an `AbortSignal` where it does I/O, and is optional when the host
supports no plugin that needs it (a missing port is reported per component, never a crash). An
absent file is `undefined`; an effect that did not happen is a `PortFailure` value, never a throw.

| Port             | Used for                                                          | A local host            | A cloud host                    |
| ---------------- | ----------------------------------------------------------------- | ----------------------- | ------------------------------- |
| `PluginFiles`    | reading a plugin's files (`TextFileReader` is its `readText`)     | the disk                | object storage                  |
| `CommandRunner`  | `command` hooks, `` !`cmd` `` in skills, status lines             | `spawn`                 | exec in the sandbox             |
| `HttpClient`     | `http` hooks, archive and marketplace downloads (text or `bytes`) | `fetch`                 | `fetch` behind an egress policy |
| `ModelRunner`    | `prompt` and `agent` hooks, a mod's `$.model`                     | the host's model        | the host's model                |
| `McpCaller`      | `mcp_tool` hooks                                                  | the host's MCP client   | the host's MCP client           |
| `Locations`      | `CLAUDE_PLUGIN_ROOT`, `CLAUDE_PLUGIN_DATA`, `CLAUDE_PROJECT_DIR`  | paths on the disk       | paths inside the sandbox        |
| `Environment`    | `${VAR}` in configs, `allowedEnvVars`, the inherited environment  | the process environment | the sandbox's environment       |
| `Clock`          | timeouts and timers (no `Date`, no `setTimeout` in `src/`)        | the system clock        | the system clock                |
| `ScratchFiles`   | spilling text over the hook output cap                            | the session directory   | object storage                  |

```ts
interface PluginFiles extends TextFileReader {
  readBytes(path: string, signal?: AbortSignal): Promise<Uint8Array | undefined>;
  list(path: string, signal?: AbortSignal): Promise<readonly DirectoryEntry[] | undefined>;
  stat(path: string, signal?: AbortSignal): Promise<FileStat | undefined>;
  exists(path: string, signal?: AbortSignal): Promise<boolean>;
}
interface CommandRunner {
  run(run: CommandRun): Promise<CommandResult>;
}
interface HttpClient {
  request(request: HttpRequest): Promise<HttpResponse | HttpFailure>;
}
interface ModelRunner {
  evaluate(request: ModelRequest): Promise<ModelAnswer | PortFailure>; // one turn, no tools
  runAgent(request: AgentRequest): Promise<ModelAnswer | PortFailure>; // a tool-using run
}
interface McpCaller {
  ensureConnected(server: string, waitMs: number, signal: AbortSignal): Promise<McpAvailability>;
  callTool(call: McpToolCall): Promise<McpToolResult | PortFailure>;
}
```

`CommandRunner` is the shape of one run: `{ spec, cwd, env, stdin?, timeoutMs?, mergeStderr?,
signal }` → `{ exitCode, stdout, stderr, timedOut, startError? }`, where `spec` is either
`{ form: 'exec', command, args }` or `{ form: 'shell', command, shell: 'bash' | 'powershell' }`, so
the kit never builds a process line. Long-running processes (stdio MCP servers, LSP servers,
monitors) stay the host's: the kit resolves their configs (variables substituted, user config
applied) and the host starts them. Tests use the fakes in `tests/support/ports.ts` (`memoryFiles`,
`scriptedRunner`, `recordingHttp`, `fakeModel`, `fakeMcp`, `fixedClock`, `locations`,
`fakeEnvironment`, `memoryScratch`).

## Hooks (select, input, handlers, verdict, engine and output done)

The hook engine picks the handlers an event runs, runs them through ports, and merges what they
return. The first stage, selection, is pure over data: no port, no I/O.

```ts
import { createHookRegistry, ifEvaluatorFor, selectHandlers } from '@rsaryev/claude-plugin-kit';

const registry = createHookRegistry(entries); // RegisteredHandler[]: event, matcher, official handler, source
const { selected, issues, monitor } = selectHandlers(registry, {
  event: 'PreToolUse',
  facts: { tool_name: 'Bash', tool_input: { command: 'rm -rf /tmp/build' }, tool_use_id: 't1' },
  session, // trusted, disableAllHooks, enabledPlugins...
  ifEvaluator: ifEvaluatorFor(matchContext), // reads each handler's `if`
  modelCatalog, // names the canonical model of a model switch
});
```

| Function                                   | Status  | Does                                                                         |
| ------------------------------------------ | ------- | ---------------------------------------------------------------------------- |
| `createHookRegistry(entries)`              | done    | an immutable registry: `entries`, `with`, `without`                          |
| `selectHandlers(registry, request)`        | done    | the handlers an event runs, in registry order: event, gates (`disableAllHooks`, trust, plugin enablement, `allowManagedHooksOnly`, the plugin-only lock), settings dedupe, handler type, matcher, MCP client for `mcp_tool` (none on `Setup` or `SessionStart` at launch), `if`; `{ selected, issues, monitor }` |
| `EVENT_CATALOG`, `supportsHandlerType`, `eventsSupporting`, `firesForTool` | done | per event: cadence, the handler types it supports, the tools whose calls never fire it (`EndConversation` on `PreToolUse` and `PostToolUse`) |
| `MATCHER_TARGETS`, `MATCHER_VALUES`        | done    | per event, the input field its matcher filters on (or none: the matcher is ignored, `FileChanged` and `StopFailure` read in the narrow grammar), and the documented values, tied to the SDK unions |
| `canonicalMatcherModel(toModel, catalog)`  | done    | the canonical name a model-switch matcher is tested against, `[1m]` stripped; none means every hook runs |
| `ifEvaluatorFor(context)`                  | done    | an `if` reader over `evaluateIf`; a handler with `if` never runs on a non-tool event |
| `fileChangedWatchList(entries, session)`   | done    | the literal file names the `FileChanged` matchers of handlers that can run register to watch |
| `consumedByRun(entry, succeeded)`          | done    | whether `once: true` removes the handler: skill frontmatter and a successful run only |
| `buildHookInput(event, facts, session)`    | done    | the input of an event as `{ input, issues }`: the common fields from the session, then the event's facts checked against the official input type; `input` is `undefined` when a fact has the wrong type or value |
| `serializeHookInput(input)`                | done    | the one JSON text a command hook reads on stdin and an HTTP hook receives as its body |
| `hookPermissionMode(mode)`                 | done    | the `permission_mode` a hook sees: the mode labeled Manual is `default` |
| `runHandler(entry, context)`               | done    | runs one handler and returns `{ run, issues }`: a `command` hook in exec form or shell form, in the foreground or the background; an `http`, `mcp_tool`, `prompt` or `agent` hook through its port (`http`, `mcp`, `models` of the run ports) |
| `planTimeouts(event, selected, environment)`, `handlerTimeoutMs(entry, plan)` | done | the limit in milliseconds the port enforces: defaults 600/600/600/30/60, lowered per event, none for `async`, the shared `SessionEnd` budget |
| `okFalseEffect(event, run, options)`, `isPromptEvent(event)` | done | what `ok: false` of a prompt or agent hook does on each of the 13 events that run them: `none`, `allow-stop` (`impossible` on `Stop` and `SubagentStop`), or `block` with `endsTurn`, `delivery` and `deniesTool`; `continueOnBlock`, agent hooks and the two causes of `TaskCompleted` |
| `runLimited(entries, run, limit?)`, `composePrompt(prompt, inputJson)` | done | at most 12 prompt or agent hooks at once, results in handler order; `$ARGUMENTS` and `\$` of a prompt. `runHandler` calls neither `runLimited` nor `okFalseEffect`: the interpreter and engine (planned) do, and until they exist a host calls them itself |
| `interpretRun(entry, run, context)`        | done    | what one raw run came to, as a `HandlerVerdict`: the exit-code table (stdout against exit 0, 2, other), `EXIT2_RULES` per event, `onFailure`, HTTP response handling, `ok: false`, background deliveries |
| `EXIT2_RULES`, `EXIT_TABLE`, `exitClassOf`  | done    | the "Exit code 2 behavior per event" table for all 33 events (can it block, what it does, where stderr goes, the events' own rules) and the "Exit code output" table as data |
| `readStdout`, `readBody`, `readAsyncResponse` | done  | the stdout parsing rule of exit 0 (one JSON object; `{`...`}` text that is not one is a parse failure; arrays and quoted strings are plain text), an HTTP body, an async hook's one-line response |
| `createHookEngine(ports, options)`         | done    | `dispatch(registry, { event, facts, session, signal })`: select, build the input, run every handler (at most 12 prompt or agent hooks at once), read each run, merge; returns a `HookOutcome` |
| `parseHookOutput(event, json)`, `checkOutput` | done | a hook's JSON output against the schema of the event (the universal fields and the `hookSpecificOutput` of the event, bound to the official types): the checked output, or the validation message the `<hook name> hook error` notice carries. A key no schema names is dropped; a wrong type fails; `hookEventName` must name the event |
| `mergeOutputs(event, outputs, facts)`      | done    | the merge of every hook's output, in registry order: what the event honours (`OUTPUT_CAPS`), `continue` and `stopReason`, `systemMessages`, `additionalContext` (with `<system-reminder>` tags defused), `terminalSequences`, the event's own rule (`PreToolUse` deny > defer > ask > allow, `PreModelSwitch` deny > ask > allow, `PermissionRequest`, `PostToolUse` rewrites and the classifier note, `Elicitation`) as `effects`, and the `issues` of what it dropped |
| `OUTPUT_CAPS`                              | done    | per event, which of `continue`, `systemMessage`, `terminalSequence`, `decision` and `hookSpecificOutput` it accepts and which it discards |
| `createOutputStage({ scratch })`           | done    | the `OutputStage` the engine uses by default: `parse`, `limit` (the 10,000-character cap per string, spilled to `ScratchFiles` with a 2,000-character preview, or cut when there is no port) and `merge` |
| `allowedTerminalSequence(value)`           | done    | the value when it is only OSC `0`/`1`/`2`/`9`/`99`/`777` and BEL, ended by BEL or ST; else `undefined` and the field is ignored |
| `parsePermissionUpdates(raw)`              | done    | the six permission update entries of `updatedPermissions` and `permission_suggestions`: the valid ones (`manual` is `default`) and an issue per entry that is not |
| `finalizeEffects(event, effects, block)`   | done    | makes the effects agree with a block that is not a JSON decision: an exit-2 `PreToolUse` is a `deny`, a decline of one `Elicitation` hook beats the accept of another |

Selection also applies the gates of hooks.md: `disableAllHooks` (managed hooks survive it unless the
managed level sets it), workspace trust for settings-file hooks (and for a project skill's), the
stricter folder trust for a project subagent's frontmatter hooks, and plugin enablement. A settings
handler defined in several files runs once; a plugin's or skill's copy stays separate. A Monitor
call that reached a hook through a `Bash` matcher is reported in `monitor`, with whether the hook's
`allow` and `updatedInput` apply to it. `EventFactsOf<E>` is the official input minus the fields
every event shares, except a shared field an event requires (`agent_type` of `SubagentStart`).

`runHandler` takes a `RunContext`: the ports (`runner`, `locations`, `environment`, and an optional
observer with `started`), the serialized input, the session's `cwd`, whether the host is Windows and
which shell a hook with no `shell` field uses (`bash`, or `powershell` on Windows without Git Bash:
the kit cannot tell), the directory the session started in and the system temp directory (the
working-directory fallbacks), each plugin's saved options, the timeout plan and the abort signal. A
command hook with `args` (even `[]`) is exec form and `shell` is ignored; without it the command is
one string for the named shell. The result's `run` is `exited`, `timed-out` (the output is discarded),
`not-started`, `cancelled`, `skipped` (a shell-form plugin hook that references `${user_config.*}`
runs nothing and carries the documented error) or `background`, whose `done` settles when the process
ends, with `wake` set for an `asyncRewake` hook that exited with code 2. What an exit code means and
what `onFailure` does with it are `interpretRun`'s, below.

The remote types return the raw answer in `run`: `http` (`status` and `body`, any status), `http-failed`
(no answer), `mcp` (`isError` and `text`, also for a server that is not connected), `model` (`ok`,
`reason`, `impossible` from a valid answer) and `model-failed` (the model did not answer, or not in the
schema); a timeout and an abort are the shared `timed-out` and `cancelled`. A hook whose port the host
did not give is `skipped` with an error issue. The run ports are `http` (`HttpClient`), `mcp`
(`McpCaller`) and `models` (`ModelRunner`). An `http` hook interpolates `$VAR` and `${VAR}` in header
values only for the names in `allowedEnvVars`; an `mcp_tool` hook waits for a connecting server only on
events that can block or change a result (`MCP_TIMEOUT`, 30 s, within the hook timeout: with the
optional `ports.clock` the call gets what the wait left, and an abort during the wait is `cancelled`).
`RunContext.httpPolicy` carries the merged `allowedHttpHookUrls` (a hook whose URL matches no pattern
is `skipped` with a warning) and `httpHookAllowedEnvVars` (a header variable needs both lists); the
settings stream reads and merges the two keys, the host passes the result.

`createHookEngine(ports, options)` takes the run ports (`commands`, `locations`, `environment`, and the
optional `http`, `mcp`, `models`, `scratch`, `clock`, `observer`, `modelCatalog`) and `options.output`,
an `OutputStage` (`parse`, `limit`, `merge`) that defaults to `createOutputStage` over `ports.scratch`;
`windows`, `defaultShell`, the two fallback directories, `userConfigOf`, `httpPolicy` and `ifEvaluator`
are the host's facts. A `HookOutcome` says `proceed` (false: the guarded action must not happen) with
`block` (`via`: `exit2`, `decision`, `failure`, `continue-false` or `timeout`; the hook error line the
docs show; `to`, who is shown them: `claude`, `user`, `user-and-claude` or `none`, where `reason` and
`message` are empty and `debug` holds the hook's line when the docs send it to the debug log;
`condition` for a `WorktreeRemove` that fails only if the directory remains), `continue` and
`stopReason`, `systemMessages`, `additionalContext`, `effects`, `terminalSequences`, the `<Event>:<tool>
hook error` `notices`, `feedback` (stderr that goes to Claude or the user without blocking), `stdout`
(a `WorktreeCreate` command hook's, whose last line is the path), `runs`, `consumedOnce` (the ids a
session removes) and `background` (the `additionalContext`, `systemMessage` or `wake` text of each
`async` or `asyncRewake` hook once its process ends).

`effects` carries what the merged output asks the host to do, one optional field per thing:
`permissionDecision` with `permissionDecisionReason`, `updatedInput` and, for `defer`, the
`deferCondition` the host applies (`-p` and a single tool call); `permissionRequest` (the `decision`
object: `allow` with `updatedInput` and `updatedPermissions`, or `deny` with `message` and
`interrupt`); `updatedToolOutput` (a built-in tool's value that does not match its output shape, for
Bash, Glob, Grep, WebFetch and WebSearch, is dropped with an issue; MCP output and the other tools
pass through) and `classifierContext` (at most 2,000 characters over every hook); `elicitation`
(`action` and `content` the MCP server receives: any decline wins); `initialUserMessage`,
`sessionTitle`, `reloadSkills`, `suppressOriginalPrompt`, `watchPaths`, `displayContent`, `retry`,
`worktreePath`, `compactionInstructions` and `continuesTurn` (a `Stop` hook's `additionalContext`).
Applying them (writing a title, watching a file, answering the server) is the host's. Each string of
a hook (`additionalContext`, `systemMessage`, `initialUserMessage`, plain stdout) is capped at 10,000
characters; over it the text goes to `ScratchFiles` and the model gets the path and a preview, except
`PreCompact` stdout, which is cut.

How a run is read (hooks.md, "Exit code output"): exit 0 applies valid JSON, and plain stdout reaches
Claude on `UserPromptSubmit`, `UserPromptExpansion`, `SessionStart` and `PostModelSwitch` (the
compaction instructions on `PreCompact`); JSON that fails the output stage's validation is a
non-blocking error, as is any exit code other than 0 and 2 (the notice carries the first stderr line:
`Failed with non-blocking status code: ...`) and a hook that cannot start; exit 2 blocks on the 16
events that can, with the stderr as the reason, shown as the event's row routes it (a JSON decision's
reason of the same hook replaces it) and the JSON fields unable to override it; a `PostToolBatch`
stop also leaves a notice and feedback; `Elicitation` and `ElicitationResult` drop only
`hookSpecificOutput` unless the hook exits 0; a timeout renders no decision except on
`PreModelSwitch`, and on `UserPromptSubmit` leaves a notice with the timeout and the discarded
output. `onFailure:
"block"` on a `command` or `http` hook turns a failure (cannot start, other exit code, HTTP error,
timeout, invalid output) into what exit 2 does on that event, a denial on `PermissionRequest`, and
nothing on `Stop`, `SubagentStop`, `TaskCompleted`, `TeammateIdle` and background hooks. An HTTP 2xx
with an empty body is a success, a 2xx JSON object is read like stdout, any other body, a non-2xx
status and a connection failure are non-blocking errors. Without Git Bash a shell-form `PreToolUse`
or `PermissionRequest` command hook is a gate as the docs describe (`defaultShell: 'powershell'` on
Windows stands for it).

`buildHookInput` puts `session_id`, `prompt_id` (absent until the first prompt), `transcript_path`,
`cwd`, `scratchpad_dir` (absent without a scratchpad), `permission_mode` and `effort` (on the events
that have them), `hook_event_name`, and `agent_id` and `agent_type` (inside an agent, or `agent_type`
under `--agent`) from the session, so a host passes only the event's own facts. A fact with the wrong
type or an unlisted value makes an error issue and no input; a field that belongs to other cases (the
cost fields of `SessionStart` outside resume and fork, `globs` of `InstructionsLoaded` outside
`path_glob_match`, a task field of another task type) or to no field of the event is dropped with a
warning. The free text of `Stop` and `SubagentStop` tasks and crons is capped at 1000 characters with
the `… [+N chars]` marker.

## Host and sessions (planned)

```ts
const host = createPluginHost({ plugins, ports, userConfig });
const session = host.openSession({ sessionId, cwd, permissionMode, transcriptPath });

session.skills(); // what to list to the model and in `/` menus
await session.expandSkill('formatter:review', { arguments: 'src/', signal }); // prompt text
const outcome = await session.dispatch('PreToolUse', input, { signal }); // typed per event
session.mcpServers(); // resolved official McpServerConfig per server
```

`dispatch<E extends HookEvent>(event, input: HookInputOf<E>)` runs every matching handler of
every enabled plugin as hooks.md describes (matchers, `if`, parallel runs, timeouts, `once`,
`async`, exit codes, JSON output) and returns one merged, typed outcome: the decision, the reason,
an updated input, added context and the system messages, with each handler's error kept beside.

The host maps its own tools to Claude Code's names and inputs before dispatching (`Bash`,
`Write`, `Edit`…, typed by the official `ToolInputSchemas`), so a plugin's `"matcher": "Write|Edit"`
and `"if": "Bash(git *)"` mean what they mean in Claude Code.

## Permission rules (done: syntax, bare, parameter and glob rules, precedence, Bash and PowerShell commands, hook `if`, path rules, domain, MCP, Agent and Skill rules, the six permission modes)

Claude Code's rule syntax (permissions.md), used by the `if` field of hooks, `allowed-tools` of
skills and commands, and a host's own permission system. Pure functions over data, no ports.

```ts
import { evaluateRules, parseRule, ruleIssues } from '@rsaryev/claude-plugin-kit';

const { rule, issues } = parseRule('Agent(model:opus)', { behavior: 'deny', source: { kind: 'user' } });
const verdict = evaluateRules(rules, { toolName: 'Agent', input: { model: 'opus' } }, context);
// verdict.behavior is 'deny' | 'ask' | 'allow' | undefined, with the rule that matched
```

| Function                         | Status  | Does                                                                         |
| -------------------------------- | ------- | ---------------------------------------------------------------------------- |
| `parseRule(text, { behavior, source })` | done | `Tool` / `Tool(specifier)` to a `PermissionRule`; a skipped rule is `rule: undefined` plus issues |
| `formatRule(value)`              | done    | the text of an official `PermissionRuleValue`                                |
| `matchRule(rule, call, context)` | done    | bare rules, tool-name globs and `Tool(param:value)`; other specifiers go to the matcher of the tool's rule format |
| `evaluateRules(rules, call, context)` | done | deny, then ask, then allow; the first match wins and specificity never reorders |
| `ruleIssues(rules, knownTools)`  | done    | the matches-no-tool startup warning (typos and labels such as `Stop Task`)   |
| Bash and PowerShell command matchers | done | `Bash(npm run *)`, `Monitor(...)` and `PowerShell(...)`: wildcards, compound commands, wrappers, exec wrappers and `find` actions |
| `evaluateIf(ifRule, toolName, input, context)` | done | whether a hook `if` runs: `{ runs, issues }`; the Bash table of hooks.md, "runs when it cannot tell", a `Bash(...)` rule also answering a Monitor call, and issues reported at `hooks.if` |
| `splitCommand`, `stripWrappers`, `matchBashPattern`, `requiresPromptDespitePrefixRule` | done | the pieces of the Bash matcher, for a host that reads commands itself |
| `Read(...)`, `Edit(...)` path matchers | done | the four anchors (`//`, `~/`, `/` per settings source, `path`/`./path`), gitignore matching, the allow versus deny/ask depth rule, `!` negation, Windows POSIX form, routing (Edit covers Write and NotebookEdit, Read covers Grep and Glob, Edit allow implies read, Read deny covers Edit and Write) |
| `prepareCall(call, paths, resolver)`, `resolveRuleDirectories(rules, paths, resolver)` | done | the symlink two-path rule through the `PathResolver` port: allow needs both paths, deny and ask either; a rule written through a symlinked directory also applies at its real location (`PathContext.realDirectories`); an unresolvable path is a `PortFailure` |
| `readsNetworkPath`, `isNetworkPath`   | done    | UNC and `/net` paths, which always prompt                                    |
| `matchCdRule(rule, target, context)`  | done    | `Cd(path)` patterns: whole-path, `*` one segment, `**` across                |
| `WebFetch(domain:...)` matcher, `matchDomainPattern(pattern, url)` | done | the hostname of the call's `url`: case-insensitive, trailing dot stripped, `*.` any depth but not the domain, bare `*`, a `*` elsewhere one label, `[::1]` and `[::1]:443`, non-ASCII labels as punycode; a deny or ask rule covering `claude.ai` or `*.claudeusercontent.com` also applies to an `Artifact` read call |
| `sandboxDomainEntry(rule)`, `sandboxDomainLists(rules)` | done | the sandbox list a `WebFetch(domain:...)` rule adds to, as data; a bare `WebFetch` adds nothing |
| `Agent(Name)`, `Skill(name)` and `Skill(name *)` matchers | done | `subagent_type` exact (omitted is `general-purpose` for deny and ask; `Agent(fork)` names a fork); `skill` exact or prefix (a whole name or a namespace); a deny rule also sees `PreparedCall.skillNames` |
| `mcpToolRuleMatches`, `normalizeMcpServerName`, `pluginMcpServerName`, `mcpToolName` | done | `mcp__server`, `mcp__server__*`, `mcp__server__tool`; deny and ask rules also cover a server whose name holds `__`, allow rules do not; the Cowork tools of a bare `Bash` or `WebFetch` deny rule |
| `decide(call, context)`           | done    | allow, ask, deny or classify for one call in one of the six permission modes: rules, hook and mod outcomes, protected paths, critical-path removals, network reads (see below) |
| `settleClassification(decision, { call, mode, classifier })`, `PermissionClassifier` | done | the host's auto-mode reviewer as a port; a `classify` decision is settled by its answer, and with no reviewer by a denial |
| `TOOL_CATALOG`, `catalogEntry`, `isKnownTool`, `KNOWN_TOOLS`, `toolRequiresPermission` | done | the 46 tools of the tools table: the "Permission required" column and the rule format of each (`command`, `powershell-command`, `read-path`, `edit-path`, `skill-name`, `subagent-type`, `domain`, `bare`); `KNOWN_TOOLS` feeds `ruleIssues`, `toolRequiresPermission` feeds `DecideContext.requiresPermission` |
| `availableTools(candidates, session)` | done | the tools Claude sees: a bare deny rule or glob removes a tool, a scoped rule does not, `EndConversation` stays while another tool remains, Glob and Grep are absent by default on posix |
| `resolveSubagentTools(request)`   | done    | the tools of a non-fork subagent from `tools` and `disallowedTools`, the two filters of the tools available to subagents, and the zero-tools refusal as an issue |
| `parseToolInput(tool, raw)`       | done    | a hook's `tool_input` read against its tool's table (hooks.md, "PreToolUse input"): `{ input, issues }`, issues at `tool_input.<field>`; unlisted fields and tools without a table pass through |
| `TOOL_INPUT_FIELDS`               | done    | per tool and field: `type`, `optional`, `role` (`primary`, `subject`, `param`, `structured`), `source` (`sdk` or `docs`) and the zod `schema`; the roles drive which parameter rules are ignored |
| `answerQuestions(input, selections)` | done | AskUserQuestion answered for a hook's `updatedInput`: `answers` maps question text to the label, multi-select joined with commas; `{ input, issues }` |
| `effectiveExitPlanModeInput(input)`, `effectiveSearchMode(input)` | done | ExitPlanMode without the ignored `allowedPrompts`; WebSearch's `standard` or `extended` (absent is the full search) |
| `expandToolPath(path, at)`, `expandToolInputPath(tool, input, at)` | done | the absolute `file_path` of `Write`, `Edit` and `Read` as hooks receive it: `~` and relative paths expanded, backslashes on Windows |
| `applyEdit(content, { old_string, new_string, replace_all })` | done | the Edit tool's replacement (tools-reference.md): exact, no regex, `old_string` found exactly once unless `replace_all`, `new_string` inserted as plain text; `{ content, replacements, issues }` and the file untouched when refused |
| `editEncodingIssue(bytes, tool)`, `writeEncodingIssue(existing, content)`, `NOT_UTF8_MESSAGE` | done | Edit and NotebookEdit refuse a file that is not valid UTF-8 (Edit accepts a UTF-16 little-endian byte-order mark); Write may replace such a file unless the content holds `U+FFFD` |
| `effectiveBashTimeout(timeout, env)`, `backgroundTimeLimit({ session, env, timeout, moved })` | done | the foreground timeout (120000 default, 600000 ceiling, `BASH_DEFAULT_TIMEOUT_MS` and `BASH_MAX_TIMEOUT_MS`, the larger wins, above the maximum reduced) and the limit of a background command in an unattended session (30 minutes, 10 for `-p` text, 2 hours at most) |
| `bashOutputLimits(env, bashOutputMaxChars?)`, `windowBashOutput({ output, valid, limits })`, `classifyBashExit(command, exitCode)` | done | what Claude receives of a command's output: valid up to 30,000 characters then a file and a 2,000-character preview, a failure up to 10,000 then a head-and-tail excerpt; exit 1 is valid only for the documented commands |
| `readWindow(content, { offset, limit })` | done | the Read tool's numbered lines from a 1-based offset for a limit, with the empty-file and past-the-last-line notices |
| `checkWebFetchUrl(url)`, `sliceFetched(page, offset)` | done | WebFetch's URL check (localhost and dotless hosts refused with the documented message, `http` upgraded) and its 100,000-character window with the unread count and next offset |
| `validateWebSearchDomains(input)`, `effectiveGrepOutputMode(input)`, `capGlobMatches(matches)` | done | the WebSearch lists that cannot be combined, Grep's default `files_with_matches`, Glob's 100-file cap with a truncation flag |
| `classifyReadTarget({ path, bytes })`, `classifyReadSize(sizing, env)`, `readTokenLimit(env)`, `partialViewNotice(shown, total)` | done | Read's refusals (binary extensions, an image over 128 MB, a notebook over 100 MB) and large-file outcomes: a whole file over 256 KB refused, over 25,000 tokens (or `CLAUDE_CODE_FILE_READ_MAX_OUTPUT_TOKENS`) a `PARTIAL view`, a windowed read over it refused, `allow_large` sized against the context room |
| `shouldMoveToBackground(command, env, session)`, `movedByTimeoutNotice(ms)`, `backgroundCwdNote(command, cwd)`, `backgroundStopNotice(description)`, `classifyPowerShellExit(command, exitCode)` | done | a timed-out foreground command moves to the background unless it starts with `sleep`, `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` is set or the session is bare; the documented notices verbatim; PowerShell's own benign exit-1 list (`findstr` in) |
| `validateGlobInput(input)`, `globRespectsIgnore(env)`, `windowGrepContent(lines, window)`, `windowGrepCounts(counts, window)`, `totalGrepCount(counts)`, `effectiveGrepMultiline(input)` | done | Glob's null-byte refusal and `CLAUDE_CODE_GLOB_NO_IGNORE=false`; Grep's `No entries at this offset`, the count total that covers every match and the single-line default |
| `webSearchLimits(env, session)`, `webSearchAllowance(limits, usage)`, `webFetchTimings(env)`, `redirectNotice(original, target)` | done | WebSearch's 200-call cap (raised, never removed), refill per hour and per-turn scope with `-p`; WebFetch's 15-minute cache, five-minute deadline (`0` removes it) and cross-host redirect text |
| `parseAgentResponse(toolResponse)` | done | an Agent call's `tool_response` (hooks.md, "Agent") as `completed` or `async_launched`: `{ response, issues }`; a launch has no usage fields, `modelsUsed` and `resolvedModel` kept as received |
| `parseBashEditDiff(toolResponse)`, `bashEditDiffTrust(diff)` | done | a Bash call's `tool_response.bashEditDiff` (hooks.md, "Bash"): `{ diff, issues }`, warnings for more than 200 `changedFiles`, more than 5 `files` and a missing `changedFiles`; `{ complete, attributable }` from `unavailable`, `skipped` and `shared` |

`parseRule` returns the official `{ toolName, ruleContent? }` in `rule.value` and the read form in
`rule.specifier` (`param`, `domain` or `text`), so matching never parses text again. Deny and ask
rules read `name:value` as an input parameter; an allow rule keeps each tool's own syntax. An
`mcp__` rule with parentheses is skipped in a settings file (`RuleSource` `managed`,
`embedder-managed`, `project`, `local`, `user`, `flag-settings`) and read as a parameter rule from
the command line or the session. A `Skill(skill:<name>)` deny rule also matches the names in
`PreparedCall.skillNames`.
`SPECIFIER_MATCHERS` holds one matcher per `RuleFormatId` (the "Rule format" table of
tools-reference.md). The `bare` format, a tool the table lists no specifier for, has no matcher and
fails closed: an allow rule matches nothing, a deny or ask rule matches every call of its tool.

A command rule (`src/rules/bash`) splits the command at `&&`, `||`, `;`, `|`, `|&`, `&` and
newlines outside quotes, and again inside `$()`, backticks, subshells and control-flow bodies. An
allow rule matches when every subcommand matches it and never matches a command the kit could not
read to the end (`npm test &&`); a deny or ask rule matches when any subcommand does. Each
subcommand is also tried after the fixed wrappers (`timeout`, `time`, `nice`, `nohup`, `stdbuf`,
`command`, `builtin`, `noglob`, bare `xargs`) and leading `VAR=value` assignments are stripped (an
allow rule strips only `NODE_ENV`, `LANG`, `NO_COLOR` and `MatchContext.safeEnvVars`). A prefix
allow rule never approves `watch`, `setsid`, `ionice`, `flock` or a `find` that runs, deletes or
writes. `ruleIssues` also reports a `Bash` allow rule with a `*` before the subcommand
(`Bash(git * main)`). The rule matches the text as written, never a path or quote-normalised form:
`/usr/bin/curl` and `sh -c 'curl ...'` are not `Bash(curl *)`.

A path rule (`src/rules/path`) is a gitignore pattern over the path below its anchor (the `ignore`
package). Deny and ask rules match when any of a call's paths matches, allow rules when all do (the
requested path and `PreparedCall.resolvedPaths`, which `prepareCall` fills). A `!` rule carves paths
out of the rules before it in the same source and list; `evaluateRules` applies it. `Write(...)`,
`Glob(...)`, `Grep(...)` and `NotebookEdit(...)` rules with a path never match; write `Edit(...)` or
`Read(...)`. A host asks `readsNetworkPath` before it trusts any allow rule, hook or classifier.

`decide` (`src/rules/decide`) is pure over the call and the session facts in `DecideContext`; the host
supplies the PreToolUse hook outcome (`hook`), a mod's answer (`mod`), `autoAvailable`,
`bypassAvailable`, `interactive` and the other facts the docs name. The gates run in the order of the
docs: the `permissions.block*OutsideWorkingDirectories` keys, a hook block (exit 2), deny rules, ask
rules and hook asks (a deny or ask rule is checked whatever a hook returned), the actions no mode
auto-approves (critical-path `rm` and `rmdir`, `AskUserQuestion` and MCP tools marked
`requiresUserInteraction`, network-path reads), protected-path writes (before allow rules), allow
rules (a compound Bash command needs each subcommand allowed by some allow rule or read-only), a hook
allow, read-only calls, then the mode's baseline: `default` asks, `acceptEdits` approves file edits and
`mkdir`, `touch`, `rm`, `rmdir`, `mv`, `cp`, `sed` in scope, `plan` asks (or classifies shell
commands, or runs everything in an interactive session with bypass permissions available), `auto`
approves reads and in-scope edits and returns `classify` for the rest, `dontAsk` turns every prompt
into a denial, `bypassPermissions` approves what is left. A mod can block, and can approve what its
reach allows (`ModOutcome.policyEnforced` is managed settings or a Team or Enterprise login).

The tool catalog (`src/rules/tools`) is the one place that says which rule format a tool takes
(`ruleFormatOf` reads it) and whether it prompts in Manual mode. What the host's model, provider and
surface offer (the task tools by model, `EndConversation`'s surface and provider conditions, the
`SubagentHandback` conditions) is not modelled: the host passes the candidate tools, and
`availableTools` and `resolveSubagentTools` narrow them by the documented rules.

What the kit does not decide is the classifier's judgement of an action in auto mode: `decide`
returns `classify` and the host's `PermissionClassifier` answers. Also not modelled: the PowerShell
read-only set, the `Remove-Item` and `cmd` removal denies (an `acceptEdits` `Remove-Item` that the
check would deny is only not approved), the `Monitor` removal check, the mounted-drive `rm` prompt,
redirect targets and `tee` files (a redirect makes a command not read-only), the first read outside
the working directories in auto mode, the `LSP` tool under the read block, and the time limits of the
critical-path prompt. `acceptEdits` approves the `Set-Content`, `Add-Content`, `Clear-Content` and
`Remove-Item` cmdlets in scope. With `blockReadsOutsideWorkingDirectories` a Bash command that reads
outside, or that the parser cannot trace, prompts in every mode (`sandboxEnforcesReadBlock` lifts it);
`blockWritesOutsideWorkingDirectories` also refuses settings files inside the working directories
(reason `settings-file`) and leaves the session's own files writable (`sessionDirectories` names the
scratchpad). `ProtectedPathOptions` carries `symlinkTargets` (a write there prompts in the modes that
classify), `configDirectory` (`CLAUDE_CONFIG_DIR`) and `restricted`.

## Mods (in progress: the hook chain, the events, the API, the interface, loading and the test kit)

A mod is a plugin whose hooks module registers event handlers (plugins/mods/overview.md). The kit
never runs a module's source: the host evaluates it in an isolate it chooses through the
`ModRuntime` port, and the kit runs the hooks it hands back through one chain per event.

```ts
import { createModChain, ENGINE_ORIGIN } from '@rsaryev/claude-plugin-kit';

const chain = createModChain({ clock });
const issues = chain.register({ name: 'my-mod', api }, 'user', hooks); // [] or why the module is refused
const result = await chain.dispatch('tool.call', event, {
  origin: ENGINE_ORIGIN,
  signal,
  core: (e) => runTheTool(e), // Claude Code's own behaviour, at the end of the chain
  report: (report) => log(report.line), // my-mod: tool.call hook skipped: threw Error: boom
});
```

| Piece                                 | Status  | Does                                                                                  |
| ------------------------------------- | ------- | ------------------------------------------------------------------------------------- |
| `createModChain(options)`             | done    | middleware chain by tier, matchers, `*` and `classic.*`, `next`, `next.to`, `.catch`, time and nesting limits; streams for `turn.step` and `process.spawn` through `dispatchStream` |
| `MOD_LIMITS`, `MOD_NAME_PATTERN`      | done    | every number of the reference's Limits table                                          |
| `MOD_EVENT_NAMES`, `MODS_API`, `MOD_TIERS`, `CLASSIC_EVENT_NAMES`, `API_EVENT_NAMES` | done | the 48 events, the 21 namespaces, the tiers, and the names derived from them (`plugin.name` and `plugin.root` are values, so not events) |
| `createBudget`, `deepFreeze`, `plainDataProblem`, `jsonChars`, `jsonBytes` | done | `foundation`: a time budget on the `Clock` port that stops while code waits, in-place deep freeze, a stack-safe walk with depth, node and character limits, JSON sizes |
| `createEventRules()`, `EVENT_SPECS`   | done    | what the chain knows of the tool, prompt, command, `/config`, turn, session and subagent events: documented input fields, the shapes a hook can answer with, refused changes, what Claude Code receives, the cut reason (`createModChain({ clock, rules })`) |
| `eventResultProblem`, `eventInputProblem` | done | why a result or an input does not fit an event, or `undefined`; unknown events are not checked |
| `clampReason`, `mergeToolCheck`, `skillPromptEvent`, `autocompleteRows` | done | the 4,096-character reason cut; the `tool.check` decision with plan mode (a mod can tighten a call that is not read-only, not approve it) and the organization's `ceiling: 'ask'` (an `allow` still asks); the `skill.prompt` event from a skill and its parsed frontmatter; Claude Code's autocomplete rows then the mods' |
| `createModsApi(options, plugin)`      | done    | the `$` of one mod: every namespace of the reference, each call an event through the chain and then a port; `engine.create` fires once and may add or withhold a namespace; `dispose()` stops its timers and forgets its registrations |
| `createRegistries()`, `createStateStore()`, `readEngineSettings(options)`, `withApiRules(rules)`, `isValidModName`, `atom`, `read`, `update` | done | what mods registered (commands, tools as `mcp__<plugin>__<name>`, subagent types), `$.state`, Claude Code's own `settings.read`, the shape rule for API calls, the 64-character name rule, the state helpers |
| `createModsUi(options)`, `withUiRules(rules)`, `uiApi(deps, parts)` | done | the interface part: the `$.ui` of a mod (`ModsApiOptions.ui = ui.api`), `draw` a render site (fires `ui.render`, folds the answer), `loadMod` (fires `ui.resolve`), `fault(plugin, report)` and `message(plugin, data)` (each reaches only that mod's hooks), `change` (focus and scroll), the panes, the toast board and the redraw throttle; the chain takes `withUiRules(withApiRules(createEventRules()))` |
| `defaultElementTable(surface)`, `treeProblem`, `sizeProblem`, `foldRender`, `renderEvent`, `decideSite` | done | the 12 elements an app draws, why a tree is not valid for a site and app, which size limit refuses it, what a site shows once the chain settled (tree, Claude Code's own drawing, refused), and the `ui.render` event for a site |
| `routeControl`, `hotkeyTable`, `digitButton`, `actionButtons`, `collectControls` | done | a press, typing or a pick routed to a control by its key through `ui.press`, `ui.input`, `ui.select` before its callback; hotkeys (later duplicate wins, none in VS Code or a collapsed band), the band's digit hotkey, `action` bindings |
| `placePane`, `createPaneRegistry`, `parseOpen`, `createRedrawGate`, `createToastBoard` | done | where a pane appears (any width for the user, 144 or 110 columns for a mod), `ui.close` origins, the `ui.open` fields, redraws throttled and coalesced, toasts by renderer |
| `createModsHost(options)`             | done    | the mods runtime of one session: `load(plugins)` decides which hooks modules load and in which tier (policy), runs each through manifest, `hooks.json`, compile, scan, options, `plugin.register` and `runtime.load`, and returns every refusal as a line (`hooks module <id> not loaded: <reason>`, `<mod>: refused by <mod>: <reason>`); `session.start` fires for each loaded mod after `load` and `reload`; `reload()` for `/reload-plugins` (mods the host registered with `registerBuiltIn` stay); `reloadMod(name)` for a save in a `--plugin-dir` directory (a broken save keeps the version loaded before); `pluginDirs()`, `watchesPluginDirs(isInteractive)`; `fire`, `fireStream`, `registerBuiltIn`, `active()` |
| `decideModLoad`, `orderMods`, `hooksModulesOff`, `parsePluginDirs`, `sideloadRefusal`, `modOptions` | done | policy over plain settings data: `disableAllHooks`, `allowManagedHooksOnly`, `disableSideloadFlags`, `prependPlugins`, `appendPlugins`, `pluginConfigs`, `CLAUDE_CODE_PLUGIN_DIRS` and `_DIR_WATCH`, the built-in guard `sec-default@builtin` and its two options |
| `scanHooksModule(source, file, options)`, `validateMod(input, options)`, `activeModsLine(mods)` | done | the static scan (events handled, `$` calls, env and state use, the 2,000-scope limit) behind `plugin.register`'s `e.uses` and `claude plugin validate`; the `/plugin` line `1 mod active · first-mod` |
| `readHooksJsonModules(raw)`, `isHooksModuleName`, `isModTestFile`, `resolveTypesPath` | done | `hooks/hooks.json` `modules`, the hooks module and `.test.ts` file names, the `types/index.d.ts` path |
| `modsTesting.*` (`runModTests`, `createTestKit`, `inlineTests`, `inlineRuntime`, `fakePorts`, `mock`, `expect`) | done | `claude plugin test [directory]` and the `claude-code/testing` module: the host binds `claude-code/testing` to `createTestKit()` per test file and evaluates the compiled file through `ModTestRuntime.loadTests`; the kit builds each test's world (fake ports, stubs, mock clock), runs it under the 5 s limit and prints what Bun's runner prints |

`ModRuntime` and `ModTestRuntime` are the only places a hooks module or a test file runs. `HookCall.direct`
lets a runtime that evaluates in this process (the kit's `inlineRuntime`) call a hook with the mod's own `$` and the chain's own `next`.

`register` takes the tier `prepend`, `user`, `append` or `builtin` (never `core`, which is Claude Code's own
behaviour); the built-in guard `sec-default@builtin` registers first in `prepend`. It refuses a whole module (and adds none of its hooks) when `on("x")` is registered twice
without a matcher, when a hook's form does not fit its event, when a telemetry hook lacks
`{ to: 'collector' }`, or when a matcher's expression does not compile. `dispatch` takes the
`DispatchOptions`: `core` is what runs after the last hook, `report` receives the line for every
hook skipped, `caller` names the mod whose API call fired the event (only the hooks of the mods that run before it, and its own, handle the event), `reentry` names the mod whose own API call fired the event (its hooks are skipped
as `re-entry`; the host passes the `rewritten` and `lent` flags and a handler's `next.error.cause` is `rewritten`, or `lent` unless `rewritten` also applies), and `groupMs` the time all `session.end`
hooks share (default 1.5 s, counted from the first hook that has the floor; pass more when settings raise the SessionEnd budget). A hook's own
time excludes `next` and mods API calls except `$.clock.sleep`; the chain wraps the mod's `$` to
meter that and to reject an argument nested past 28000 levels. The ports for mods that name
`PluginIssue` live in `src/mods/ports.ts`, not `src/ports`.

The events part gives the chain what is specific to an event: `createModChain({ clock, rules:
createEventRules() })`. A hook's result must fit the "A hook can return" column of the reference
(`{ deny }`, `{ decision }`, `{ drop }`, `{ text }`, `{ suggestions }`, `{ skip }`, `{ consumed }`,
`{ isDelivered: false, reason }`, `{ isOffered: false }`...); one that does not fails the hook like a
throw, and Claude Code's own answer (`core`) is an object of the same shape. An event whose only
answer is `next(e)` takes any result. The fields the docs name are typed on an event's input, any
other field is carried. The firing is the host's: the kit proves what it does with each answer, not
when Claude Code raises the event.

### The mods API

```ts
const chain = createModChain({ clock, rules: withApiRules(createEventRules()) });
const scopes = new Map();
const { api, dispose } = await createModsApi(
  { chain, ports, registries: createRegistries(), state: createStateStore(), scopes, report, debug },
  { name: 'my-mod', tier: 'user' },
);
chain.register({ name: 'my-mod', api }, 'user', hooks); // hooks see `api` as `$`
```

`ports` is a `ModHostPorts`: the shared `Clock`, `Locations`, `CommandRunner` and `McpCaller` and the
mods ports `ModFs`, `ModSpawner`, `ModFetcher` (any method, and the kit judges each redirect),
`ModModels`, `ModSession`, `ModPrompts`, `ModAgents`, `ModCommands`, `ModTools`, `ModTurns`,
`ModConfig`, `ModSettingsReader`, `ModAudio`, `ModEnv`, `ModStore` and `TelemetrySink`. The kit owns
what the docs say about a call (paths against the working directory, the 4 MiB limits, `isStdoutTruncated`, the 4 MiB cut of a fetch body,
the redirect and header rules, prompt blocks and cache breakpoints, the newest 4,096 messages) and the
port does the effect. A call fires the event named for it (`fs.read`, `store.get`...); a mod before the
caller can rewrite it, answer `{ value }` or refuse with `{ deny }`, which rejects the call. A
call whose result is its event's own (`tool.call`, `command.run`, `prompt.submit`, `session.send`...)
resolves to that result. A hook on a call runs only for the mods after it (the chain's `caller`
option). `$.clock.after` and `$.clock.every` return their timer at once, not a promise. `$.ui` is built by `createModsUi(...).api` and passed as `options.ui`.
Judgments are in `spec/judgments.md`.

### The interface

```ts
const ui = createModsUi({ chain, clock, iface, signal, report, debug }); // iface: a ModInterface
const chain = createModChain({ clock, rules: withUiRules(withApiRules(createEventRules())) });
await createModsApi({ chain, ports, registries, state, scopes, report, debug, ui: ui.api }, ref);
await ui.loadMod('my-mod'); // ui.resolve, once for each app and render site
const drawn = await ui.draw({ site: 'Pane', surface: 'terminal', requestId: 'hello-tabs' });
// { tree } | { engine } | { refused, line }
await routeControl({ chain, tree, surface, signal, report }, 'press', 'more'); // { issues, ran }
```

`ModInterface` is the one port: what only the host knows (the app, the measured window, the
renderer, whether the user caused the call) and what it draws (status and log lines, notify, ask,
copy, selection, blit, focus, scroll). The kit owns what the docs say about each call and the
tree. A hook's tree is judged when it returns: an element or prop the element does not take, a
child where none goes, a missing or doubled key, a field over its limit, an element the app does
not draw, or (in the band) a forbidden prop on a `Box` around another mod's tree fails the hook as
`returned the wrong shape (a tree Pane refuses: ...)`. The size limits (32 levels, 20,000 nodes,
262,144 `Raster` cells, 2 MiB of `Image` bytes) refuse the settled tree at its site, and the first
100,000 characters of text are drawn. Firing is the host's: it passes the site, the viewport and
the gesture, and the kit proves what the hooks receive and what is drawn from what they answer. It
draws nothing, so no claim here is about pixels or terminal cells. Judgments are in
`spec/judgments.md`.

## Testing kit (planned)

`@rsaryev/claude-plugin-kit/testing`: in-memory `PluginFiles`, a scripted `CommandRunner`, a
recording `HttpClient`, fixtures of real plugin shapes. A host tests its integration without a
disk, a shell or a network.
