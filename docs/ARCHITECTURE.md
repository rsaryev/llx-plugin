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
| 2     | `format`      | Pure readers and validators of plugin files: manifest, frontmatter, output style, skill (`skill-types`, `skill-fields` and its readers, `skill-name`, `skill`), command (`command`), agent files (`agent*.ts`), MCP server environment expansion, display and endpoint identity for servers of the settings scopes (`mcp-env`, `credential-env`, `mcp-endpoint`; pure over a lookup function, the one rule plugin servers share; `credential-env` is also the one credential classifier and the scrub table, `helper-headers` the one reader of a `headersHelper`'s output), the standard layout registry (`layout.ts`), plugin settings, load messages, MCP contracts (`mcp-oauth`, `mcp-add-json`, `mcp-add`, `mcp-tool`, `mcp-tool-schema`, `mcp-schema-check`, `mcp-output`, `mcp-prompts`, `mcp-elicitation`, `mcp-elicitation-form`, `mcp-knobs`, `mcp-reload`, `mcp-plugin-display`; the barrel `mcp-contract` keeps `src/index.ts` within its budget) |
| 3     | `rules`       | Permission rules: syntax, parameter and tool-name matching, deny/ask/allow order; `rules/bash` holds the Bash and PowerShell command matchers and the hook `if` evaluation; `rules/path` the Read and Edit path matchers (anchors, gitignore matching, depth, negation, symlinks, Windows, routing, network paths, `Cd`); `rules/target` the WebFetch domain, MCP, Agent and Skill matchers; `rules/decide` the permission modes (`decide`, protected paths, critical-path removals, the hook and mod gates, the `PermissionClassifier` port); `rules/tools` the tool catalog (permission required and rule format per tool, known-tool names), the tool availability filter, the subagent tool resolution and (`tools/inputs`) the `tool_input` tables of hooks.md with their field roles, `parseToolInput`, AskUserQuestion answers and the expanded file paths, and (`tools/semantics`) the pure behaviour of Edit, Bash limits and exit codes, Read windows, WebFetch URLs and windows, WebSearch lists, Grep defaults and the Glob cap, and (`tools/responses`) the `tool_response` of an Agent call and the Bash `bashEditDiff`; `hook-matcher.ts` is the hooks' shared matcher grammar |
| 3     | `settings`    | Settings layers and the policy keys, pure over data: layers, the per-key table, `readSettingsLayer`, the view, the `hooks` merge, `settings/mcp` (MCP server scope ranking, the `~/.claude.json` and `.mcp.json` readers, per-project toggles, `.mcp.json` approvals with workspace trust and the managed-source reader: `scope`, `candidates`, `toggles`, `approvals`, `managed`, `policy`, and the allow and deny lists: `entries`, `url-pattern`, `command-match`, `entry-env`, `origins`, `lists`, `allow-deny`, and the organization's own servers: `managed-file` (managed-mcp.json per platform), `managed-entry` and `managed-servers` (what a `managedMcpServers` entry may contain, what users see), `managed-timing` (when provided servers connect, list diff), `load-settings` and `exclusive` (the load plan under exclusive control); pure over data the host read), `settings/plugins` (the plugin keys: `enabledPlugins`, `pluginConfigs`, `prependPlugins`, `appendPlugins`, `syncClaudeAiPlugins`, `pluginTrustMessage`), `settings/marketplaces` (the marketplace allowlist and blocklist: matcher and gate; `extraKnownMarketplaces`: registry; `disableCommandPluginSources`: command sources), `settings/hooks` (`disableAllHooks`, `allowManagedHooksOnly`, `allowedHttpHookUrls`, `httpHookAllowedEnvVars`: the hook policy), `settings/skills` (`skillOverrides`, `disableBundledSkills`, `disableSkillShellExecution`, `syncClaudeAiSkills`) (done), `settings/workflows` (`disableWorkflows`, `enableWorkflows`, `workflowKeywordTriggerEnabled`, `workflowSizeGuideline`) (done), `settings/channels` (`channelsEnabled`, `allowedChannelPlugins`: the gate, the allowlist and the verdict) (done), `settings/customization` (`strictPluginOnlyCustomization`: surfaces, per-surface origin tables, pre-approval) (done), `plugins/suggestions` (`pluginSuggestionMarketplaces`) (done), `settings/resolve` (`resolvePolicy`: every area over one view, with `PolicyContext`) (done) |
| 3     | `marketplace` | Marketplace and plugin-entry reading (`format/marketplace`), sources, fetch plans, renames, dependencies; contracts, the file and its names, plugin entries and the strict-mode merge, plugin sources, their fetch plans the command and archive engines and the download headers (`header-policy`, `header-helper`, `download-headers`) and marketplace sources (`marketplace-source`, `settings-source-plugins`, `marketplace-fetch-plan`, `marketplace-input`), renames (`format/marketplace/renames`: the chain and its validation; `renames`: resolution and settings migration) `removal` (`removedPlugins`) and dependencies (`dependencies`: items and installed checks; `dependency-tags`: release tags, range combination and resolution by source kind; `cross-marketplace`: the allowlist; `semver`: the only file that imports node-semver); `readMarketplace` wires the entry reader over the plugin source parser by default; install records and what Claude Code says about them (`store-layout`: the plugins root and every path under it; `installed-plugins`, `installed-plugins-store`: `installed_plugins.json` and its recovery through the `PluginStateStore` port; `known-marketplaces`: `known_marketplaces.json`, `installLocation` and source equality; `stage-report`: declared, fetched, loaded and the start-up plan; `enablement-notes`: the `enabledPlugins` questions of loading.md; `install-messages`, `install-errors`, `ignored-marketplace`: the exact troubleshooting texts; `install-scopes`, `install-plans`, `dependency-plans`: scopes, the panel, marketplaces and plugins with dependencies; `reload-summary`: `/reload-plugins`; `orphan-cleanup`: the 14-day sweep; `plugin-version`, `version-hash`, `version-troubleshooting`: the version of an installed plugin and the unknown-version steps; `plugin-names`, `folder-collision`: entry and manifest names, ids that share a folder; `format/marketplace/display-fields`: the display fields users see). Done; the install and cache lifecycle (`install-mode`: in place, copied or linked and the refusals of a printed directory; `copy-plan`: the symlink rule of a copy over `format/link-rule`; `format/path-escape`: the paths that escape a plugin, decided by the loader's `locate`; `install-plan`: the fetch plan, cache folder and record change of an install; `install-failures`, `staged-commit`: the failure messages and the move of a staged directory through the `StagedDirectory` port; `archive-scan`: totals and unsafe entries from `ArchiveReader.scan`; `node-deps`, `node-deps-types`, `node-deps-checks`, `node-deps-lockfile`, `node-deps-spec`, `node-deps-failure`: the Node.js package install of a copied plugin as a pure plan run through `CommandRunner`, the registry-only rule (`node-deps-spec`, also used by the npm source's `package` check in `source-safety`) and the note users see; `uninstall-records`, `lfs-pointer`, `session-plugins`, `session-origins`, `install-commands`, `install-hosts`: what each host's install surface does; exported through `install-index`) |
| 3     | `loading`     | A plugin folder to a typed `Plugin` (done): `discover*` finds components through `PluginFiles` by the `format/layout` registry (combine rules in `combine.ts`, containment and existence in `locate.ts`), `component-readers.ts` is the seam of one reader per kind, `load-plugin.ts` assembles the `Plugin`, `bin.ts` holds the executables decisions; `loading/resolve` holds variable substitution, MCP, LSP, monitor and command-hook resolution (with LSP's runtime decisions and the monitor trigger engine), Markdown content substitution, the shell-field guards and `resolveProcesses` (done); `repository-trust`, `repository-limits`, `repository-messages`, `trust-gates`, `workspace-trust`, `local-settings-trust` decide what a repository plugin may load and what runs before a folder is trusted (its port, `WorkspaceTrust`, is `loading/ports.ts`), `folder-plugin`, `plugin-scaffold` and `plugin-debug` probe a folder, plan `claude plugin init` and list the debug checks |
| 3     | `foundation`  | Shared by mods and the layer-4 streams: time budgets, deep freeze, plain-data limits, JSON sizes (done); result shapes planned |
| 4     | `agents`      | Sub-agent behaviour: the tools a subagent gets (`tool-list`, `tool-filters`, `tool-resolution`); the permission mode it runs in (`permission-mode`, `permission-baseline`, `subagent-permission`); the frontmatter hooks it selects (`hooks`); how it is launched (`launch`, `launch-model`: model, effort, auto-compact window, turn limit, cache TTL, background, CLAUDE.md scopes, worktree, first turn); what it starts with (`context`: preloaded skills, scoped MCP servers, persistent memory); the rest planned |
| 4     | `hooks`       | The hook engine: select, run through ports, merge outputs; `hooks/contracts.ts` holds the shared stage types, `hooks/select` the event catalog, matchers, `if`, dedupe and gates (done), `hooks/input` the input of each event: common fields, facts schemas bound to the official types, conditional fields (done), `hooks/handlers` the command handler (exec and shell form, placeholders, environment, working-directory fallback, `async` and `asyncRewake`), the timeout plan, `statusMessage` and the handler-type registry (done), `hooks/handlers/remote` the `http`, `mcp_tool`, `prompt` and `agent` handlers with the `ok: false` mapping and the 12-at-once limit (done), `hooks/verdict` how a raw run is read: the exit-code table, exit 2 per event, `onFailure`, HTTP response handling, notices (done), `hooks/dispatch.ts` and `hooks/engine.ts` the dispatch over the stages and `createHookEngine` (done), `hooks/output` how the JSON a hook prints is read and merged: schemas bound to the official output types, per-event caps, the terminal-sequence allowlist, the 10,000-character cap with its spill to `ScratchFiles`, the merge rules, permission update entries (done) |
| 4     | `skills`      | `arguments.ts`, `substitute.ts` and `variables.ts` substitute arguments and `${CLAUDE_*}` in a skill's text (done, `${CLAUDE_*}` through `loading/resolve`); `invocation.ts`, `mention.ts`, `listing.ts`, `path-gate.ts` and `execution.ts` decide who may run a skill, what the model and the `/` menu list, when `paths` activate it and how it runs (done); `shell-scan.ts`, `shell-exit.ts`, `shell-run.ts`, `expand.ts`, `expand-policy.ts` and `hook-limits.ts` expand a skill: find and run the `` !`cmd` `` placeholders through the runner port, substitute, and return the text with the grants, execution, model and hooks (done); `command-entries.ts` loads the manifest `commands` object map through the files port (done); `output-style-select.ts` picks the active output style (done) |
| 4     | `mods`        | The mods runtime: `mods/chain` (the middleware engine, done), `mods/events` (the event catalog and result semantics, done), `mods/api` (the `$` of a mod as ports, effects and their limits, done), `mods/ui` (elements, render sites, panes, controls and redraws; its port is `mods/ui/ports.ts`, done), `mods/load` (policy, order, the loader, the static scan, `claude plugin validate`, the host that wires it all; done); its ports live in `mods/ports.ts`, `mods/api/ports.ts` and `mods/ui/ports.ts` |
| 4     | `updates`     | When a marketplace is refreshed and who auto-updates, as pure plans over the ports (imports `ports`, `format`, `settings` and `marketplace` only; every effect through `Environment` and `Clock`): `refresh-before-install` (what an install refreshes, skips or refuses, and what a failed refresh reports), `auto-update-precedence` (which marketplaces auto-update, the environment that turns the pass and the toggle off, the toggle's decision), `auto-update-skips` and `auto-update-pass` (the plugins the pass leaves alone, the first-pass delay on the `Clock`, one pass's plan), `private-marketplace` (the background check of a private marketplace), `command-source-rerun` (which runs of a `command` source happen, the changed-command Errors-tab entry, what follows a changed hash), `update-targets` (`Update plugins now`), `claude-code-version-policy` (`autoUpdatesChannel`, `minimumVersion`, `requiredMinimumVersion`, `requiredMaximumVersion`) (done) |
| 5     | `host`        | `createPluginHost` and sessions (done): `state` reads the enabled plugins' Markdown components once (`catalog`) and the settings; `session-skills`, `session-hooks` and `session-components` each compose one part of a session out of the modules below, and `session` joins them. No behaviour of its own: what a lower module could own lives there (`registerHooks`, `hookSessionGates`) |
| 5     | `cli`         | The plugin and marketplace commands and the session flags as plans over ports (imports lower layers, never `host`; the kit has no CLI of its own, so every command is a pure plan or decision whose observable outcome is proven): `result` (`PluginCommandResult`, the human line, the exit code `0`/`1`/`2`, the last-line JSON object, a usage error and a refusal that print no result line), `scope` (`user`/`project`/`local`, `managed` for `update`, the defaults per command, auto-detect local then project then user, the `is installed at <scope> scope, not <scope>` refusal), `command-table` (a registry over the documented subcommands and aliases; `agents` and `mcp` rows are host-delegated), `marketplace-add`, `marketplace-list`, `marketplace-remove` and `marketplace-update` (the source forms are `marketplace/marketplace-input`, a repeat add installs the dependencies installed plugins lacked through `marketplace/dependency-install-plan`, `update` is `updates/update-targets`' listing-only update), `session-flags` and `flags/*` (one strategy per `claude` flag in `flags/registry.ts`, summed into a `SessionPlan` the modules that own each behaviour consume: settings layers, the tool filter, the channel verdict, MCP sources; `flags/customizations` is the exact set `--bare`, `--safe-mode` and `--disable-slash-commands` skip), `plugin-ref` (a `name` or `name@marketplace` argument matched against ids, a bare name two marketplaces share is ambiguous), `install-start`, `install-plan`, `install-lookup`, `install-config` and `command-acceptance` (`plugin install` in two halves around the host's `--marketplace` add and refresh through `updates/refresh-before-install`: the decision ladder, the dependency closure from `marketplace/dependency-install-plan`, `--config` through `user-config-input`, and the displayed command accepted by `-y` or the sha256 through the `Sha256` port), `update-plan`, `update-locate` and `update-facts` (`plugin update`: scope auto-detect, bare name, update detection from `marketplace/update-detection`, the changed command source, the retry of an unfinished dependency install), `enable-plan`, `disable-plan` and `toggle-target` (which scope `enabledPlugins` is written at, the cascade and refusals from `marketplace/dependency-enable` and `dependency-graph`), `prune-plan` (`marketplace/dependency-prune` with the scope and the answer), `uninstall-plan` and `uninstall-data` (`plugin uninstall` in two halves around the host's removal: what it prints and which options, secrets and data directory go, the folder name from `loading/resolve/data-id`), `configure-plan` and `user-config-input` (`plugin configure` and the typed values of `--config` and `--values-stdin`, checked by `loading/resolve/user-config-values`) |
| 6     | `testing`     | `testing/ports`: one in-memory fake per port, published as `@rsaryev/claude-plugin-kit/testing` (done); `testing/mods`: the mods test kit (`claude plugin test`, `claude-code/testing`) and the fakes a host tests its mods integration with (done) |

Modules of the same layer never import each other (L1): what two of them share lives in a lower
layer. The fakes of the ports are `src/testing/ports`; `tests/support/ports.ts` re-exports them, so
there is one copy.

## Ports

`src/ports/` is one type-only file per port (`index.ts` is the barrel). Conventions every stream
follows:

- A port is minimal; a stream that needs more of one extends it in its own file and never edits a
  shared port without its owner. A port that names only layer-1 and layer-0 types is
  `src/ports/<stream>.ts`; one that names a type of layer 2 or higher lives in its own module,
  because layer 1 cannot import upward. That is rules' `PermissionClassifier` (`PreparedCall`),
  settings' `SettingsSources` (`PolicyScope`), mods' ports (`PluginIssue`) and marketplace's
  `SourceFetcher` and `StagedDirectory` (`FetchPlan`, `PluginIssue`, `CommitFailure`).
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
- The credential classifier (`format/credential-env`: `isCredentialVariable`, the subprocess scrub
  table) and the reader of a helper's output (`format/helper-headers`) are shared by the MCP and
  marketplace `headersHelper`s and the subprocess scrub; `marketplace/credential-variables` only
  re-exports the classifier. `loading` cannot import `settings` (same layer), so
  `HeadersHelperOrigin` repeats the names of `McpScope` that a ranked candidate carries.
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
