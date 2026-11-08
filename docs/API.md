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
| `readMarketplace(raw)`              | planned | `marketplace.json`: entries, sources, strict mode (contracts done: see Marketplace) |
| `readSkill(path, text)`             | planned | `SKILL.md` frontmatter and body                                       |
| `readCommand(path, text)`           | planned | a command file (the older skill format)                               |
| `readAgent(path, text)`             | planned | an agent file → official `AgentDefinition`                            |
| `readHooksFile(raw)`                | done    | `hooks/hooks.json` → official `HooksSettings`: events, matcher groups, every handler field; an error leaves no hooks, as Claude Code does |
| `readHooksSettings(raw)`            | done    | the bare event map (inline `hooks`, skill frontmatter, `settings.json`) |
| `matchesMatcher(matcher, value, mode?)` | done | a hook `matcher` against the field its event filters on: match-all, exact list, unanchored regex; `'narrow'` for FileChanged and StopFailure |
| `readMcpConfig(raw)`                | planned | `.mcp.json` → official `McpServerConfig` map                          |
| `readLspConfig(raw)`, `readMonitors(raw)`, `readOutputStyle(...)` | planned | the remaining component files |

## Marketplace (planned: contracts done)

`marketplace.json` and where plugins come from (plugins/marketplace-reference.md,
plugins/host-marketplace.md, plugins/dependencies.md). The shapes below are fixed first, in
`src/format/marketplace/types.ts` and `src/marketplace/types.ts`, so the readers, the fetch
planners and the decisions are written against one contract. Reading and planning are pure; the
engines that download, run a command or hash take their effect through ports.

```ts
import { readMarketplace, planPluginFetch } from '@rsaryev/claude-plugin-kit';

const { marketplace, issues } = readMarketplace(JSON.parse(text), { origin }); // bad entries dropped alone
const { plan } = planPluginFetch(entry.source, { platform: 'posix' }); // data: git, npm, archive, command, local
```

| Name                                            | Status  | Does                                                                              |
| ----------------------------------------------- | ------- | --------------------------------------------------------------------------------- |
| `Marketplace`, `MarketplaceEntry`, `Owner`, `Relevance` | done | the parsed file: top-level fields, entries with `strict`, `components` and `display` |
| `PluginSource`, `PLUGIN_SOURCE_KINDS`           | done    | the seven plugin sources as a union on `kind`; a registry is typed over the kinds |
| `MarketplaceSource`, `MARKETPLACE_SOURCE_KINDS` | done    | the ten marketplace sources, three valid only in policy lists                     |
| `PLUGIN_ID_PART`, `isPluginIdPart`, `pluginIdIssues(part, name, path)` | done | each part of `plugin@marketplace`: the grammar, the documented messages (`part` is `'marketplace'` or `'plugin'`) |
| `desktopNameIssues(part, name, path)`           | done    | the Claude Desktop warnings: reserved marketplace names, 128-character grammar    |
| `FetchPlan`, `FetchPlanContext`, `ArchiveLimits`, `MarketplaceFetchPlan` | done | what planning returns, as data a host executes                    |
| `Sha256`, `ArchiveReader`, `GitTags`, `SourceFetcher` | done | ports only marketplaces use (`src/ports/marketplace.ts`, `src/marketplace/ports.ts`), exported by the marketplace barrel |
| `NormalizedDependency`, `RenameStatus`          | done    | values the dependency and rename decisions return                                 |
| `readMarketplace`, `validateMarketplace`, `parsePluginSource`, `mergeEntryWithManifest` | planned | the readers and the strict-mode merge |
| `planPluginFetch`, `planMarketplaceFetch`, `parseMarketplaceInput` | planned | pure plans and the `marketplace add` input forms                |
| `runCommandSource`, `fetchArchive`, `mergeHeaders`, `helperAllowed` | planned | engines through `CommandRunner`, `HttpClient` and the ports above |
| `validateRenames`, `resolveRename`, `migrateSettingsKeys`, `removedPlugins` | planned | renames and removal                                          |
| `normalizeDependency`, `selectTag`, `combineRanges`, `checkInstalledDependency` | planned | dependency ranges against release tags                     |

`SourceFetcher` is for what only a host can do (a git clone with sparse checkout, an `npm pack`):
it takes the git and npm plans and returns the fetched files or a `PluginIssue`. A missing port is
a `PluginIssue` for that source only.

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

## Testing kit (planned)

`@rsaryev/claude-plugin-kit/testing`: in-memory `PluginFiles`, a scripted `CommandRunner`, a
recording `HttpClient`, fixtures of real plugin shapes. A host tests its integration without a
disk, a shell or a network.
