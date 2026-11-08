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

## Permission rules (done: syntax, bare, parameter and glob rules, precedence, Bash and PowerShell commands, hook `if`, path rules, domain, MCP, Agent and Skill rules)

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
| `decide`, tool catalog            | planned | modes and the tool table                                                     |

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

## Mods (in progress: the hook chain, the events, the API and the interface)

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
| `createModsUi(options)`, `withUiRules(rules)`, `uiApi(deps, parts)` | done | the interface part: the `$.ui` of a mod (`ModsApiOptions.ui = ui.api`), `draw` a render site (fires `ui.render`, folds the answer), `loadMod` (fires `ui.resolve`), `fault`, `message`, `change` (focus and scroll), the panes, the toast board and the redraw throttle; the chain takes `withUiRules(withApiRules(createEventRules()))` |
| `defaultElementTable(surface)`, `treeProblem`, `sizeProblem`, `foldRender`, `renderEvent`, `decideSite` | done | the 12 elements an app draws, why a tree is not valid for a site and app, which size limit refuses it, what a site shows once the chain settled (tree, Claude Code's own drawing, refused), and the `ui.render` event for a site |
| `routeControl`, `hotkeyTable`, `digitButton`, `actionButtons`, `collectControls` | done | a press, typing or a pick routed to a control by its key through `ui.press`, `ui.input`, `ui.select` before its callback; hotkeys (later duplicate wins, none in VS Code or a collapsed band), the band's digit hotkey, `action` bindings |
| `placePane`, `createPaneRegistry`, `parseOpen`, `createRedrawGate`, `createToastBoard` | done | where a pane appears (any width for the user, 144 or 110 columns for a mod), `ui.close` origins, the `ui.open` fields, redraws throttled and coalesced, toasts by renderer |
| Loading, test kit                     | planned | the other parts of mods                                                               |

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
