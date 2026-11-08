# Architecture

## What the kit is

A library a host embeds to support Claude Code plugins: it reads the plugin format and runs the
parts that need a runtime (hooks, skill expansion, rule matching) through ports. It is not an
agent, not a model client and not a sandbox. It runs anywhere JavaScript runs.

## Layers

`src/` is split into modules; a module imports only from its own folder and from lower layers
(`bun run check:layers`, L1). `src/index.ts` is the public entry and may import anything.

| Layer | Module        | Holds                                                                         |
| ----- | ------------- | ----------------------------------------------------------------------------- |
| 0     | `protocol`    | Official types re-exported; runtime lists asserted equal to them              |
| 1     | `ports`       | The interfaces a host implements, type-only: files, runner, http, model, mcp… |
| 2     | `format`      | Pure readers and validators of plugin files: manifest, frontmatter            |
| 3     | `rules`       | Permission rules: syntax, parameter and tool-name matching, deny/ask/allow order; `rules/bash` holds the Bash and PowerShell command matchers and the hook `if` evaluation; `rules/path` the Read and Edit path matchers (anchors, gitignore matching, depth, negation, symlinks, Windows, routing, network paths, `Cd`); `rules/target` the WebFetch domain, MCP, Agent and Skill matchers; `hook-matcher.ts` is the hooks' shared matcher grammar; the tool catalog is planned |
| 3     | `settings`    | Settings layers and the policy keys, pure over data (planned)                 |
| 3     | `marketplace` | Marketplace and plugin-entry reading, sources, dependencies (planned)         |
| 3     | `loading`     | A plugin folder to a typed `Plugin`; `loading/resolve` holds variable substitution, MCP, LSP, monitor and command-hook resolution (with LSP's runtime decisions and the monitor trigger engine), Markdown content substitution and the shell-field guards (done), the rest planned |
| 3     | `foundation`  | Shared by mods and the layer-4 streams: budgets, result shapes (planned)      |
| 4     | `agents`      | Sub-agent definitions and their scoping (planned)                             |
| 4     | `hooks`       | The hook engine: select, run through ports, merge outputs (planned)           |
| 4     | `skills`      | Skill and command expansion (planned)                                         |
| 4     | `mods`        | The mods runtime: events, guest hooks through a host runtime (planned)        |
| 5     | `host`        | `createPluginHost`, sessions: composition of the modules above (planned)      |
| 6     | `testing`     | Fakes of every port for hosts' tests (planned)                                |

Modules of the same layer never import each other (L1): what two of them share lives in a lower
layer. `tests/support/` holds the fakes of the ports until `testing` publishes them.

## Ports

`src/ports/` is one type-only file per port (`index.ts` is the barrel). Conventions every stream
follows:

- A port is minimal; a stream that needs more of one extends it in its own file and never edits a
  shared port without its owner. A port that names only layer-1 and layer-0 types is
  `src/ports/<stream>.ts`; one that names a type of layer 2 or higher lives in its own module,
  because layer 1 cannot import upward. That is rules' `PermissionClassifier` (`PreparedCall`),
  settings' `SettingsSources` (`PolicyScope`), mods' ports (`PluginIssue`) and marketplace's
  `SourceFetcher` (`FetchPlan`, `PluginIssue`).
- Only the foundation owner edits `src/ports/index.ts`. A stream's own ports are exported through
  its module barrel, so two streams never conflict on the shared one and `export type *` never
  sees two ports with one name. Mods' port is `ModSettingsReader`, not `SettingsSources`.
- `McpBundleReader` is a port of the `loading` stream: it names only layer-0 types, so its file is
  `src/ports/mcp-bundle.ts`, and the `loading` barrel exports it (not `src/ports/index.ts`).
- A request that does I/O carries `signal: AbortSignal` (runner, http, model, mcp); a path-style
  read takes it as a trailing optional argument (`PluginFiles`, `Locations`).
- An absent file or directory is `undefined`, not an error. An effect that did not happen is a
  `PortFailure` value (`{ failure, message }`) in the result union, never a throw; a missing port is
  a `PluginIssue` for the component that needed it.
- `CommandRunner` takes the form it should run (`exec` with arguments, or `shell` with a named
  shell), so the kit never builds a process line; timeouts are computed by the kit and enforced by
  the port.
- Paths a `PluginFiles` takes are relative to the plugin folder and `/`-separated; the host's own
  paths come from `Locations`, which also joins them. A `TextFileReader` that reads outside a
  plugin (an agent's memory folder) takes those host paths: absolute, built with `Locations`.
- `HttpRequest.as` says whether the body comes back as decoded text (`body`) or raw `bytes`; an
  archive is always `bytes`, and `maxBytes` counts bytes either way.

## Homes shared between streams

Decided once so two streams never build the same thing, and so no design asks for a layer it
cannot have (`check:layers` rejects a module that has none):

- Variable substitution lives in `loading/resolve`; skills (content) and hooks, both layer 4,
  import it and write no placeholder code of their own. The planned `resolve` module is a folder of
  `loading`, not a module.
- `foundation` is layer 3: it may use `Clock` (layer 1) and `PluginIssue` (layer 2), and is used by
  layer 4. Rules and settings, also layer 3, cannot import it.
- Hooks owns two shared files: `rules/hook-matcher.ts` (`matchesMatcher`; skills, agents and mods
  import it) and `format/hooks-settings.ts` (`readHooksFile`). No other stream writes them.
- Hooks' own ports and fakes (`HookObserver`, `ModelCatalog`, the contracts file and its fake) live
  in the `hooks` module and a file of their own under `tests/support`, not in `src/ports`.

## Names the stream designs use

The foundation's names win; a design that says otherwise means this:

| A design says                                        | The code has                                                       |
| ---------------------------------------------------- | ------------------------------------------------------------------ |
| `parseFrontmatter` returning `{ data, body, problem }` | `parseFrontmatter` returning `{ state, present, fields, body, problem?, line?, column? }` |
| `splitFrontmatter`                                   | `parseFrontmatter`                                                 |
| `HostEnvironment`, `HookEnv`                         | `Environment`                                                      |
| `PluginFiles.read`                                   | `PluginFiles.readText`                                             |
| `Locations.pluginData(id): string`                   | `pluginData(id, signal?): Promise<string>`                         |
| `HttpClient.post(...)`                               | `request({ method: 'POST', ... })`                                 |
| `scriptedCommandRunner`, `recordingHttpClient`, `fakeModelRunner`, `fakeMcpCaller` | `scriptedRunner`, `recordingHttp`, `fakeModel`, `fakeMcp` |
| `fakeLocations`, `fakeEnv`                           | `locations`, `fakeEnvironment`                                     |
| `readList(key, value)`                               | `readList(key, value, { separators, braces? })`: pick the mode the docs give the field |

## Invariants

- **L2** `@anthropic-ai/*` is imported only in `src/protocol/`, only as `import type`.
- **L3** `src/` imports no `node:*` or `bun` module and uses no ambient effect: `Bun`, `process`,
  `globalThis`, `Date`, `performance`, `crypto`, `fetch`, `setTimeout` and the other timers. Every
  effect is a port call (`Clock`, `HttpClient`…); the kit cannot tell a laptop from a cloud sandbox.
- **L4** `src/` never imports `tests/` or `scripts/`.
- An error in a plugin is a `PluginIssue`, never a thrown exception; a thrown exception is a bug
  in the kit.
- What Claude Code documents decides behaviour (docs/SPEC.md); anything else is a recorded
  judgment.

## Repository

| Folder          | Holds                                                                       |
| --------------- | --------------------------------------------------------------------------- |
| `src/`          | the package                                                                 |
| `tests/`        | tests mirroring `src/` modules; `tests/support/` helpers (`spec()`)         |
| `spec/`         | `requirements.json` (generated), `judgments.md`                             |
| `scripts/docs/` | `docs:pull`                                                                 |
| `scripts/spec/` | the requirement extractor and `check:spec`                                  |
| `scripts/compat/` | the compatibility report                                                  |
| `scripts/`      | the other gates (`check-*.ts`)                                              |
| `config/lint/`  | the quality lint (`quality.json`) and the kit's own rules (`kit-rules.js`)  |
| `.cache/`       | pulled docs, the corpus, test reports: local only                           |
