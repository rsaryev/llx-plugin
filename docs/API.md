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
| `readHooksFile(raw)`                | planned | `hooks/hooks.json` → official `HooksSettings`                         |
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
Skills pass their own variables as `scope.extra` (`CLAUDE_SKILL_DIR`, `CLAUDE_SESSION_ID`).

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

## Permission rules (planned)

`parseRule('Bash(git push *)')` and `matchRule(rule, toolName, input)`: Claude Code's rule syntax
(permissions.md), used by the `if` field of hooks, `allowed-tools` of skills and commands, and a
host's own permission system. Every example table in permissions.md is a requirement.

## Testing kit (planned)

`@rsaryev/claude-plugin-kit/testing`: in-memory `PluginFiles`, a scripted `CommandRunner`, a
recording `HttpClient`, fixtures of real plugin shapes. A host tests its integration without a
disk, a shell or a network.
