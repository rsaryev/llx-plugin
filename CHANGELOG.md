# Changelog

## [Unreleased]

### Added

- `HookEngineOptions.shellPaths`: the engine's bash hooks keep their path variables as environment
  references, as `resolveHookCommand` does.
- `resolveHookCommand` option `shellPaths`: keep a bash hook's path variables as environment
  references, so a folder name with shell metacharacters is never parsed as shell.
- `locationsWithoutPlugin`: the scope a host gives `resolveHookCommand` for a settings hook.
- `prepareSubstituter` and `prepareContentSubstitution`: synchronous substitution for a host
  that reads a body lazily, with the path variables asked for once when it prepares.
- Export `substituteArgumentPieces` from the package root, for a host that renders a skill's
  injected commands itself and still needs the arguments counted over the authored text.
- Reach 100% of the in-scope requirements (2713 of 2713): host switches (`CLAUDE_CODE_*` variables,
  telemetry opt-out), channel contract and permission relay, shell redirection checks, marketplace
  add failures, name conflicts, relevance hints and telemetry names, `plugin list`/`details`/`validate`
  builders, mods keyboard and VS Code rules, managed-settings limits, seed registry and the managed
  approval-dialog list. Judgments are recorded in `spec/judgments.md`.
- Enforce managed hook protection in the chain before user matchers/callbacks, retain original
  metadata across trusted rewrites, and expose the documented per-mod guarded-hook notes.
  Built-in and organization tiers keep access. Add lifecycle and readonly-origin regressions.
- Supply the canonical, fail-closed settings merge by default to the mods settings bridge.
  Add full-artifact agent skill preloads, output-style system-prompt parts, LSP process preflight
  plans and debug-only empty-command-directory diagnostics.
- Audit the owner-approved plugin-host scope separately from native Claude Code UI, services,
  scheduling/model runtime and SDK-client behavior; publish every filtered table row in the
  generated exclusion log and regression-test that new plugin sections stay in scope.
- Plugin release-tag planning and completion reporting, including validation, version agreement,
  force, dry-run, annotated messages, remote selection and local-tag preservation after a failed push.
- Interactive user-config dialog plans, the published default plugin trust warning, and monitor
  release gating and shutdown decisions. Add spec proofs for saved configuration, trust refusals,
  manifest prose and documented validator diagnostics without changing the requirement registry.

- Repository plugins and workspace trust: `decideRepositoryPlugin` (the folder itself must be trusted;
  a parent's trust and `-p` never suffice; `~/.claude/skills/` is exempt; the primary directory, a
  worktree's main checkout and a managed block), `loadRepositoryPlugin` and its component limits (MCP
  servers wait for per-server approval, bundles and files outside the directory are skipped, monitors do
  not load), `contentGate` (the table of what runs before a folder is trusted), `workspaceTrustKey`,
  `workspaceTrustState`, `settingsHooksMayRun`, `localSettingsVerdict`, `projectEntryApplies` and the
  `WorkspaceTrust` port. The folder-is-a-plugin probe (`probeFolder`: `@skills-dir` needs a manifest,
  `--plugin-dir` does not), `planPluginScaffold` (`claude plugin init`) and `pluginDebugSteps`. An inline
  (`settings`) marketplace on `strictKnownMarketplaces` now needs identical `plugins` as well as the name.

- The install and cache lifecycle: `decideInstallMode` (in place, copied or linked, and the printed
  directory refusals), `planTreeCopy` (the symlink rule of a cache copy), `escapedPathIssue`,
  `planInstallStart` and `planInstallFinish` (fetch plan, cache folder, record change, orphaned
  version folders), the troubleshooting messages of a failed install (`install-failures`),
  `commitStagedPlugin`, `selectUninstall` (the Windows spelling rule), `readLfsPointer`, the
  session-only plugins (`readPluginDirectory`, `fetchSessionArchives`, `folderChanges`, `@inline`,
  `@skills-dir`) and the install commands per surface (`planInstallCommand`, `installSummary`).
  Ports: `ArchiveReader.scan` lists a zip's entries (the kit derives the totals and checks the paths
  and links itself, so `ArchiveReader.stats` is gone), `SourceFetcher` may return a staged directory,
  and the new `StagedDirectory` port moves it into the cache. Git fetch plans carry
  `lfs: 'pointer-files'`; an npm `package` refusal and an archive digest mismatch are the
  documented messages.

- Plugin versions and names: `computePluginVersion` (manifest, entry, then the source's commit,
  digest or `unknown`; command sources hashed, the entry's version ignored), `copyModeHash`,
  `linkModeHash`, `subdirectoryPathHash`, `unknownVersionSteps`, `pluginNames`, `lookupPlugin`,
  `folderCollisions` and `listingFields`, with the strict-mode and display-field merge rules proven.

- The Node.js package dependencies of a plugin: `planNodeDepsInstall` (a copied plugin with a
  `package.json` and `bun.lock`, `npm-shrinkwrap.json` or `package-lock.json` gets a frozen,
  script-free install in a separate folder under a 60-second timeout; in-place and link-mode plugins,
  unsupported or unreadable lockfiles, a missing package manager, overrides, patches, non-registry
  dependencies, `http` downloads and a `package.json` that differs from the lockfile skip it),
  `nodeDepsRun`, `readLockfile`, `readPackageJson`, `nodeDepsNote` (the `are not installed` and
  `were not installed, because ...` notes, a warning: the plugin loads), `installOutcome` and the
  registry-only rule (`classifySpecifier`, `dependencyRefusal`, `downloadLinkRefusal`) that the npm
  source's `package` check now shares.

### Fixed

- Integrate all eight second-wave streams without discarding the oracle fixtures or their naming
  and credential rules. Preserve scanned skills, agents and environment files across compatible
  turn views while applying host updates immediately.
- Mods tool orchestration now compares rewritten frames with the model's original input, skips
  prompts after decisive permission results, and never reports a failed tool as successful.

- The spec gate preserves apostrophes and quoted words inside requirement IDs, and checks static template literals too.

- An expanded skill's text opens with `Base directory for this skill: <folder>`, and a sensitive option in skill or command content reads `[sensitive option '<key>' not available in skill content]` whether or not it is saved, as Claude Code sends the model (`bun run oracle:model-content`).
- A remote MCP server's `url` and `headers` read as empty the credential names Claude Code empties (61 names and 5 name families, without regard to case), not only the five the docs give as examples; `bun run oracle:remote-mcp-env` re-observes them.
- A link inside a plugin to another agent, command or skill folder of the same plugin registers it once, as Claude Code does (runtime fixture `symlinked-duplicates`).
- Of a file and a link to it, the agent or command file itself stays whatever their order; a skill folder keeps folder order.

### Added

- `removedFromHeadersHelper(name)`: whether a `headersHelper` from a project `.mcp.json` or a plugin runs without `name` in its environment, as Claude Code observed by `bun run oracle:headers-helper-env`.
- `readsAsEmptyInRemoteMcp(name)`: whether a remote MCP server's `url` or `headers` reads `${name}` as empty, for a host that expands its own MCP configs.
- `bun run oracle:runtime`: what a Claude Code session registers from a plugin (`init` event of
  `claude -p --plugin-dir`, no model call) against the kit's session, for 32 fixtures
  (`tests/fixtures/runtime`); each fixture's `expected.json` is committed, so `bun test` checks it
  without `claude`.
- `bun run corpus:load`: the kit's loading compared with Claude Code's own (`claude plugin
  details` over `--plugin-dir`) on every corpus plugin, per component.
- `bun run mutation <module>`: StrykerJS mutation testing of one module against its own tests,
  with a JSON report in `.cache/mutation/`.
- `bun run bench`: times `loadPlugin` (from disk and from memory), host assembly, the skill
  listing and `PreToolUse` dispatch over the real plugins of the corpus.

### Added (loading parity)

- `classifyPluginFolder`: whether a `--plugin-dir` folder is one plugin or a folder of plugins,
  with the edges Claude Code 2.1.319 applies.

### Fixed

- Session registration, as Claude Code 2.1.319 does (`bun run oracle:runtime`): a plugin skill a scan
  finds is named after its folder, not its frontmatter `name`; two agents with one `name` register
  once; a skill and a command with one name are one menu entry, the command; a plugin whose manifest
  sets `defaultEnabled: false` is off until `enabledPlugins` turns it on.
- Corpus: the loading comparison leaves out what `plugin details` does not list (nested agents
  and commands, single files a manifest path names, inline commands), which a runtime session
  still loads.
- Loading, as Claude Code 2.1.319 does (`bun run corpus:load`, whole-inventory agreement from
  82.7% to 96%): a guard hook that cannot be read, or an unreadable inline `mcpServers` entry of
  the manifest, keeps the plugin from loading; a plugin's hooks do not load an unknown event; a
  skill folder reached twice loads once; a skill folder named by a manifest path or the plugin
  root takes its frontmatter `name`; a `SKILL.md` directly in `skills/` is no skill.

- Node.js package dependencies (review fixes): a lockfile download link that does not use `https`
  (`ftp:`, another scheme, none) is refused, not only `http`; a `bun.lock` id with a link is a
  tarball dependency and so no registry package; a registry package that is not pinned to an exact
  version in the lockfile gets no install (`unpinned-dependency`); the install-folder guard compares
  Windows paths and ignores case; a `package.json` that is not a JSON object is its own reason
  (`package-json-unreadable`). A skip is now a union over its reason with typed fields instead of a
  `detail` list, `skipReasonText` gives its clause, `LOCKFILE_NAMES` and `UNSUPPORTED_LOCKFILES` are
  exported, and `stage.moveBack.replaceExisting` says an existing `node_modules` is replaced. Tests
  assert the documented link-mode and npm-source sentences, every reason's whole clause, and the
  plan-level cases for workspace, linked and git dependencies.

- Install and cache lifecycle (review fixes): an install of a source kind the kit cannot fetch is
  refused with `This plugin uses a source type your Claude Code version does not support...`; a
  link-mode install without the printed directory or its entries, or with an entry name that is
  empty, `.`, `..` or holds a `/`, plans nothing, and a plan reports `copy` and `mustStayAt`; a
  version that cannot name a folder no longer refuses a plugin loaded in place; two spellings of one
  project folder on Windows are one install (`planInstallFinish` takes `platform`); `dirsToOrphan`
  and `orphanSweep` take the store layout and skip folders outside the cache, and `selectUninstall`
  (now taking `plugin` and `layout`) returns the `orphaned` folders and the not-installed issue and
  removes nothing at project or local scope without a folder; `planTreeCopy` skips a link that
  closes a cycle (`copying`), and its too-large message names the limit given; the loader's
  `locate` now decides every declared path through `escapedPathIssue` (moved to `format/path-escape`;
  a backslash on macOS and Linux, a drive path, and links between plugins of one marketplace;
  `loadPlugin` and `discoverComponents` take `platform` and `roots`); `lfsPointerIssues` warns for
  each pointer file of a cloned plugin and CRLF pointers are read; `StagedDirectory.commit` takes
  a `StagedCommit` with the `TreePlan`; the host surfaces gained the desktop app and VS Code, what
  `/plugin` opens, the scope choices, when an install applies and the official marketplace at the
  first interactive start (`planPluginCommand`, `planPluginApply`, `scopeChoices`,
  `marketplacesAddedAtStart`; `INSTALL_HOSTS` is no longer public).

- Plugin versions (review fixes): a stated or computed version that is not one folder name (`../x`,
  `a/b`) no longer reaches the cache path (`isVersionSegment`; it is skipped for the next source of a
  version, else `unknown`); a `git-subdir` input always carries its `subdir`; `inGitMarketplace` is
  now `inGitRepository` (the plugin directory or its marketplace); `unknownVersionSteps` takes
  `{ name, marketplace }` and reruns each scope once; the SP2 gate reads ids that hold quotes, so the
  folder-collision section is proven; links, empty directories, `strict` and same-event hook
  replacement gained tests.
- Install records and plans (review fixes): a `__proto__` key in `installed_plugins.json` or
  `known_marketplaces.json` is kept like any other (it was dropped); the default plugins root honours
  `CLAUDE_CONFIG_DIR`; a session prints `✔ Updated N marketplaces` where a shell prints `Successfully
  updated ...`, and a shell `marketplace remove` needs its name; dependency plans work per scope (a
  dependency installed only at another scope is installed at the target scope, a plugin already
  installed there says `is already installed (scope: ...)`, `defaultEnabled: false` stays off) and
  `planEnable` fails for a dependency the organization's policy blocks or that is `false` above the
  target scope; an install decides `Plugin is now active.` or `Run /reload-plugins to apply.` from
  the prompt-cache and activation facts, and closing the panel queues the reload while a response
  streams; the untrusted-source and refused-name cases of an ignored marketplace come from
  `loadNameIssues` with the entry's source; an empty `known_marketplaces.json` reports the documented
  `JSON Parse error: Unexpected EOF`; the dated copies age out on `cleanupPeriodDays` (`PluginStateStore`
  gains `modifiedAt` and `remove`; the host serialises rewrites of the records); the tests that echoed
  constants now assert the documented decisions (a real SHA-256, failing writes, the `--json` line).
- CLI plugin lifecycle: `plugin install --marketplace` runs the name checks of `marketplace add` on the
  marketplace it just added (an impersonating or reserved name, the `claudeai-` prefix, the
  download-folder rule) and refuses with `invalid_name` (`InstallFound.addedMarketplace.registered`);
  a bundled MCP server whose bundle is referenced by URL is `InstallOptions.unreadServers`: its keys
  are not listed and the not-applied line says to configure it in `/plugin`; the `invalid_config`
  failure lists its keys in `invalidKeys`, not `refused`; `plugin configure --values-stdin --json`
  leaves `unconfigured` out when `ConfigureFacts.readBack` is `false`; `uninstall --keep-data` keeps
  the data folder of a plugin `--prune` removes too; the unused `json` field of `ToggleArguments` and
  `DisableArguments` is gone. The accept-command, configure, `--prune`, scope and enable-dependency
  tests assert the refusal, the shown command, the pruned cleanup and each missing dependency; the
  codes and usage errors the docs do not quote, and the deferral of `install_records_unreadable`, are
  recorded in spec/judgments.md.

- CLI session flags: what an `--add-dir` directory loads is derived from the whole plan, so
  `--safe-mode`, `--disable-slash-commands`, `--setting-sources` without `project` (and `--restricted`)
  remove what they remove from it too, `--bare` keeps only skills, and `CLAUDE.local.md` is its own
  kind that needs `local` (`addDirLoads` takes `skipped` and `settingScopes`); `--agents` validation is
  skipped by `CLAUDE_CODE_SAFE_MODE=1` and, for an inline value, by `--resume` and `--continue`
  (`FlagFacts.resume`, `continuing`); `CLAUDE_CODE_FORWARD_SUBAGENT_TEXT=1` forwards subagent text; a
  `--mcp-config` value holds space-separated files; `--bare` reports `readsStoredCredentials: false`;
  `--agent` overrides the `agent` setting in the plan (`FlagFacts.agentSetting`). A `fields` key named
  `command`, `outcome` or `message` no longer replaces the result's own, and `marketplace add` and
  `remove` match the reserved name the same way. The `--bare`, `--add-dir`, `--agent`,
  `--forward-subagent-text`, owner/repo and Windows path tests assert the plan, the failure codes
  of marketplace update and remove are judgments outside `spec(...)`, and the shared JSON, word and
  record helpers replace three copies.

- Marketplace dependencies: `installClosure` no longer reports a false conflict when an installed
  root's marketplace entry changed a range (the root's installed range is replaced by its new one,
  and so is that of any plugin the walk reads from the catalog); a dependency already installed and
  enabled still has its own missing dependencies planned; an `--plugin-dir` copy meets an entry that
  names a marketplace only from Claude Code 2.1.242 (`InstallRequest.hostVersion`,
  `DeclaredDependency.namesMarketplace`); the allowlist bypass and the met check read the plugin's
  `enabledPlugins` at the install scope, not the winning scope's. The five install operations plan
  identically (recorded in `spec/judgments.md`) and the tests assert that through the facts, the
  bundle test runs under `auto-update` and `reload-plugins`, the force-moved tag, `=2.1.0` and
  no-version tests assert the decision the docs describe, and `Create a release tag` is no longer
  counted as proven until `claude plugin tag` exists. `docs/API.md` has one
  `resolveDependencyVersion` row.
- Marketplace updates: `checkForUpdate` now derives `loaded in place` from `loadsInPlace(source,
  origin)` instead of trusting the host, and its claude.ai subject has no manifest version field;
  `upToDateMessage` gives the `already at the latest version` wording; the SHA-256 of a downloaded
  archive is computed through the `Sha256` port (`archiveFacts`); `sourceFactsOf` and
  `versionCacheSegment` replace per-host switches; the blank-version rule is one helper. The
  version, release-channel, renames and release tests assert what each docs section adds, and the
  host-side messages and negatives are recorded in `spec/judgments.md`.
- Updates: the version policy ignores `autoUpdatesChannel` and `minimumVersion` from a `--add-dir`
  directory (`scopeCarries`); `channelSwitch` takes `from` and asks only for `latest` to `stable`;
  a command source's install or changed-command update is held until the user accepts
  (`runsAfterAnswer`) and an in-place reload carries the reload notice; `backgroundCheckResult`
  maps credentials and the remote to a check result, and a provider token never authenticates;
  `toggleLabel` derives from `AutoUpdateFacts`; `planUpdate` updates only an installed plugin;
  `KnownMarketplace.seeded` is optional. The tests assert each skip for both install commands, the
  fleet-wide `DISABLE_AUTOUPDATER` against command sources, and the disabled-plugin runs, and
  `spec/judgments.md` records the whitespace-tolerant flags and the failing-open start gate.

### Added

- CLI lifecycle commands: `claude plugin install`, `update`, `enable`, `disable`, `prune`,
  `uninstall` and `configure` as plans over ports. `startInstall`/`planInstall` run the install
  ladder (already installed at that scope exits 0 with the exact line, a command-source or
  `headersHelper` entry prints its command and needs `-y` or the `--accept-command` sha256, `Aborted.`
  and `Aborted — the command was not run.`, `-y` ignored inside a session, the `shownCommand` of a
  refused `--json` run, `--config` and `<server>.<key>` validated against `userConfig`, the
  `--marketplace` source added first, the refresh before the install and the dependency closure);
  `decideAcceptance` counts a sha256 only for the exact command, plugin and the catalog the run read
  after its own refresh. `planPluginUpdate` detects the scope (local, project, user, managed), matches
  a bare name and refuses an ambiguous one, reports `already at the latest version` and retries an
  unfinished dependency install in the cached copy. `planEnable`/`planDisable` write the scope the
  first mention or an override names, cascade to dependencies and refuse for dependents, a blocked or
  higher-scope-false dependency or a required synced plugin. `planPruneCommand` covers `--dry-run`,
  the terminal and `-y` matrix. `startUninstall`/`concludeUninstall` add G8: from the last scope the
  plugin's options, secrets and data directory go, except with `--keep-data`, for another plugin on the
  same folder, or when the install records cannot be read back (`savedKept`), with `keptData`,
  `settings_still_on` and `--prune`. `planConfigure` lists options without saved values, saves
  `--values-stdin` whole or not at all, and never prints a sensitive value. 27 requirements are proven
  and the choices the docs leave open are in `spec/judgments.md`.

- CLI: a new `cli` module (layer 5) that models the plugin and marketplace commands as plans over
  ports. `renderCommand` gives the human line, the exit code and the last-line JSON object of a
  command (`command`, `outcome`, `message`, `failureCode`, a usage error that prints no result line);
  `chooseScope` and `writeScope` the scope grammar; `resolveCommand` the command table with its
  aliases; `startMarketplaceAdd`/`concludeMarketplaceAdd`, `planMarketplaceList`,
  `planMarketplaceRemove` and `planMarketplaceUpdate` the four marketplace commands; and
  `planSessionFlags` the 20 session flags of `claude` (`--plugin-dir`, `--plugin-url`, `--bare`,
  `--safe-mode`, `--restricted`, `--setting-sources`, `--settings`, `--disable-slash-commands`,
  `--add-dir`, `--agent`, `--agents`, the subagent-prompt flags, `--channels`, the development
  channels, `--mcp-config`, `--strict-mcp-config`, `--permission-mode`, `--tools`) with the refusals
  that exit `1` without starting. `scripts/check-layers.ts` gives the module its layer.
- Marketplace dependencies: a pure dependency graph over plain facts. `installClosure` plans the
  transitive install of a plugin's dependencies (dependencies first, each step with who asked, every
  range, what the ranges resolve against and the shown `2.1.0-8713c5b11005` version; cycles end, a
  diamond combines its ranges, a conflict or an allowlist refusal installs nothing, a `command`
  source and a `headersHelper` entry are left to the user); `enablePlan` (missing, policy-blocked and
  higher-scope `false` dependencies), `disableDecision` (the dependents to disable first and the
  chained command), `orphanedAutoInstalled`, `planPrune` and `planUninstall` (`--prune`, the range
  released with the last constraining plugin); `checkDeclaredDependency` and `pluginDirFolders` for
  the `--plugin-dir` copy. The dependencies guide is now proven section by section.
- Updates: a new `updates` module with the refresh before an install (`refreshBeforeInstall`: named
  and bare references, the five skips, the managed block that also refuses the install,
  `refreshFailed`), the auto-update precedence (`marketplaceAutoUpdate`, `autoUpdatePassAllowed`,
  `toggleDecision`, the plugins a pass skips, the first-pass delay on the `Clock`), the background
  check of a private marketplace, the re-runs of a `command` source and the Errors-tab entry of a
  changed command (`commandSourceRuns`, `afterCommandRun`), `Update plugins now` (`planUpdate`) and
  the version policy of Claude Code (`readVersionPolicy`, `pickAllowedVersion`, `startGate`,
  `channelSwitch`: `autoUpdatesChannel`, `minimumVersion`, `requiredMinimumVersion`,
  `requiredMaximumVersion`). `scripts/check-layers.ts` gives the module its layer.
- Marketplace: the version of a plugin as Claude Code computes it (`computePluginVersion`: manifest,
  then entry, then the source type's default, a command source from its hash), when a new copy is
  made (`isUpdate`, `checkForUpdate`, `loadsInPlace`: only a differing version, never for a plugin
  loaded in place, the claude.ai-recorded version for a synced plugin) and the check of a
  release-channel pair (`checkReleaseChannels`). The renames migration, `forceRemoveDeletedPlugins`,
  release tags and the `ref`/`sha`/`#ref` hold on a version are now proven against the pages that
  describe them (plugins/host-marketplace.md, plugins/publish.md, plugins/org.md).
- MCP startup and call-timing variables, pure over an environment lookup: `CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT`
  (`McpTimeouts.idleMs`: 5 minutes for network servers, 30 for stdio, `0` off, raised to one second,
  capped at the tool timeout, floored by the per-server `timeout`, none for IDE and SDK servers),
  `mcpConnectionBatches` (`MCP_SERVER_CONNECTION_BATCH_SIZE`, `MCP_REMOTE_SERVER_CONNECTION_BATCH_SIZE`),
  `mcpBackgrounding` (`CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS`, `CLAUDE_CODE_DISABLE_MCP_TASK_BACKGROUND`),
  `mcpStartupWaitsFor` (`MCP_CONNECTION_NONBLOCKING`), `mcpFirstTurnWaitMs`
  (`CLAUDE_CODE_MCP_STARTUP_WAIT_MS`), `mcpDiscoveryCache`, `mcpCacheEntryUse` and
  `mcpCacheDiscardedAfterFailures` (`MCP_DISCOVERY_CACHE` and its `_TTL_S`, `_MAX_STALE_S` and
  `_STRIKES`) and `mcpClientSettings` (`MCP_SDK_GENERATION`, `MCP_PROTOCOL_NEGOTIATION`).

- MCP contracts, pure over data: the `oauth` block, redirect, discovery and scopes; `claude mcp add`
  and `add-json`; tool names, hints, root-combinator rewriting and invalid-schema exclusion; result
  limits, persistence and images; MCP prompts; elicitation (modes, forms, URL cap, hooks); the
  `MCP_TIMEOUT`, `MCP_TOOL_TIMEOUT`, `MCP_CONNECT_TIMEOUT_MS` and description-length knobs; reload
  planning; redaction of a plugin server. An unset `${VAR}` in a plugin server is now the error
  `Invalid MCP server config for "<name>": Missing environment variables: ...` instead of a warning.

- MCP `headersHelper` and the subprocess environment, pure over data. `planHeadersHelper` answers
  where a server's helper runs (plugin root, project directory, primary working directory or the
  configuration directory, by where the server was configured), with which environment (credential
  variables removed for a project `.mcp.json`, a plugin and a project or `--add-dir` agent file;
  `CLAUDE_CODE_MCP_SERVER_NAME`, `_URL` with `REDACTED` for a removed variable's live value, and
  `CLAUDE_PLUGIN_ROOT` for a plugin), under 10 seconds, and whether it runs at all: a project or local
  server in a folder without persisted trust (a parent's and the automatic `-p` or SDK trust do not
  count) connects with its static headers and gets the `headersHelper not run` notice, an agent file's
  server in an untrusted folder is not loaded; `persistedTrust` reads `hasTrustDialogAccepted`.
  `runMcpHeadersHelper`, `connectionHeaders` and `attemptWithHeadersHelper` run it fresh each time,
  let dynamic headers win, stop the OAuth fall back on an `Authorization` header and retry a 401 or 403
  once. `scrubEnvironment` and `subprocessScrubEnabled` apply `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB`'s
  table (credential names and URLs with a password removed, registry URLs lose their userinfo, GitHub
  tokens, proxies and `GIT_CONFIG_*` kept; the pre-2.1.251 behaviour by `version`). One credential
  classifier (`isCredentialVariable`) serves all of them and the marketplace helper. A monitor
  `command` can opt into `monitorPaths: 'environment-reference'`: the three path variables become
  `${NAME}` references and `ResolvedMonitor.environment` supplies the values, so a path holding shell
  metacharacters cannot inject.

- Managed MCP: `readManagedMcpFile` and `loadManagedMcpFile` read `managed-mcp.json` from the path of
  each platform; `readManagedMcpServers` validates `managedMcpServers` entries (remote `https` only, no
  program, no `${VAR}`, plain names and characters) with a notice for each dropped one;
  `mcpLoadPlan` (and `resolvePolicy(...).mcp.loadPlan`) decides what loads under exclusive control: an
  empty map blocks every other server, `claude mcp add` gets the enterprise-policy error, `--mcp-config`
  and `--strict-mcp-config` exit on a workstation (a cloud session keeps the managed servers and warns),
  connectors need `allowAllClaudeAiMcps`, Claude in Chrome needs `allowClaudeInChromeWithManagedMcp` from
  device sources; `providedServersTiming` and `reconcileManagedServers` say when provided servers connect
  and what a running session adds, reconnects or drops. The keys `managedMcpServers`,
  `allowAllClaudeAiMcps`, `allowClaudeInChromeWithManagedMcp` and `disableClaudeAiConnectors` join the
  policy keys, and `resolvePolicy` takes `deviceManaged` layers.

- MCP settings: scope ranking, per-project toggles, project approvals and workspace trust, pure over
  data the host read. `rankMcpServers` loads each server once from the highest of managed, local,
  project, user, plugin and claude.ai connector (names across the three scopes, endpoints for plugins
  and connectors, the whole winning entry, hidden duplicates reported); `claudeJsonServers` and
  `projectFileServers` turn `~/.claude.json` and `.mcp.json` into candidates; `managedServerEntries`
  reads `managedMcpServers` from managed layers only; `readProjectToggles`, `serverEnabled` and
  `applyToggles` apply `disabledMcpServers` and `enabledMcpServers` (one list per kind of server);
  `projectServerApproval` and `canPromptForProjectServers` decide `Pending approval` and `Rejected` for
  `.mcp.json` servers with the untrusted-folder filter. The keys `enableAllProjectMcpServers`,
  `enabledMcpjsonServers` and `disabledMcpjsonServers` join the policy keys, and `resolvePolicy`
  returns an `mcp` area.

- MCP allow and deny lists: `createMcpServerPolicy` (and `resolvePolicy(...).mcp.serverPolicy()`)
  decides whether a server may load from `allowedMcpServers`, `deniedMcpServers` and
  `allowManagedMcpServersOnly`: the denylist of every file first and always, the allowlist of every file
  or only the highest managed one under the lock (a `true` in any admin source locks), `serverUrl`
  patterns with the port rule, exact `serverCommand` arrays, `serverName` only where the list has no
  entry of the server's kind, `${VAR}` expansion of entries (pinned environment) and servers (live
  environment), the servers that skip the allowlist, and the verdict with the messages users see.
  Invalid entries are stripped per the fail-closed rules; the three keys join the policy keys.

### Fixed

- MCP contracts review: `claude mcp add` and `add-json` refuse a name already stored at the scope
  (`McpAddOptions.existing`, `readMcpAdd`'s third argument, `mcpAddKey`) with `MCP server <name> already
  exists in <scope> config`; the session-token-rejected state of a connector is for a `401` only, a
  `403` flags it; the shapes of a tool, a prompt and the elicitation capability are the MCP SDK's
  (`Tool`, `Prompt`, `PromptArgument`, `ClientCapabilities`, re-exported by `protocol/official.ts`) and
  `prepareMcpTool` takes an input schema of any type (`McpListedTool`); result limits read the SDK's
  content parts directly; `as` casts are gone from the add readers and the tests. The tests assert what
  their titles claim: the elicitation form validation moved out of `spec(...)`, titles that claimed
  more than they checked were trimmed, the `/cd` and `https://` echoes were removed with judgments
  recording what is the host's, and the 11,001-character error boundary is covered.

- MCP `headersHelper` review: a project or local server with no helper in an untrusted folder no
  longer gets the `headersHelper not run` notice (an agent file's server stays unloaded);
  `CLAUDE_CODE_MCP_SERVER_URL` redacts only the removed variables the URL expanded
  (`HelperServer.expandedVariables`), so a short unrelated value such as `8` no longer corrupts it;
  `attemptWithHeadersHelper` takes the server name and reports errors.md's `Server rejected the
  Authorization header minted by the configured headersHelper (HTTP <status>)` when a connection is
  rejected after the helper supplied `Authorization`, and `produce` now gives the helper's headers
  alone (`send` merges the static ones); the origin rules carry `providesPluginRoot` instead of a
  comparison with `'plugin'`; the monitor opt-in tests moved out of `spec(...)`, the PowerShell path
  test asserts the native exported path, and the helper tests assert the per-cause messages, the
  re-plan on a re-run and that every settings scope is an origin; the `docs/API.md` snippet narrows
  its union.

- Managed MCP review: the startup exits follow the page's order (`--mcp-config` before
  `--strict-mcp-config`, a judgment when both apply); `/mcp` toggles no longer reach the servers of
  `managed-mcp.json` (the page documents them for provided servers only); an entry that fails several
  checks gets the notice of the first in the page's order; `reconcileManagedServers` and the hooks
  merge share one `canonical` helper (plain key sort, no locale); the plan-level tests now cover the
  allowlist split between file and provided servers, same-name precedence, `desktopManaged`, an empty
  map with connectors or Chrome allowed, and the connectors switch together with `allowAllClaudeAiMcps`.
- MCP allow and deny lists review: `PolicyEnv` is exported once and replaces the three hand-declared
  environment types; `createMcpServerPolicy` documents that it reads the lists at creation and a host
  rebuilds it when settings change before a reconnect. The tests no longer claim the reconnect line, the
  managed-set requirement is proven by its own denylist and `managed-mcp.json` tests, and the judgments
  on layered `env` filling, `headersHelper`, empty `serverUrl` entries, per-source `serverName` rules and
  an empty managed allowlist under the lock now have tests.

- MCP settings review: `managedServerEntries(layers, { desktopManaged })` reads no managed entry in the
  Claude Desktop Code tab on a third-party deployment or in Cowork sessions and warns that the key is
  not read there; the rank of a managed server is proven under "How provided servers load" with a
  negative case; the approval and rejection of parent and `--add-dir` settings, the `listed in`
  commands and the enterprise-blocked status are recorded as judgments; the tests of toggles, user
  scope and plugin or connector duplicates by command now assert what they claim.
- MCP: `displayHeaders(server, scope)` gives the header names `claude mcp get` shows for a server
  the organization provides (managed-mcp.md, "What users can see and change"), and the tests of
  `displayReference`, the credential debug line and the endpoint key now assert what they claim.
- Managed-only and fail-closed key classes (managed-settings.md, "Keys only a managed source can
  set", "Keys that fail closed", "Invalid values inside `sandbox`"). Sixteen more keys have rows
  (`allowedMcpServers`, `allowedProviders`, `availableModelsMatch`, `deniedModels`,
  `forceLoginOrgUUID`, `gatewayInternalNetworks`, `disableSideloadFlags` and the control keys among
  them); a managed-only key in a user, project, local or `--settings` file is dropped with a warning.
  In the policy tier an unreadable value reads as the table's fallback: an empty allowlist for the
  MCP, provider, model, channel, marketplace and hook lists, `exact` for `availableModelsMatch`,
  `refuse` for `crossSessionInbound`, no organization for `forceLoginOrgUUID`, `true` for a lock; a
  `sandbox` block is repaired field by field and `sandbox.credentials` entry by entry; `permissions`
  and `autoMode` withhold their grants while a deny list cannot be read (`gatewaySignInRefused`,
  `PolicyLayer.invalid`). An unrecognized `crossSessionInbound` in a user, project, local or
  `--settings` file holds inbound messages even under a source that says `accept`, with the warning
  of errors.md. New `sideloadVerdict` and `addPluginsRefusal` for `disableSideloadFlags`. A `null`
  removes a general key as it removes a policy key.

### Fixed

- Managed key classes, review of the fail-closed findings. A managed `forceLoginOrgUUID` list with
  one non-text entry is unreadable whole and admits no organization. `gatewayInternalNetworks`
  refuses the ranges claude-apps-gateway.md names (loopback, link-local, CGNAT, the VPN and NAT64
  ranges, the three documentation ranges, `0.0.0.0/8`, `192.88.99.0/24`, multicast). `disableAutoMode`
  and `skipDangerousModePermissionPrompt` fail closed (`"disable"` and `false`), `forceRemoteSettingsRefresh`
  reads as `true` when unreadable, every restrictive lock of `permissions` is repaired in a managed
  source, and `worktree` and `attribution` are repaired per field. `sandbox.credentials` enforces the
  `name` rule and the per-list mask field rules, the warning of a degraded `files` entry notes the
  unenforced read block, and `sandbox.filesystem.disabled` is pinned to managed settings by a
  `deny` entry or a `sandbox.filesystem` block; `allowManagedMcpServersOnly` makes only the managed
  `allowedMcpServers` count. An empty list in a managed `sandbox` block stays. `merged()` carries the
  hold of an unrecognized `crossSessionInbound`. `sideloadRefusal` and `pluginDirsOf` delegate to
  `sideloadVerdict`, so `--agents`, `--mcp-config` and `CLAUDE_CODE_PLUGIN_DIRS` exit at startup as the
  docs say; new `midSessionMcpUpdates` for cloud sessions.

- Managed sources, review of the composition findings. An unreadable source now carries the
  underlying error (`{ unreadable: 'denied' | 'failed', reason }`), and the exit message names the
  failed path or registry value in its `Detail:` line as errors.md shows it. An unlistable
  `managed-settings.d/` reports `Managed settings drop-in directory could not be read: <reason>`, a
  warning when the operating system denied the read and an error otherwise; a failure that exits
  outranks a denial elsewhere in the file source. The helper's `forceRemoteSettingsRefresh` is no
  longer left in the helper layer, and `PolicyHelper` and `ManagedBehavior` take their types from the
  SDK. Tests prove every cross-source key, every key of the merge table rows and the login-key gateway
  rules; the delivery and applicability stubs that echoed constants are now recorded as judgments.
  `docs/API.md` states the order in which a host wires the policy helper.
- Settings merge core, review of the permission, effort, source and file-location findings. The
  local file's allow rules and directories wait for trust only when it is tracked in git or `.claude`
  is a symlink (`permissionRuleLists(view, trusted, local)`); a host's parent `Read(!...)` and
  `Edit(!...)` deny and ask rules are dropped with and without the lock. A managed document that does
  not parse is fatal (`loadSettingsLayers` returns `fatal` and no layer, and `SettingsSources.label`
  names the source in the message). `effortLevel` and `modelSettings` take low, medium, high and xhigh
  only (from the SDK type, no `max`); new `effectiveCap` and `capEffort` apply `maxEffortLevel` with
  its per-model entry. General keys are value-checked (a wrong type, a malformed permission rule,
  the telemetry export variables of a repository's `env`); `--permission-mode`, `--effort` for
  `modelSettings` and the `availableModels` gate on `--model` join the session overrides;
  `managedChangeAdvice` answers "A managed change hasn't reached you". New `permissionRulesOf`
  (host) parses the lists with the source of each file.
- Skills review: a `Skill(name)` allow or ask rule matches the invoked name and the skill's own name (a
  deny rule still sees every name); the file an injected command's oversized output is saved to is cut at
  64 MiB, between two UTF-8 characters, and the note says so; judgments record the host mapping of Claude's
  `args`, the SDK command lists, and how `&` and entities in a description are handled.
- Sub-agent catalog review: a `Task(...)` deny rule works as an alias of `Agent(...)`; `readFlagAgents`
  reports the schema problems of every definition before the `-` names and cuts more than 20 lines to
  `…and N more`; `resolveSubagentModel` takes `builtin: { name, connection }` and runs Explore on the `opus`
  alias for a Fable main model over a subscription, Console or LLM gateway; `AgentOverrides` let a host pass
  its deny rules, `--agents` value and `interactive` per call to `agentCatalog` and `reloadAgents`, and
  `session.selectAgent` picks the session agent; the judgments file keeps all its earlier rows again.

### Added

- Skills: visibility, access, injection, lifecycle. `skills/visibility` holds the four `skillOverrides`
  states as one registry that the listing, the menu and the invocation check read (`overrideMenuLabel` is
  the `/skills` label); `skillNamesOf` gives the names a `Skill(...)` deny rule sees (nested unqualified
  name, synced and plugin forms, aliases); `stackSkills` expands the first skill plus five stacked after it;
  `invokeSkill`, `startTurn` and `reattachAfterCompaction` keep skill content, grants and the compaction
  budget (5,000 tokens each, 25,000 in all); `launchFork` says what a `context: fork` skill starts;
  `frontmatterIssues` gives the upload error for fields outside the Agent Skills spec. Injected commands
  now follow the Bash tool: output past the inline ceiling is saved through `ExpandPorts.scratch` and
  injected as a path and a preview (`bashOutputMaxChars`), a command moved to the background at its
  timeout renders the skill with a note, exit 1 is classified like Claude's own commands, and
  `disableSkillShellExecution` leaves managed skills alone. `Expansion.ignoredGrants` lists the grants
  the managed settings withheld.
- Sub-agents: the catalog. `scanAgents` reads the `.claude/agents/` folders of the managed directory, the
  project and its parents, the added directories and `~` through `FolderScan`, skipping the files Claude
  Code skips; `readFlagAgents` reads the `--agents` JSON; `builtinAgents` lists Explore, Plan, general-purpose
  and the other built-ins with the switches that remove them; `resolveAgents` picks one definition per name
  by the documented priority and applies `Agent(name)` deny rules; `resolveSubagentType`, `spawnableAgents`
  (the `Agent(types)` allowlist), `spawnDepthLimit`/`nestingAt`, `namedSubagent`, `agentMentions`,
  `selectSessionAgent` and `resumeSessionAgent` decide who runs, who may spawn whom and how a subagent is
  named. A session gets `reloadAgents`, `agentCatalog`, `SessionOptions.agents` and `permissionRules`, and
  `session.agents()` now lists every subagent (with `source`; `builtin: false` leaves the built-ins out).
  The working-directory-to-repository-root rule is shared with the skills scan (`foundation/project-directories`).
- Themes: `readTheme` reads a custom theme file (`~/.claude/themes/<slug>.json`, `themes/<slug>.json`
  in a plugin): `name` defaulting to the slug, `base` among the six presets (asserted against the SDK's
  `theme` setting), `overrides` over the documented tokens with `#rrggbb`, `#rgb`, `rgb()`, `ansi256()` and
  `ansi:<name>` colours; unknown tokens and invalid colours are dropped with an issue. `copyOfPluginTheme`
  is the copy an edit of a plugin theme is saved as. `Plugin.themes` now holds the read `Theme` of each
  file and the plugin it comes from (`PluginPath` is gone: `PluginTheme` and `PluginWorkflow` replace it).
- Workflows: `readWorkflowMeta` and `rewriteWorkflowMeta` read and rewrite the literal `meta` block of a
  saved script without running it, `inspectWorkflowScript` reports the `phases` the body does not use,
  `Date.now()`, `Math.random()`, a no-argument `new Date()` and `import()`; `Plugin.workflows` holds the
  read `meta` and runs as `/<plugin>:<meta.name>`. Pure run decisions in `agents/workflow`: the six-attempt
  stall policy and its three errors, the 1,000-agent and 4,096-item caps, concurrency, which agents run
  again on a relaunch, leaving the session and `nothing to resume`, the usage-limit wait, the `args`
  global, and where a script is saved and which `/<name>` runs (`scanSavedWorkflows` over `FolderScan`).
- Skills: the skills and command files outside plugins. `scanFolders`, `scanNested` and
  `resolveFolderSkills` read `.claude/skills/<name>/SKILL.md` and `.claude/commands/**.md` of the managed
  directory, `~`, the project and its parents up to the repository root (a linked worktree stops at its
  top and may borrow the main checkout's), each added directory, the directories below the working
  directory a touched file is in, and the skills synced from claude.ai, through a new `FolderScan` port
  (`ports/folder-scan`, with the `folderScan` fake and the shared `foundation/folder-walk`). Names clash as
  skills.md says: enterprise over personal over project, a skill over a command file, a nested or
  added-directory skill under `<dir>:<name>`, a synced skill's short name yielding to any other command;
  a symlinked skill folder loads once. A skill folder holding a plugin manifest is reported as a
  `<name>@skills-dir` plugin. New `managed` skill origin.
- Host: `HostPorts.folders`, `SessionOptions.addedDirectories`, `session.reloadSkills` (the first read and
  `/reload-skills`) and `session.touchFile`; `strictPluginOnlyCustomization` for skills is applied to the
  folders. A plugin skill is also typed by its frontmatter `name` without the prefix when no command uses
  it. `readSkillMentions` takes the listed `names`, so `/apps/web:deploy` is one word.
- Host: `SessionOptions.takenCommands` (the host's built-in commands, bundled skills and MCP prompts a
  synced skill's short name yields to); `session.addDirectory` (`/add-dir`) and `session.moveTo` (`/cd`),
  which read the folders again on a live session and keep its skill hooks, `once` keys and nested
  directories; `session.skillSources()` with each listed folder skill's scope, origin, names and the names
  it gave up (`yielded`, `heldBy`) and the `shadowed` ones, for the `claude.ai sync` group of `/skills`.
- Spec: the same-name table of skills.md names its rows by phrase (`PageScope.phrases`), which adds six
  requirements (bundled skill, built-in command, added directory, two added directories, plugin skill,
  synced short name).

### Fixed

- Workflows and themes (review findings): `stallWindowMs` takes the host's risen default as `defaultMs`, which
  loses to `stallMs` and to `CLAUDE_ASYNC_AGENT_STALL_TIMEOUT_MS`; a lexical problem in the body of a script
  (an unterminated string, template or comment) no longer discards a valid `meta`, and a rewrite of such a
  script works; a rewrite adds a field with the line ending of a CRLF block; `rewriteWorkflowMeta` lives in
  `workflow-meta-rewrite` and `MetaPatch.phases` takes object entries; `WorkflowMeta` gains `phaseEntries`
  and `whenToUse`; `Theme.extraOverrides` keeps the tokens the reference omits, so a copy of a plugin theme or
  a rewrite loses none; `PluginTheme.qualifiedName` is gone (a theme has no `<plugin>:` name);
  `planReplay`/`replayAgent` compare an options fingerprint too (`AgentCall`, `options-differ`); a
  schema that contradicts itself (`checkAgentSchema`) and the validation attempts (`afterInvalidOutput`,
  `structuredOutputAttempts`); `themeColorToHex`; the order of two same-named workflows in one folder no
  longer depends on the host locale; the literal reader returns a result instead of throwing;
  `relaunchAfter` replaces the constant `continuesOnItsOwn`, and `startsNewAgents` is gone from the usage-limit
  decision. Tests assert behaviour instead of reading constants back; the unrecorded judgments have rows.

- Host: `SkillsReload.plugins` leaves out skills-directory plugins while `strictPluginOnlyCustomization`,
  `strictKnownMarketplaces` or `blockedMarketplaces` stop them; reads of the folders (`reloadSkills`,
  `touchFile`, `addDirectory`, `moveTo`) run one after another, so a touched file's skills are no longer
  overwritten by a reload that was reading at the same time.
- Tests: the troubleshooting tests name the budget, the per-entry cap and the host-supplied plugin root
  they exercise; judgments of the folder scan (dot-folders, `taken`, exact local names, bare plugin names,
  `additionalDirectories`, the main checkout's commands) and every class of refused name have their own
  tests.
- Permissions: the settings keys and the starting mode. `permissions`, `allowManagedPermissionRulesOnly`,
  `autoMode`, `disableAutoMode`, `skipAutoPermissionPrompt`, `skipDangerousModePermissionPrompt` and
  `useAutoModeDuringPlan` are policy keys (per-field repair, fail-closed in the policy tier, the merge and
  scope of each) behind `resolvePolicy(...).permissions`, with `startingMode` (flag, `defaultMode`, built-in
  default, the locks, the background bypass notice), `settingsLocations`, and `startPermissions`, which
  builds the `DecideContext`. `decide` gains `cannotPrompt` (a `-p` run denies what would prompt),
  `connectorToolsSetToAsk`, `preapprovedFetchDomain` and `repositoryDirectories`; `approvalMemory` tabulates
  "don't ask again".

- Hooks: the per-event contracts. Every `<Event> input` section, the decision-control table, the
  response schema of prompt hooks and the context, interaction, elicitation, defer and terminal sections
  of hooks.md are proven by tests against the docs' own examples and scripts. New: `resolveWorktreePath`
  (the path of a `WorktreeCreate` hook: last non-empty line, ANSI stripped, relative resolution, `.`/`..`
  and symlink refusals), `resolveDefer`, `preToolUseHookOutcome`, `DispatchRequest.taskCompletedBy` and
  `effects.stopCondition` for `TaskCompleted`; a `terminalSequence` is dropped outside an interactive
  session and a `PermissionDenied` `retry` when the classifier produced no verdict.
- Hooks: `CLAUDE_ENV_FILE`. The `EnvFileStore` port and `createEnvFiles` give `SessionStart` and `Setup`
  hooks the file that lasts the session and `CwdChanged` and `FileChanged` hooks the file a `CwdChanged`
  event clears, never a hook that runs PowerShell nor another event; `readPowershellVariables` reads the
  plain `export`, `declare -x` and `NAME=value` lines PowerShell commands receive (none, with the
  `Session environment is not all plain assignments` issue, when a line is another kind; on Windows
  without a value that holds `/` or `\`). A host session takes `envFiles` and `processId` and reads
  `session.hookEnvironment`.
- Hooks: the process environment. `CLAUDE_CODE_SESSION_ID` (the input's `session_id`), `CLAUDECODE`,
  `CLAUDE_CODE_CHILD_SESSION` and `CLAUDE_PID` are set; the settings files' `env` is written over the
  inherited environment; `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1` removes credentials by the docs' table
  (`scrubEnvironment`) before the `OTEL_*` removal.
- Hooks: a shell-form hook that PowerShell runs by default whose command is only quoted strings fails with
  `PowerShell started no program` and the fixes instead of printing it.
- Settings: `resolveSettingsEnv` and `applySettingsEnv`, the `env` block (merge per variable, trust, the
  variables project and local files cannot set, the host-owned identity variables).

- Hooks: runtime outcomes of a run. `UserPromptSubmit` block messages end with `Original prompt:` unless
  `suppressOriginalPrompt`; `DispatchRequest.interrupt` (`esc`, `enter`, `ctrl-enter` on `PostToolUse`)
  and `HookOutcome.interrupted` (an interrupted prompt check); the `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`
  cap on consecutive `Stop` and `SubagentStop` holds (`createStopBlockCap`); `refusing to honor the
  suspect capture` for a runner that reports `outputHeldOpen`; `This hook comes from the <plugin>
  plugin.` on a plugin's exit-2 block; `checkPluginDirectories`; `BackgroundDelivery.outcome`.

### Fixed

- Permissions (review of the settings keys and the session): `autoMode.classifyAllShell` now acts, as
  `DecideContext.classifyAllShell` (filled by `startPermissions`) that suspends every Bash and PowerShell
  allow rule in auto mode; an enforced mod can no longer lift a default-mode prompt that a permission
  callback would be asked about; `approvalMemory(tool, { rulesLocked })` and the new `savedApproval` hide
  the always-allow choices under `allowManagedPermissionRulesOnly` and name the file a rule is saved to;
  `startPermissions` takes `interactive` for hosts with their own approval interface and returns `notices`
  (the HIPAA terminal notice, verbatim); judgments recorded for the fail-closed block flags, the
  unmodelled `Artifact` read in bypass mode and the first-time `auto` notice; `mergePermissionBlocks`
  builds its blocks without a type assertion; weak or echoing tests were rewritten and lint warnings in
  the new tests fixed.

- Hooks (review of the per-event contracts): `effects.deferCondition` is removed, `resolveDefer` is the
  one way to know whether a `defer` applies; `effects.stopCondition` of a `TaskCompleted` now comes from
  its own merger and the teammate-stop rule of an `ok: false` hook from `EXIT2_RULES`, not from an event
  name; the tests no longer assert echoes of their own input, claims the host owns (`hook_response`,
  the debug log, the pasted-text expansion) or titles that overstate what they check; added tests for
  `ElicitationResult` `mode` and `elicitation_id`, the value sets of `PreModelSwitch` and
  `PostModelSwitch`, `UserPromptExpansion.command_source`, the `PreToolUse` exit-2 path through
  `decide`, and the `WorktreeCreate` path reading; the judgments for these are in `spec/judgments.md`.
- Hooks (review of the runtime outcomes): the `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` count resets when
  Claude calls a tool (`PreToolUse`, `PostToolUse`, `PostToolUseFailure`, with or without a hook) and
  when a Stop holds nothing, no longer on `stop_hook_active`; `StopBlockCap.reset` and
  `HookEngineOptions.stopCap` let a host that rebuilds its engine keep the counter; `Ctrl+Enter`'s
  10-second cap kills command hooks only; `HookObserver.finished` carries `exitCode`; `HeldOpenResult`
  types a runner's `outputHeldOpen`; `checkPluginDirectories` is on by default; the plugin sentence is
  left off a block whose stderr is not the message, and a plugin is named by its manifest name, else
  its id, everywhere.
- Hooks: `onFailure: "block"` blocked on a failure of a hook with only `asyncRewake` set, which is a
  background hook like one with `async`.
- Hooks and settings (review of the exec stream): the scrub keeps `http_proxy` and `https_proxy` in lower
  case as it keeps `HTTP_PROXY` and `HTTPS_PROXY`; `subprocessEnvironment` and
  `session.subprocessEnvironment(kind)` build the environment of a hook, Bash, PowerShell, stdio MCP or
  Monitor process, and `scrubEnvironment` and `scrubRequested` are exported as `docs/API.md` says; on a
  Windows host the settings `env` reads off values and the launch environment without regard to case;
  the judgments of the scrub, the managed layer order, the `CLAUDE_ENV_FILE` of exec-form hooks and the
  PowerShell reader are recorded and tested outside `spec(...)`.

- Host: an update path. `host.update({ plugins?, settings?, parentSettings?, userConfig? })` replaces
  those parts, re-runs the pure `createHostState` over the merged options (`mergeHostOptions`) and
  returns the new `{ plugins, issues }`; `host.plugins` and `host.issues` are live getters and
  `host.generation` counts the updates. Sessions and their `withTurn` and `runScoped` views read a
  `HostStateCell` at each use instead of a state captured at open: the plugin and settings hooks are
  rebuilt, the skill, agent and session hooks stay unless their plugin no longer runs or the new
  plugin-only lock silences them (`pluginOnlyAllows`, exported by the hooks module), the gates, skill
  list, policies and catalogs are read per call, the skill-hook limit ledger is summed again from the
  survivors, consumed `once` keys stay consumed and the dynamic watch list is kept. `readCatalog`
  caches by `Plugin` identity, so an unchanged plugin is not read again.
- Host: model limits and message expansion. `SessionOptions.limits` and `TurnOptions.limits`
  (`SessionLimits`: model allowlist, `maxEffort`, `supportedEfforts`) reach `session.expandSkill`,
  so `Expansion.turn` carries the allowlisted model and the capped effort. `session.expandMessage`
  reads the mentions of a typed message (`stackableOf` over the catalog, the turn's interactivity)
  and expands the direct and stacked skills in order with the shared arguments; named mentions come
  back as `permitted`, and `expandSkill` takes `permittedByMention` for the model's call.
- Host: scoped hooks, `hasHooks`, the watch list and background deliveries. `session.addHooks(prefix,
  hooks, source, options?)` and `removeHooks(prefix)` register hooks of a run, an agent or a skill
  (replacing by prefix, never stacking; the handle's `remove()`); `lifetime: 'turn'` ends when
  `session.runScoped(turn, run)` settles. `session.hasHooks(event)` is true when a handler that
  passes the gates would run. `session.fileChangedWatchList()` joins the matchers' literal names with
  the `watchPaths` of SessionStart, CwdChanged and FileChanged outputs (replaced by each, `[]` clears
  it). `session.takeBackground()` and the pure `settleDeliveries` turn `HookOutcome.background` into
  `{ additionalContext, systemMessages, wake? }`, a wake surfaced apart for `asyncRewake` exit 2.
  `mergeWatchPaths` and `hasRunnableHandler` belong to the hooks module.

### Fixed

- Host: review fixes of the update path. `host.update` builds the next state before it replaces the
  merged options, so a state that throws leaves the host as it was; `mergeHostOptions` merges each
  part by key and keeps its types; `HostedPlugin` moves to `src/host/types.ts`. Tests now cover
  `parentSettings`, `userConfig` replacing every plugin's saved values and an update that lands during
  an in-flight `dispatch`.
- Host: review fixes of model limits. A stray `sed -i` backup of the skill-limits test is removed, the
  T2 layout check now fails on any file under `tests/` that is not a `.ts` file, and the skill hook
  registration closure declares its return type instead of casting `[]`.
- Host: review fixes of scoped hooks. `session.onBackground(listener)` tells an idle host of each
  background delivery, an `asyncRewake` exit 2 wake included, without polling. A view kept past
  `runScoped` now refuses `lifetime: 'turn'` registrations instead of leaking them for the session.
  The judgments say the host drains the background queue and owns the async `SessionStart` repeat
  check; tests cover the stdout wake fallback and a typed hooks literal replaces `JSON.parse`.
- Host: review fixes of `withTurn`. The session core no longer carries an unused watch-list slot
  (it returns with `fileChangedWatchList` support, with a test). Tests now prove that a turn cannot
  change `trusted` (settings hooks stay held back or released as the session says), that a turn's
  `scratchpadDir` replaces the session's in the hook input, and that a turn's `interactive` decides
  whether a forked skill waits; the step on a turn's `additionalDirectories` is dropped because an
  `if` path rule never reads them.
- Mods, the events prose, the reference fields and the settings hook. `toolReadOnlyReport` gives
  `e.isReadOnly` of `tool.check` (`true` or absent, never `false`); `inputChangedDenial` denies a call
  whose input a hook changed after auto mode's review (`a hook changed this call's input after the model
  wrote it`); `withheldResultText` and `promptDroppedText` word what Claude and the user read of a
  withheld result and a dropped prompt; `settingsLayersForMods` builds `e.layers` (`plugin`, `user`,
  `project`, `local`, `flag`, `policy`, lowest first) and `readEngineSettings` forwards the chain's debug
  lines (`answered settings.read without next()`); a `settings.read` hook must answer `{ value }` or
  `{ deny }`; `ModsHost.runCommand` answers a registered command no `command.run` hook answered
  (`<mod> registered /tally but no command.run hook answered it`); a call a stopped session refuses
  raises the toast `Stopped: type a message to continue; a mod cannot resume work after Stop`; the
  built-in guard names a mod that tried to lift a deny rule once, in the debug log and the transcript;
  `turn.step` carries `turnId`; the test kit fires `settings.read` with empty `layers`. 48 requirements
  of events.md, reference.md and troubleshoot.md are proven, each with the docs' own example.

### Fixed

- Mods, review of `describeApi`, state reset and the mods API guide tests. `RunGate.userInput()` and
  `StateStore.reset()` deliver to every held notice and every write listener even when one throws,
  then report the failure (the error as thrown, several as an `AggregateError`); `runEach` in the
  foundation does it. `docs/API.md` says a `value` member of `describeApi` carries no value (the host
  copies it from the live `$`) and no arity. The test kit types `$.ui.mount` (`TestDollar`) and exports
  `MountHandle` and `MountSpec`. Tests: every one of the 79 calls of the table gets `next(e)`,
  `{ value }` and `{ deny }` from sample arguments (a call without a sample fails), a hook of a mod
  that runs after the caller never sees its call, `$.prompt.submit` without `asUser` reaches the port
  without it, `$.model.complete` asks no question and uses the Claude API's usage fields, the Add one
  button of hello-tabs runs through the pane, `types` left out or pointing at a missing file, and a
  write inside `ui.render` and the unchecked type of a declared value are recorded as judgments.

- Mods, review of crash behaviour and refused calls. `ModSession.send` receives the reason the
  session refuses new work (`send(to, text, signal, refusal?)`) and `unsentReason.subagent` /
  `unsentReason.teammate` word the `{ isDelivered: false, reason }` of the page's table. `ModTools.call`
  receives `held()` and `HELD_AT_TIMEOUT` words the line of a foreground Bash or PowerShell command
  ended at its timeout while input is held. `ModsHost.input.setLimits(limits)` changes
  `--max-turns` and `--max-budget-usd` for the next run of a long-lived host. Changes to the mod set
  (`load`, `reload`, a stop of the worker...) run one at a time, so a stop during `reload()` or two
  stops in a row no longer rewrite the loaded mods together; a mod that is unloaded or unloaded for
  a crash is forgotten by the replay ledger; a fresh copy the loader has no record of says so instead
  of vanishing. Judgments record the latest-release-only model of the version-gated behaviour, the
  host's part of "Work your mod started before the interruption" and the order of a replayed call
  among the mods before it. Tests: a spawned subagent's turns reach the `--max-turns` count, a stop
  traced to a built-in mod is untraced, and casts and a stray comment left the test support.

- Mods, review of per-mod load and where mods run. A refusal by another mod reaches the transcript of
  an interactive session that loads a plugin directory or hot-reloads (it was the debug log in every
  session). `ModsHostOptions.hotReload` is a getter, so the answer to the hot-reloading question moves
  later lines to the transcript at once. `modsVersionProblem` words an unreadable version as `this is
  an unreadable version (latest)`. Tests: the page's own `register.js` runs and its redraw is seen,
  edits take effect only in a watched directory, the whole change-notice lines, the hot-reloading
  answers and their state, the refused mod stays off the `mods active` line, and the WSL and
  feature-flag defaults.

### Added

- Mods, `describeApi` and the guide of the mods API (reference.md, overview.md, interface.md, api.md).
  `describeApi(api)` describes a mod's `$` as plain data (namespace, member, kind, whether it answers
  later, the event a call fires) so a host that runs mods in another realm can rebuild it.
  `ModsHost.resetState()` resets every `$.state` value for `/clear`, `/resume` and `/branch` and redraws
  what read them; `ModsHost.input.notice(kind, deliver)` holds a subagent's finish notice and the notice
  that a monitor ended until the user's next input and drops a monitor's events while the session is
  stopped. A `$.store.set` or `delete` no longer loses a write of another session that was in flight: the
  changes of one plugin's store go one at a time. Tests prove the "Mods API calls" rule on the
  reference's own examples, the six things a mod can reach, the `$.state` declaration, manifest `types`
  field, atom rules, the load again after `/clear` of test.md, and the store sharing of interface.md.

- Mods, crash behaviour and refused calls (troubleshoot.md, api.md). `ModRuntime.onCrash` lets a
  runtime that shares one worker tell the host the worker stopped: the mod it traced the stop to is
  unloaded (`<mod> was unloaded: it crashed the hooks worker`), the others get a fresh copy of their
  module, and the third stop that cannot be traced unloads every mod that is not built in
  (`hooks: mods that run in the hooks worker are off for this session: it crashed 3 times`;
  `reload()` turns them back on). The `$.prompt.submit`, `$.command.run` and `$.agent.spawn` calls a
  fresh copy's `session.start` repeats resolve with the first copy's result and are not made again,
  with the line `its session.start ran again in a fresh copy`. A registration from a module that is
  no longer loaded rejects (`$.agent.register refused: the hooks module that made the call is no
  longer loaded`). `createRunGate` and `ModsHost.input` model the session's input (`interrupt`,
  `userInput`, `endInput`, `--max-turns`, `--max-budget-usd`): refused calls return what the page's
  table says, and a prompt or command still queued when the user stops the turn is dropped.
  `ModsHostOptions.onNotice` receives the lines that come outside a call to the host.

- Mods, per-mod load and unload, and where mods run. `createModsHost` keys a mod by its name: `load`
  of a plugin already loaded replaces it and no longer adds a second copy. New `loadMod(plugin)` loads
  one plugin among the loaded ones (tier from policy, last in its tier, a note when the policy would
  have put it earlier, the built-in guard first when policy needs it) and `unloadMod(name)` turns one
  off (idempotent, drops the mod from the approval ledger and the refusal book, and `reload` does not
  bring it back). `ModLoadReport.notices` carries the lines a person reads with where each is read
  (`modLineChannel`: transcript, stderr of `claude -p --plugin-dir`, debug log; a refusal by another
  mod in the debug log of a `claude -p` run and in the transcript of an interactive session that
  loads a plugin directory or hot-reloads; `hotReload` is a getter, read on every line). `whereModsRun` gives overview.md's table (hooks and drawing per place,
  the VS Code versions) and `decideModLoad` refuses an installed plugin in a WSL session of the Desktop
  app and, in the cloud, one that does not reach the session; `modsVersionProblem` names the first
  versions that load mods. `writtenModRefusal` says why a mod Claude wrote cannot load,
  `createHotReloadGate` is the hot-reloading question (off after three unanswered), and `changeNotice`
  words the transcript line of a change that did not load. Tests for the 29 requirements of the
  overview, create and troubleshoot pages on loading, enabling, refusals and where mods run.

### Fixed

- Mods, review fixes of the load seams. `createModsHost(...).fire` and `fireStream` take `before` (where
  managed `PreToolUse` hooks run, ahead of the first mod), which only the raw chain could set. A
  stack overflow is a `RangeError` or a message in an engine's words (`maximum call stack size
  exceeded`, `too much recursion`, `stack overflow`, `not enough stack space`), no longer any error
  that mentions a stack. `claude plugin validate` reports the scan problem of a compiler output, not an
  unrelated compiler issue. Tests: the order of managed, other settings and plugin `PreToolUse` hooks
  is driven through the host with the hook engine; `prependPlugins`, the built-in guard's run order,
  the filter with every field matching, deep freezing of events, the `my-mod:` log line through the
  real `$.ui.log`, the six `$` and import rules (each with its own reason, in
  `check-reads-wording.test.ts` where the page gives no wording), a blank `Client` error and the drawn
  failure node are now asserted; the linking reason, a session with no `modules` key and the compiler
  outputs of `validate` moved out of `spec(...)` as judgments, with new rows in `spec/judgments.md`.
- Spec: the committed snapshot of the mods reference tables (`spec/docs-tables.json`) keeps only a
  short label and the amounts of each row of the Limits table, not the page's sentences, so the
  repository holds facts and identifiers only.
- Format: Claude Code's own leniency about frontmatter and hooks, found by running `claude plugin
  validate` on real plugins. A block plain YAML refuses is retried with the value of each top-level
  line quoted when it holds a character plain YAML cannot (`description: Does X: then Y`,
  `argument-hint: [a] [b]`, `tools: *`), a duplicate key loads with the later value, and plugin
  hooks drop an entry they cannot read with a warning (an error under `PreToolUse` and
  `PermissionRequest`, where a missing guard fails the file) instead of failing the whole file;
  `settings.json` hooks keep failing whole, as settings.md says.
- Marketplace: the entries are read and reported beside an unsound top level; the "no description"
  and "no plugins" warnings and the entry version cross-check are made only when the schema passes
  (a reserved name does not stop the cross-check); unknown-field hints skip the keys the validator
  only lets through and never suggest a key more than half the misspelling's length away.
- Validator wording: the messages of a reserved or non-kebab plugin name, a name Claude Desktop
  rejects, a missing required field and a version mismatch are the official CLI's, not shortened
  ones; the docs-quoted part of each is still asserted under `spec()`.
- Agents: one subagent tool resolution. `resolveCatalogSubagentTools` is gone; `resolveSubagentTools`
  keeps what it did that the other did not (`ExitWorktree` withheld from a subagent in its own working
  directory, the `Glob` and `Grep` a `tools` list names without `Bash`), and the `tools.tool.*` tests
  that proved the tools table through it now run on `resolveSubagentTools`.
- Commands: review fixes. The judgments the kit makes about commands (blank entry fields, a source
  that is never read, `${CLAUDE_PLUGIN_ROOT}` in an entry's `allowedTools`, `name` and `paths`
  dropped silently, trimming, only a `.md` extension stripped from a file name, no extension rule
  for a `source`) are recorded in spec/judgments.md and tested outside `spec()`, so they no longer
  count toward the compatibility percentage; the "exactly one of `source` or `content`" message is
  shared between the manifest schema and `readCommandEntry`.
- Skills: review fixes for invocation, listing and execution. A skill named after plain text now
  permits the model's run of a `disable-model-invocation` skill (`permittedByMention`);
  `readSkillMentions` stacks up to six skills at the start of a message with the shared trailing
  arguments (`stacked`, the host's `stackable` stop rule, `interactive: false` for `-p`); the
  listing budget falls back to 8,000 characters instead of no limit, and a path-scoped skill is
  listed by name until its paths activate it; `paths` brace expansion shares the documented budget of
  1,000 patterns and 4 MiB (a pattern over it is used unexpanded) and an uncompilable pattern matches
  nothing instead of throwing; `TurnSession.supportedEfforts` clamps the effort to the highest
  supported level at or below; a scheduled fire and a preload get their own refusal text.
- Skills: a refused name or folder is reported once by field (`folder name has ...`, not `folder
  folder name has ...`); outside a plugin a name or folder `anthropic-skills` or
  `anthropic-skills:<name>`, and a user or project folder `synced` (any case), refuse the skill.
- Skills: `substituteArguments` no longer expands a `$` inside a declared argument name a second
  time (`$a$b $b` with `a$b` and `b` declared gave `xy y`, now `x y`). `substituteAllowedTools`
  substitutes the Bash rules of `allowed-tools` (the docs' "same variable in both places"), where
  `substituteVariables` was only documented to; the judgments record the escaped-placeholder
  append, three backslashes, `$ARGUMENTS[x]` and `${user_config.*}` in typed arguments.
- Skills: review fixes for `expandSkill`. A skill that declares hooks under the hooks lock keeps
  its `allowed-tools` pre-approval when it runs through `context: fork`; the plugin sources the
  managed settings treat like folders are modelled (`ExpandSession.pluginSource`:
  `skills-directory` loses hooks under the lock and its grant under `allowManagedPermissionRulesOnly`,
  `inline-managed-session` loses its grant); an injected command's timeout is
  `BASH_DEFAULT_TIMEOUT_MS` (default 2 minutes) and the timeout message names it; the permission
  check receives the same CRLF-normalised command the shell runs. The judgments record who owns
  `EndConversation` in `disallowed`, output past the inline ceiling, and the bundled and managed
  skills `disableSkillShellExecution` leaves alone.

### Added

- Spec: every page of the docs is classified (SP7). The 24 pages that document hooks, memory,
  worktrees, status lines, headless runs, model settings, server-managed settings, agent teams,
  goals, scheduling, auto mode, tools, the error catalogue and the Agent SDK's plugin, hook, skill,
  subagent, permission and MCP behaviour are audited section by section, and the other 156 are
  listed in `spec/out-of-scope-pages.json` with a reason docs/SPEC.md explains. A page that
  appears in a new release fails `check:spec` until it is classified.
- Install records: the state Claude Code keeps under the plugins root, and the texts it prints about it
  (plugins/loading.md, plugins/troubleshooting.md, plugins/install.md, plugins/cli-reference.md).
  `createStoreLayout` and `resolvePluginsRoot` name every path (`cache/<marketplace>/<plugin>/<version>`,
  `data/<id>`, `marketplaces/<name>`, `synced/`, `.trash/`, the JSON records, the dated copies);
  `parseInstalledPlugins` reads `installed_plugins.json` and decides what is rebuilt, set aside or
  left unwritten, `loadInstalledPlugins` carries it out through the new `PluginStateStore` port;
  `parseKnownMarketplaces` reads `known_marketplaces.json` (a source is `kind: 'directory'` or
  `'file'`, never `local`) with `installLocationFor` and `sameMarketplaceSource`; `stageReport` says
  how far a plugin got (declared, fetched, loaded) and `planMarketplaceStartup` what happens to
  marketplaces missing on disk at the start; `decideEnabledFetch` and `overriddenUserDisable` answer
  "enabled in project settings but not installed" and "disabled but still loads"; the exact
  troubleshooting texts (`pluginNotFound`, `notCached`, `ignoredLine`, `failedToInstall`,
  `refuseForUnreadableRecords`, ...); plans for the panel, marketplaces, plugins with dependencies
  (`planInstall`, `planEnable`, `planDisable`, `planUninstall`, `planPrune`), scopes (`scopeReach`,
  `defaultScope`), `/reload-plugins` (`reloadSummary`, `reloadGate`) and the 14-day orphan sweep
  (`orphanSweep`). Pure decisions; effects only through ports.
- MCP: `${VAR}` for servers of the settings scopes, not only plugins' (`expandMcpServer`,
  `expandEnvText`): `command`, `args` and `env` of a stdio server, `url` and `headers` of a remote
  one, over a lookup function and no plugin. An empty string counts as set, an unset variable
  without a default keeps its text with a missing-variable warning, a `url` that does not parse
  after expansion drops the server, and the covered credential variables read as empty toward a
  remote server with a debug line naming the ones the user set (`credential-env`, one list for
  plugin and non-plugin servers). `displayReference` gives what `/mcp` and `claude mcp list` show
  (the `${VAR}` by name; a managed server's host only) and `mcpEndpointKey` the endpoint two
  servers are duplicates by (URL spellings that differ only in scheme or host case, default port or
  a trailing slash are one; a command is its arguments too).
- Settings: the managed sources (`src/settings/managed`). `composeManaged(documents, { parentRestrictive })`
  chooses among remote settings, the MDM policy (plist or HKLM), the managed files and the HKCU
  registry as managed-settings.md ranks them: by default the highest source that delivers a policy
  key, with `managedSourcesBehavior: "merge"` every admin source combined by kind of key (lists union,
  locks take the strictest value, restriction allowlists and values taken whole from the highest
  source, provided MCP servers by name, `env` per variable, login keys from the machine policy), and
  the keys read from every admin source under both. `readAdminDocument` decides when a document is
  present, empty, broken (fatal) or unreadable; `readFileDocument` merges `managed-settings.json` with
  `managed-settings.d/` in alphabetical order; `wslChain` orders the Windows and `/etc/claude-code`
  documents under `wslInheritsWindowsSettings`; `parentSettingsOf` applies `parentSettingsBehavior` and
  the managed values that block a host's parent settings. `readPolicyHelper`, `readHelperOutput` and
  `runPolicyHelper` (through the `CommandRunner` port and the new `HelperFileProbe` of this module)
  judge a `policyHelper` and its failures; `withHelperSettings` makes its output the only managed
  settings. The delivery catalog (`managedFilePaths`, `MECHANISM_TRAITS`, registry and plist names,
  symlink verdict, `cacheAfterFetch`), `sourcesLoadedBy`, `reachOfPlace`, `serverChangeTiming`,
  `startupFetchOf` and `fetchesRemoteSettings` answer where and when a policy applies.
  `SettingsSources.managed` lets a host hand over every source so `loadSettingsLayers` composes the
  tier, `resolvePolicy({ managed })` takes `hasManagedSettings` and `parentMerge` from it, and
  `autoCompactWindow` joins the per-session overrides (`--autocompact`, `CLAUDE_CODE_AUTO_COMPACT_WINDOW`).
- Settings: the merge core. `createGeneralView(layers)` extends the policy view with `merged()`, the
  whole of settings.md's precedence as one object: a block merges key by key, a list combines with the
  duplicates removed (the highest file's entries first), any other value comes from the highest file,
  and `fallbackModel`, `modelPicker` (user, managed and `--settings` only) and `availableModels` (a
  managed list as-is) keep their own rules. The 12 keys whose managed value is not an override are rows
  with a `ManagedException` (`disableClaudeAiConnectors`, `enableArtifact` and `disableArtifact`,
  `isolatePeerMachines`, the two `block...Outside...` keys, `autoMode.classifyAllShell`,
  `remoteControlAtStartup`, `crossSessionInbound`, `useAutoModeDuringPlan`, the two claude.ai sync keys
  and `maxEffortLevel`); `get` applies one rule for all of them. `permissions.defaultMode` ignores
  `auto` and `bypassPermissions` from project and local settings. `permissionRuleLists(view, trusted)`
  adds up allow, ask and deny across scopes (a deny at any scope blocks, `allowManagedPermissionRulesOnly`
  leaves managed rules only, a repository's allow rules and `additionalDirectories` wait for trust),
  `effortLevelFor` resolves `modelSettings` one model at a time, `resolveSessionValue` orders a key's
  flag, paired variable and settings value, `editEffect` and `loadsFileCreatedMidSession` say when an
  edit reaches a running session, `reachOf`, `FILE_ORIGINS`, `WRITE_TARGET`, `userSettingsFile`,
  `localSettingsFiles` and `globalGitExcludesFile` hold the scope and file-location facts of
  settings.md, and `readClaudeJson` decides what a broken `~/.claude.json` costs. A global config key
  is dropped from every settings file with a warning, and a source that does not parse is a Settings
  Error (`problemKind`) naming the file.
- Settings (changed): `unionArrays` drops duplicate entries, as managed-settings.md says of combined
  lists; a user, project, local or `--settings` source that is not a JSON object is an error issue
  ("Settings Error: ...") rather than a warning, and still skipped.

- Host: `session.withTurn(turn)` returns the same session for one turn. A turn replaces only the
  `permissionMode`, `effort`, `cwd`, `additionalDirectories`, `permissions` (the shell answer),
  `promptId`, `scratchpadDir`, `agent`, `folderTrustAccepted` and `interactive` it names, and shares
  what must outlive a turn: the skills' registered hooks, the `once` keys already consumed and the
  limits on skill hooks. The session it is called on does not change.
- Host: `SessionOptions` carries `promptId`, `scratchpadDir`, `agent` (`id`, `type`) and
  `folderTrustAccepted` into the hook input (`prompt_id`, `scratchpad_dir`, `agent_id`,
  `agent_type`) and the workspace-trust gate of a project subagent's hooks.
- Spec: the requirement set now counts the docs' prose, not only their tables. Every heading of
  the plugin, mods, skills, subagents, hooks, MCP, managed MCP, settings, managed settings,
  permissions, environment, CLI, workflows, themes, output styles and channels pages is either
  read as requirements (one per section, one per listed rule) or listed in
  `spec/out-of-scope.json` with a reason (docs/SPEC.md, "Sections and scope"). New categories:
  `install`, `updates`, `trust`, `policy`, `settings-merge`, `mcp-settings`, `themes`,
  `workflows`, `cli`. The compatibility percentage drops accordingly: the new requirements are
  unproven until a test names them.
- Validating: `validatePlugin({ files, label?, signal? })` reproduces `claude plugin validate <dir>`
  of the tracked Claude Code release over a `PluginFiles` folder: it picks the marketplace, the
  plugin or a bare components folder as the CLI does and returns `{ target, issues }` with each
  issue's `severity`, `file`, `path` and the CLI's own `message`. It checks the manifest (schema,
  advice, unknown fields, declared paths, inline hooks and MCP servers, the map form of `commands`),
  `hooks/hooks.json`, `.mcp.json`, the frontmatter of skills, agents and commands, `CLAUDE.md`, and,
  for a marketplace, every entry and the manifest of each entry inside it; it never follows a
  symlink and says so as the CLI does. Exports `ValidationIssue`, `ValidationReport`,
  `ValidationTarget`, `VALIDATION_TARGETS`.
- Evidence: the oracle (the official CLI of the same release, run as a black box) is a recognised
  source in docs/SPEC.md and AGENTS.md (E5a) for message wording and validator-only checks; every
  behaviour taken from it is a row `oracle 2.1.319` in spec/judgments.md with an input of its own.
- Corpus: `bun run corpus` compares the oracle with `validatePlugin` (verdict agreement, findings
  with the same severity and message, findings at the same file and path, what the kit misses or
  adds) and prints `loadPlugin`'s verdict on a separate line.
- Host: `expandSkill` registers a skill's frontmatter hooks into the session (they keep running for
  the rest of it, `once` removes one after its first successful run, a skill past 1,024 hooks or
  16,384 matcher characters for its source "registers none of its hooks"); a manifest command's
  invalid `allowedTools` rule is reported as `loadCommandEntries` reports it; `allowManagedPermissionRulesOnly`
  in a managed layer takes away the `allowed-tools` grant of project, personal, synced and
  skills-directory skills.
- Manifest rules the docs state and the kit did not apply: a `userConfig` option's `options` must sit
  on a `string` field that is not `multiple` or `sensitive`, with a `default` from the list or
  `required: true` (else the plugin fails to load); `types` is a `./` path to a `.d.ts` file inside the
  plugin; a `channels` entry bound to a server that is not among the plugin's `mcpServers` is an
  error issue. `resolveChannel` gives a channel its `displayName` (default: the server name) and
  substitutes its `userConfig` into that server's `env`; `validateUserConfigValues` tells whether a
  saved value meets `type`, `required`, `multiple`, `options`, `min` and `max`. The mods reference
  tables the tests compare the kit with are a committed snapshot (`spec/docs-tables.json`), and
  `check:spec` (SP5) compares it and the tools table with the pulled docs.
- The corpus: `corpus:fetch` fetches every plugin of the official and community marketplaces
  through the kit's own marketplace reader and fetch plans; `corpus` compares the kit with
  `claude plugin validate --json` plugin by plugin.

- Host: `createPluginHost({ plugins, ports, settings?, userConfig? })` and `host.openSession(...)`,
  the public entry that composes the loaded plugins, the skills, hooks, agents, settings and ports. A
  session lists skills and commands as `<plugin>:<name>` (invocation flags, budget), expands them
  (`$ARGUMENTS`, `${CLAUDE_PLUGIN_ROOT}`, shell placeholders through the runner, the shell policy of
  the settings), dispatches any hook event typed per event over every enabled plugin and the
  settings files (matchers, `if` through the rules module, `disableAllHooks`, `allowManagedHooksOnly`,
  the `hooks` lock, the HTTP allowlists), and resolves agents, MCP and LSP servers, monitors and
  output styles with the plugin variables and saved options. Enablement follows the host, then
  `enabledPlugins`, with managed settings that turn a plugin off winning.
- Hooks: `registerHooks` turns a hooks file into registry entries; Settings: `hookSessionGates` reads
  `disableAllHooks`, `allowManagedHooksOnly`, the `hooks` lock, the HTTP allowlists and the settings
  files' hooks off the policy view as the plain data a hook session takes.
- Testing: `@rsaryev/claude-plugin-kit/testing` publishes the fakes of the ports (`memoryFiles`,
  `scriptedRunner`, `recordingHttp`, `fakeModel`, `fakeMcp`, `fixedClock`, `locations`,
  `fakeEnvironment`, `memoryScratch`); `tests/support/ports.ts` re-exports them, one copy.
- Commands: `readCommand` reads a flat command file (the older skill format: the skill frontmatter
  except `name` and `paths`; the name is the path below `commands/` without the extension, folders
  joined by `:`, after the plugin prefix) and `readCommandEntry` builds a command from an entry of
  the manifest's `commands` object map (`source` or inline `content`, `description`, `argumentHint`,
  `model`, `allowedTools`); `loadCommandEntries` reads each `source` through the `PluginFiles` port.
  A missing source file, an entry with both or neither of `source` and `content`, a refused name
  and a `source` outside the plugin folder are error issues for that entry only; an `allowedTools`
  rule that does not parse is dropped with a warning. The loaded commands expand through
  `expandSkill` and list through `menuEntries` like a skill.
- Skills: dynamic context and `expandSkill`. `expandSkill` turns a skill or command into the text
  the model receives plus its grants (`allowed-tools` with `${CLAUDE_*}` substituted in the Bash
  rules, the docs' same-variable pattern), `disallowed-tools`, execution (inline or fork), model and
  effort overrides (and `${CLAUDE_EFFORT}` as the level the skill runs at) and hooks. `!`cmd`` and
  ```` ```! ```` placeholders are found in the original text and run through the `CommandRunner` port
  (the `shell` field picks the tool, exit 1 of search and comparison commands is a result, a failure
  or a refused permission check aborts the invocation, auto mode and forked skills as documented),
  `disableSkillShellExecution` and synced skills replace or keep them as literal text, and output is
  never re-scanned. `countSkillHooks`, `admitSkillHooks` and `hookSourceOf` apply the documented
  limits on skill hooks. `substituteArgumentPieces` backs the expansion.
- Skills: invocation, listing and execution. `invocationPolicy` and `checkInvocation` give the
  default / `disable-model-invocation` / `user-invocable: false` matrix (who may run a skill, what
  the model is told, the `/` menu, subagent preloading, a scheduled-task prompt) and apply
  `skillOverrides` (not to plugin skills); `readSkillMentions` tells a leading `/name` from one
  named in plain text. `modelListing` and `menuEntries` build the skill listing (description plus
  `when_to_use` cut at 1,536 characters, `<` and `>` escaped, a budget that drops the least used
  descriptions first) and the official `SlashCommand` rows. `skillActivatesFor` matches `paths`
  (gitignore syntax and brace expansion, relative to the current directory, nothing outside it).
  `resolveExecution`, `resolveTurnOverrides` and `resolveShell` decide inline or fork (agent,
  background and the cases that wait for the result), the model and effort override of a turn or of
  the forked subagent, and the shell tool of injected commands. `Skill.shellDeclared` and
  `OriginTraits.honoursSkillOverrides` support them.
- Skills: substitution in a skill's text. `substituteArguments` expands `$ARGUMENTS`,
  `$ARGUMENTS[N]`, `$N` and `$name` over the original text in one pass (shell-style quoting through
  `parseArguments`, `\$` escapes, an index with no argument stays as written, a named one becomes
  empty, an argument value is never expanded, `ARGUMENTS: <value>` is appended when nothing
  received the arguments). `buildVariables` and `substituteVariables` substitute `${CLAUDE_SESSION_ID}`,
  `${CLAUDE_EFFORT}`, `${CLAUDE_SKILL_DIR}`, `${CLAUDE_PROJECT_DIR}`, `${CLAUDE_PLUGIN_ROOT}` and
  `${CLAUDE_PLUGIN_DATA}` through `loading/resolve` (the plugin pair for plugin skills only), for the
  body and for the Bash rules of `allowed-tools`; `substitute` does both, arguments first.
  `ORIGIN_TRAITS.substitutesSessionVariables`.
- Skills: `readSkill` reads a `SKILL.md` into a `Skill` (the shared `InvocableFrontmatter` of
  skills and commands): `description` (else the first non-empty body line), `when_to_use`,
  `argument-hint`, `arguments`, `disable-model-invocation`, `user-invocable`, `allowed-tools`,
  `disallowed-tools`, `model`, `effort`, `context`, `agent`, `background`, `hooks` (through the
  hooks reader), `paths`, `shell`, `metadata`, `license` and `compatibility`, with the documented
  defaults; a YAML error loads the skill with its body and no fields, an unknown key is ignored.
  `SKILL_FIELDS` and the `FIELD_READERS` registry, `ORIGIN_TRAITS`, `escapeAngleBrackets`.
- Skills: `resolveSkillName` gives a skill its command name: the directory or `name`, the plugin
  prefix (not doubled when `name` carries it, the plugin-root `SKILL.md` falls back to the plugin
  directory), `anthropic-skills:` for a synced skill, and the characters a name can't hold
  (refused outside a plugin, hyphens in a plugin skill folder); `readSkill` uses it.
- Output styles: `readOutputStyle` (`name`, `description`, `keep-coding-instructions`,
  `force-for-plugin`, `<plugin>:<name>` ids, a YAML error loads the style under its file name),
  `resolveOutputStyle` (case-sensitive setting, case-insensitive `/output-style`, a forced plugin
  style overrides both), `includeCodingInstructions` (full prompt only) and `listOutputStyles`.
- `planPreloadedSkills`, `resolveAgentMcpServers` and `planAgentMemory`: what a subagent starts
  with beyond its prompt. The `skills` field preloads the first 32 distinct names, skipping a
  missing or disabled skill and one with `disable-model-invocation: true`; `mcpServers` splits
  references from inline definitions, ignores the field for a plugin agent, skips the inline
  servers of a project or `--add-dir` agent file until its folder is trusted and any server the
  host's `McpPolicy` blocks (`--strict-mcp-config` does not filter an `--agents` definition,
  managed restrictions always apply); `memory` plans the directory of its scope, none when auto
  memory is off, the first 200 lines or 25KB of `MEMORY.md` (`truncateMemoryIndex`) and the Read,
  Write and Edit tools to add.
- `resolveSubagentModel` and `resolveSubagentEffort`: the model a subagent runs on (invocation
  parameter, then the definition with `inherit`, then `CLAUDE_CODE_SUBAGENT_MODEL`, then the main
  model; a family alias of the main model's family resolves to its exact model; the FORCE variable)
  and its effort (`CLAUDE_CODE_EFFORT_LEVEL`, then the invocation, then the field, then the session
  level only on the main model). `effectiveAutoCompactWindow` (the variable wins, the field only
  lowers, none for a main-session agent), `turnLimitOutcome` (`maxTurns` marks the output partial),
  `effectiveCacheTtl` (`experimental.cacheTtl`, `1h` ignored while on usage credits),
  `runsInBackground`, `claudeMdScopes` (`omitClaudeMd`), `worktreeDisposition` (`isolation`) and
  `mainSessionFirstTurn` (`initialPrompt`).
- `selectAgentHooks`, `agentHookGroups` and `hooksTrustGate`: the frontmatter hooks of an agent that
  fire for an event (only while the agent is active, the `PreToolUse` and `PostToolUse` matcher
  over the tool name, a subagent's `Stop` converted to `SubagentStop`, none for a plugin agent,
  project-level and `--add-dir` agents skipped until their folder is trusted); `readAgent` reads the
  `hooks` field with every hook event accepted.
- `resolveSubagentPermissionMode`: the mode a subagent runs in from its `permissionMode` and the
  main conversation's (a main `bypassPermissions`, `acceptEdits` or `auto` forces its mode, `plan`
  is held and `dontAsk` then denies instead of asking, under `default` or `dontAsk` the set mode
  applies except `bypassPermissions` and an unavailable `auto`, `manual` is `default`, unset
  inherits); `PERMISSION_MODE_TRAITS` and `baselineDecision` for what each mode runs without asking
  (`allow`, `ask`, `deny` or `classify`), typed over the official `PermissionMode` union.
- `resolveSubagentTools`: the tools a subagent gets from `tools` and `disallowedTools` (inherit
  when omitted, `disallowedTools` first, a specifier removes the whole tool, `mcp__server`
  entries including servers whose name holds `__`, the always-removed list with `ExitPlanMode` kept
  for `plan`, the background built-in set, forks unfiltered, the `Agent(worker, researcher)`
  allowlist for the main thread with `Task(...)` as an alias) and the documented zero-tools
  refusal (`ToolRefusal`); `parseToolEntry` and `toolEntryMatches` for single entries.
- Agent frontmatter fields in `readAgent`: `model`, `effort`, `maxTurns`, `autoCompactWindow` (a
  string such as `200k` reads as 200 and is dropped with `invalid autoCompactWindow`),
  `background`, `omitClaudeMd`, `isolation`, `color`, `initialPrompt` and `experimental.cacheTtl`,
  through a field registry typed over the 19 documented names (`AGENT_FIELDS`,
  `AGENT_FIELD_NAMES`) with the plugin supported and ignored lists (`PLUGIN_IGNORED_FIELDS`); a
  plugin agent reports the fields it ignores in `ignored`; fields Claude Code does not recognize
  are named with a likely intended name in `unrecognized`.
- `readAgent` for agent files (`name` and `description`): the files Claude Code skips (no name is
  documentation, a bad name, no description or YAML that does not parse), the plugin fallbacks
  (file name, `Agent from <plugin> plugin`), `<plugin>:<subfolder>:<name>` scoped names
  (`scopedAgentName`), the name rules (`validAgentName`) and the `agent_type` hooks receive
  (`hookAgentType`).
- The evidence pipeline: `docs:pull` mirrors the official Claude Code docs, `spec:extract` turns
  them into `spec/requirements.json`, and `compat` reports the share each test run proves.
- Official types re-exported from `@anthropic-ai/claude-agent-sdk`, with `HOOK_EVENTS` and
  `HOOK_HANDLER_TYPES` asserted equal to the SDK's unions.
- `readManifest` and `validateManifest` for `.claude-plugin/plugin.json`.
- The ports a host implements (`PluginFiles`, `CommandRunner`, `HttpClient`, `ModelRunner`,
  `McpCaller`, `Locations`, `Environment`, `Clock`, `ScratchFiles`), type-only, and in-memory fakes
  of each for tests.
- A frontmatter parser (`parseFrontmatter`) and the value coercions of skills, commands and
  agents (`readFlag`, `readText`, `readList`, `readTable`, `readEnum`).
- `readInteger` and a mode for `readList` (`separators`, `braces`), the frontmatter API exported
  from the package, `line` and `column` on a frontmatter problem, `HttpRequest.as` and
  `HttpResponse.bytes` for binary bodies, and symlinks and access recording in the `memoryFiles`
  fake.
- `EFFORT_LEVELS`, asserted equal to the SDK's `EffortLevel`, and the official `EffortLevel`,
  `SlashCommand` and `ResolvedSettingSource` types re-exported.
- Variable substitution in `loading/resolve`: `${CLAUDE_PLUGIN_ROOT}`, `${CLAUDE_PLUGIN_DATA}`
  (created on first reference, `pluginDataId`), `${CLAUDE_PROJECT_DIR}`, `${user_config.KEY}`,
  `${VAR}` and `${VAR:-default}` in one pass (`substituteTemplate`, `substituteDeep`), the
  per-component policies (`SURFACE_POLICY`, `VARIABLE_FIELDS`), the environment a process receives
  (`exportedEnvironment`, `CLAUDE_PLUGIN_OPTION_<KEY>`) and Windows path rendering.
- MCP servers of a plugin: `readMcpConfig` and `readMcpServer` (wrapper or bare `.mcp.json`; `ws` and
  `headersHelper` on the official stdio, SSE and HTTP configs as `PluginMcpServer`),
  `collectMcpServers` and `classifyMcpSource` (root `.mcp.json` first, then each `mcpServers` source
  in order: `.json` file, inline map, `.mcpb`/`.dxt` bundle path or URL through the new optional
  `McpBundleReader` port, "needs configuration" for a bundle with an unsatisfied required setting),
  and `resolveMcpServer` (variables substituted per transport, credential variables read as empty,
  `headersHelper` rejecting `${user_config.*}` with the documented error, its environment) with
  the reusable `rejectUserConfigInShell` guard.
- Permission rules (`rules`): `parseRule` and `formatRule` for `Tool` and `Tool(specifier)` (literal
  parentheses, `Bash(*)` as bare, `domain:` and `Tool(param:value)` specifiers, the malformed-rule
  message), `matchRule` for bare rules, tool-name globs (with the allow-glob anchoring rule) and
  input-parameter rules, `evaluateRules` in deny, ask, allow order, and `ruleIssues` for the
  matches-no-tool warning. `PERMISSION_MODES`, `PERMISSION_BEHAVIORS`, `normalizePermissionMode`
  (`manual` is `default`), `DOCUMENTED_TOOLS`, and the SDK's tool input and output types.
- Bash and PowerShell rules: the wildcard patterns of permissions.md (the `*` anywhere, the bare
  command before a trailing ` *`, the `:*` suffix), compound commands (every subcommand for an
  allow rule, any for deny and ask, including `$()`, backticks, subshells and loop bodies),
  the fixed wrapper list and safe environment assignments, exec wrappers and `find` actions that
  a prefix rule cannot approve, PowerShell aliases and case-insensitive matching, the
  wildcard-before-subcommand startup warning, and `evaluateIf` for the `if` field of hooks.
  `splitCommand`, `stripWrappers`, `matchBashPattern` and `requiresPromptDespitePrefixRule` are
  exported.
- Path rules (`rules/path`): `Read(...)` and `Edit(...)` patterns with the four anchors (`//`, `~/`,
  `/` per settings source, `path` and `./path`), gitignore matching through `ignore`, the allow versus
  deny/ask depth rule for a single directory segment, `!` negation within one source, Windows POSIX
  paths, routing (Edit covers Write and NotebookEdit, Read covers Grep and Glob, an Edit allow implies
  read, a Read deny covers Edit and Write, Write/Glob/Grep/NotebookEdit path rules never match), the
  symlink two-path rule through a new `PathResolver` port (`prepareCall`, `resolveRuleDirectories`,
  `PathContext.realDirectories`), `readsNetworkPath` and `matchCdRule`.
- Target rules (`rules/target`): `WebFetch(domain:...)` against the hostname of the call's `url`
  (case-insensitive, trailing dot stripped, `*.`, bare `*`, a `*` elsewhere limited to one label,
  bracketed IPv6), `matchDomainPattern`, and the sandbox domain list a `domain:` rule adds to as data
  (`sandboxDomainEntry`, `sandboxDomainLists`; a bare `WebFetch` adds nothing); `Agent(Name)`
  against `subagent_type`; `Skill(name)` and `Skill(name *)` with the namespace rule and the names a
  deny rule sees; MCP rule forms (`mcp__server`, `mcp__server__*`, `mcp__server__tool`) with the
  deny-or-ask versus allow difference for a server whose name holds `__`, `normalizeMcpServerName`,
  `pluginMcpServerName`, `mcpToolName`, `mcpToolRuleMatches`, and the Cowork tools a bare `Bash` or
  `WebFetch` deny rule also blocks.
- `readHooksFile` and `readHooksSettings`: hook configuration read and validated as hooks.md
  describes (events, matcher groups, the five handler types and their fields), into the official
  `HooksSettings`; and `matchesMatcher`, the matcher grammar of hooks.md (match-all, exact list,
  unanchored regular expression, the narrower set of `FileChanged` and `StopFailure`).
- Hook input (`hooks/input`): `buildHookInput` makes the JSON a hook reads from the session and the
  event's facts: the common fields (`session_id`, `prompt_id` absent before the first prompt,
  `scratchpad_dir`, `permission_mode` with Manual as `default`, `effort` on tool-context events,
  `agent_id` and `agent_type`, `hook_event_name`), facts checked against the official input type of
  each of the 33 events (a wrong type or value is an issue and no input), the conditional fields
  (`SessionStart` cost fields for resume and fork, `InstructionsLoaded` `globs`, `trigger_file_path`
  and `parent_file_path` by `load_reason`), and the `Stop` task and cron entries capped at 1000
  characters with the `… [+N chars]` marker and per-type fields. `serializeHookInput` is the one
  JSON text for stdin and an HTTP body.
- Command hook handler (`hooks/handlers`): `runHandler` runs a `command` hook through `CommandRunner`
  in exec form (`args` present: the executable and one argument per element, no shell, placeholders
  and `${user_config.*}` substituted as plain strings) or shell form (`bash` or `powershell`, the
  placeholders rewritten to `${env:NAME}` for PowerShell, a plugin hook that references
  `${user_config.*}` refused with the documented error), with the event JSON on stdin,
  `CLAUDE_PROJECT_DIR`, `CLAUDE_PLUGIN_ROOT`, `CLAUDE_PLUGIN_DATA` and `CLAUDE_PLUGIN_OPTION_<KEY>`
  exported, `OTEL_*` removed and the documented working-directory fallbacks. `async` and
  `asyncRewake` hooks return a background run at once (no timeout for `async`, a wake text on exit
  code 2 for `asyncRewake`). `planTimeouts` and `handlerTimeoutMs` compute the limit the port
  enforces (600/600/600/30/60, lowered on `UserPromptSubmit`, `PreModelSwitch`, `PostModelSwitch`
  and `MessageDisplay`, the shared `SessionEnd` budget), and `statusMessage` reaches the host's
  observer when a hook starts.
- Remote hook handlers (`hooks/handlers/remote`): an `http` hook POSTs the hook input as JSON with
  `Content-Type: application/json`, interpolating `$VAR` and `${VAR}` in header values only for the
  names in `allowedEnvVars` (unlisted ones become empty strings); an `mcp_tool` hook calls the tool
  on the server it names (a plugin server by its scoped name), substitutes `${path}` from the hook
  input into the string arguments, waits for a connecting server only on events that can block or
  change a result, and reports `isError` as a non-blocking error; `prompt` and `agent` hooks
  substitute `$ARGUMENTS` (with the `\$` escape, the input appended when absent), pass `model` and
  the 30 s and 60 s timeouts, and read the `ok` / `reason` / `impossible` answer. `okFalseEffect`
  says what `ok: false` does on each of the 13 events (`continueOnBlock`, `impossible`, agent hooks),
  and `runLimited` runs at most 12 prompt or agent hooks at once, in handler order.
- The hook verdict and engine: `interpretRun` reads a run as the docs do (the stdout against exit
  code table, exit 2 on each of the 33 events, `onFailure` on `command` and `http` hooks, HTTP
  response handling, `ok: false` of prompt and agent hooks, background deliveries), and
  `createHookEngine` dispatches an event through select, input, run, read and merge into a
  `HookOutcome`.
- Hook output (`hooks/output`): `parseHookOutput` reads a hook's JSON against the schema of its
  event (the universal fields and a `hookSpecificOutput` bound to the official types, a value of the
  wrong type is a validation failure, a key no schema names is dropped); `OUTPUT_CAPS` says which of
  `continue`, `systemMessage`, `terminalSequence`, `decision` and the event's own fields each of the
  33 events honours; `mergeOutputs` merges every hook's output in registry order (`PreToolUse` deny >
  defer > ask > allow, `PreModelSwitch` deny > ask > allow, `PermissionRequest`, `PostToolUse`
  rewrites checked against the Bash, Glob, Grep, WebFetch and WebSearch output shapes, the classifier
  note capped at 2,000 characters, `Elicitation` where any decline wins) into typed `effects`;
  `allowedTerminalSequence` keeps `terminalSequence` to OSC 0/1/2/9/99/777 and BEL;
  `parsePermissionUpdates` validates the six permission update entries (`manual` is `default`);
  `createOutputStage` caps each string of a hook at 10,000 characters, saving the rest through
  `ScratchFiles` with a 2,000-character preview, and is the engine's default output stage
  (`HookPorts.scratch`); `OutputStage` gains `limit`, `merge` takes the event's facts, and
  `MergedOutput` carries `issues`.
- Hook output (`hooks/output`): `SubagentStart` `hookSpecificOutput.additionalContext` is proven
  as a requirement (accepted for that event only, carried from every hook, capped, and no decision
  holds subagent creation back).
- Mods, two seams of load. `ModCompiler.compile` returns `{ scan?, run?, issues }`: `scan` is an ES
  module the static scan reads (`claude plugin validate`, `plugin.register`'s `e.uses`), `run` is the
  code and format (`esm`, `cjs`, `iife`...) the host chose for its engine, which `ModRuntime.load` now
  receives with its `format`. A compiler whose run output is an ES module may return it alone; a CommonJS
  scan output is refused with a message that names both outputs. New `MatcherEngine` port
  (`createModChain({ matcherEngine, matcherMs })`, `createModsHost` likewise): the regular expressions of
  hook matchers are tested there, under a limit, instead of on the host thread, and a test the engine
  refuses or does not answer is no match plus a skipped-hook line. The lines of skipped hooks follow
  troubleshoot.md: the transcript or stderr gets the first of each mod, event and kind (`throw`,
  `timeout`, `wrong-shape`) until the mod reloads, the debug log gets every occurrence (`HookReport.kind`).
  A runtime or compiler that throws is a `hooks module did not load` line, a stack overflow the
  documented reason (`engineStackIssue`, `the engine ran out of stack linking the file and its imports`,
  `...loading the file (code nested too deep): <message>`), the parser's reason has no line number, and
  a `Client` error with no message is `the module failed without a message`. `DispatchOptions.before` is
  where the managed `PreToolUse` hooks run, ahead of the first mod. 19 requirements of the mods events,
  overview, create and troubleshoot pages are now proven (18: the linking reason is a judgment, see the
  review fixes).

### Fixed

- Hook output tests (`SubagentStart.additionalContext`): the title no longer claims `continue` is
  dropped (it is carried); the matcher, the `<system-reminder>` escape, the cap boundary, the
  2,000-character preview, the independence of hooks under the cap and the `hookEventName` failure
  are now asserted.
- Hook verdict and engine: a block now says who is shown its text (`BlockInfo.to`: `claude`, `user`,
  `user-and-claude` or `none`), and on the events whose docs show it to no one (`ConfigChange`,
  `Elicitation`, `ElicitationResult`, `WorktreeCreate`, `WorktreeRemove`) `reason` and `message` are
  empty, the debug-log events keeping the hook's line in `debug`; a `PostToolBatch` stop leaves a
  notice for the transcript and feedback for Claude; on `Elicitation` and `ElicitationResult` only
  `hookSpecificOutput` is dropped from a run that did not exit 0 (`systemMessage` and `continue`
  still count); a `UserPromptSubmit` command, HTTP or MCP tool hook that times out leaves a notice
  with the timeout and the discarded output; a `continue: false` block no longer replaces an exit-2
  reason; tests assert the route per event against the docs, the `<Event> hook error` notice of
  `SessionStart`, `SubagentStart` and `PostModelSwitch`, and the judgments of assembling blocks.
- Hook output: a `Stop` or `SubagentStop` hook that returns `continue: false` with
  `additionalContext` stops instead of keeping the turn going; `decision` is `block` on every event,
  and the deprecated `approve` is valid on `PreToolUse` only (any other value fails validation); a
  `PreToolUse` `deny` from one hook drops another hook's `updatedInput`, as an exit-2 deny does; the
  10,000-character cap no longer spills a `systemMessage` or specific field the event discards; the
  merge and the cap use the checked output instead of parsing it again; the tool output mirrors and
  `GateEffects` are bound to more of the official types; tests assert where a block's text goes
  (`block.to`) per event, the `WorktreeCreate` path, the `PreCompact`, `TaskCreated` and
  `PostToolUseFailure` blocks, the `TeammateIdle`, `TaskCompleted` and `SubagentStart` rows, and the
  control characters in an OSC body; the judgments behind those rules are recorded.
- Remote hook handlers: an `http` hook now honours the two settings allowlists through
  `RunContext.httpPolicy` (`allowedHttpHookUrls` skips a hook whose URL matches no `*` pattern, with a
  warning at `hooks.<Event>.url`; `httpHookAllowedEnvVars` narrows `allowedEnvVars` to the names on
  both lists); an `mcp_tool` hook returns `cancelled` when the session aborts while it waits for the
  server, instead of a "not connected" error, and with the optional `ports.clock` the wait and the
  call share one hook `timeout` (`timed-out` when the wait used it up); tests assert all 33 values
  of `WAITS_FOR_SERVER`, the exact appended prompt, malformed and reason-less replies for agent hooks
  too, and keep judgment tests out of the `spec(...)` blocks of other ids.
- Mods hook chain (`mods/chain`): `createModChain` runs hooks as middleware by tier (`prepend`, `user`,
  `append`, `builtin`, then Claude Code) with `e` deeply frozen, `next(e)`, `next.signal`,
  `next.origin`, `next.budget`, `next.to(e, tier)`, matchers, `*` and `classic.*`, the failure
  policy with `.catch` handlers (`next.error`, `next.error.cause`, `next.called`), re-entry, the
  10 s, 50 ms (`prompt.edit`), 1 s (`.catch`) and shared `session.end` time limits measured on the
  `Clock` port (a hook's time stops inside `next` and mods API calls except `$.clock.sleep`), the
  28000-level nesting limits, async generator hooks for `turn.step` and `process.spawn`, and the
  telemetry events' `{ to: 'collector' }` filter. Foundations for the other parts of mods:
  `MOD_LIMITS`, `MOD_EVENT_NAMES` (48 events), `MODS_API`, `MOD_TIERS`, `foundation`
  (`createBudget`, `deepFreeze`, `plainDataProblem`, `jsonChars`), and the mods ports (`ModRuntime`,
  `ModCompiler`, `ModStore`, `TelemetrySink`, `ModWatcher`, `DenyRuleChecker`).
- Mods events (`mods/events`): `EVENT_SPECS` for the tool, prompt, command, `/config`, turn, session
  and subagent events (the documented input fields and the shapes a hook can answer with),
  `createEventRules` for the chain (`createModChain({ clock, rules })`: a result of the wrong shape
  fails the hook, a `drop` after `next` was answered fails it, `skill.prompt` refuses a change
  other than `text` and `frontmatter`, a resumed `agent.spawn` ignores a change, `session.append`
  takes only a changed `message.content`, a `drop` or `config.set` `deny` reason is cut at 4,096
  characters), `eventResultProblem`, `eventInputProblem`, `clampReason`, `mergeToolCheck` (plan mode
  lets a mod tighten a call that is not read-only, not approve it), `skillPromptEvent` (source,
  plugin name, path, frontmatter and its problem) and `autocompleteRows`.
- Mods API (`mods/api`): `createModsApi` builds the `$` of one mod from ports. Every call is an
  event through the chain and then a port (`$.fs`, `$.process`, `$.http`, `$.model`, `$.store`,
  `$.state`, `$.session`, `$.prompt`, `$.turn`, `$.config`, `$.settings`, `$.env`, `$.clock`,
  `$.mcp`, `$.audio`, `$.telemetry`, `$.command`, `$.tool`, `$.agent`, `$.plugin`), with the
  documented limits: 4 MiB for a file, a request body, a response, command output and the store,
  `isStdoutTruncated` and `isStderrTruncated`, the 30 second and 10 minute timeouts, five redirects
  and the dropped headers, `HEAD` and the `Content-Length` reason, `maxTokens` 1024 to 64,000 with
  prompt blocks and cache breakpoints, the newest 4,096 messages, and names of up to 64 letters,
  digits, `_` and `-` (`isValidModName`). `engine.create` adds or withholds a namespace and lends
  its methods the caller's context; `settings.read` has layers, sources and the own-read versus
  mod-read origin (`readEngineSettings`); registries of commands, tools (as `mcp__<plugin>__<name>`)
  and subagent types; `$.state` with `atom`, `read` and `update`; `withApiRules` composes the shape
  of API calls with `createEventRules()`; `AGENT_STATUSES`; and the ports behind it (`ModFs`,
  `ModFetcher`, `ModSpawner`, `ModModels`, `ModSession`...).
- The interface part of mods (`createModsUi`, `withUiRules`, `uiApi`): the 12 elements with their
  props, the apps that draw them and the props the VS Code extension ignores, the 15 render sites,
  tree validation (`treeProblem`, the documented `a tree Pane refuses:` lines) and the size limits
  (nesting 32, 20,000 nodes, `Raster` cells, `Image` bytes, 100,000 characters of text),
  `foldRender` (a tree, `next(e)`'s reference, the band and `AskUserQuestion` rules), panes
  (`$.ui.open` placement at 144 and 110 columns, `ui.close` origins), controls routed by key
  (`routeControl`, hotkeys, `action`, the collapsed band), the redraw throttle (10 and 30 a
  second, coalesced), `$.ui.toast` (4 seconds, `timeoutMs`, classic and fullscreen) and `$.ui`.
- Mods loading (`createModsHost`, `decideModLoad`, `orderMods`, `scanHooksModule`, `validateMod`, `activeModsLine`): which hooks modules load and in which tier under `disableAllHooks`, `allowManagedHooksOnly`, `disableSideloadFlags`, `prependPlugins`, `appendPlugins`, `pluginConfigs`, `CLAUDE_CODE_PLUGIN_DIRS` and the built-in guard `sec-default@builtin` (`allowManagedModsOnly`, `allowModsToOverrideDenyRules`); the `plugin.register` refusal; `/reload-plugins`; the static scan with the 2,000-scope limit; and the file names of a mod (`hooks/hooks.json`, `hooks/register.js`, `types/index.d.ts`, `.test.ts`).
- The mods test kit (`modsTesting`): `runModTests` for `claude plugin test [directory]` with Bun-style output, the 5-second limit and `timeoutMs`; `createTestKit` for `claude-code/testing` (`test`, `tier`, `expect`, `mock.clock`, `mock.store`, `mock.env`, `mock.session`, `$.ui.mount`); the `ModTestRuntime` port and the in-process `inlineRuntime` and `inlineTests`.

### Fixed

- Mods loading, policy, scan and test kit: the test kit fails a mods API call no stub answers with
  `no implementation for <name>` (not only `fs.read`), leaves `ui.invalidate`, `$.state` and
  `session.append` to itself, and reads `hooks.json` as JSON instead of searching its text; an
  inline mod written as method shorthand (`register(on) { ... }`, also `async`) loads; the host
  fires `session.start` for each loaded mod after `load` and `reload`, a reload leaves the mods
  the host registered itself, and `reloadMod(name)` keeps the version loaded before when a save
  breaks the module (`reload failed, the previous version stays loaded:`); an id in both
  `prependPlugins` and `appendPlugins` is prepended; the rollout switch refuses installed mods with
  the documented `for installed plugins` lines; `isTrusted: false` keeps mods out until the trust
  prompt is answered; `disableSideloadFlags` also rejects `--plugin-url`; the loader asks for the
  types file where `claude plugin validate` does and an import that leaves the plugin directory is
  refused; `validate` leaves out a file with nothing to report; the debug line lists the events;
  `ModsSettingsFile` is typed from the SDK's `Settings`; the judgments row for gating events names
  the five events of events.md.
- Mods interface: `$.ui.ask` goes through a `tool.call` of `AskUserQuestion` and reads
  `result.answers`, so the documented stub works and a dismissed question rejects; `ui.message` and
  `ui.fault` reach only the mod that drew the `Client` (`DispatchOptions.only`); a toast raised
  during a hold of toasts waits for the hold to end instead of timing out, and only the terminal
  holds; a failed `Client` has its dimmed line (`clientFailure`); a hook that answers `ui.render`
  without `next` writes `<mod> (<tier>) answered ui.render without next()` to the debug log;
  `drawsAsLink` accepts a missing `/` before a query or fragment; hotkeys press only while the pane
  or band has keyboard focus and no `Input` does; a `ui.render` hook that writes a value it read no
  longer redraws in a loop.
- Mods API: `$.clock.after` and `$.clock.every` return their timer at once (`timer.cancel()` needs
  no `await`, and also stops a timer whose event is still in the chain); a hook on a mods API call
  intercepts only the calls of the mods that run after it (`DispatchOptions.caller`); a pass-through
  hook on `process.spawn` is no longer reported as failed; `$.http.fetch` lower-cases response header
  names (a `Content-Length` in any case is honoured) and cuts `text` to 4 MiB of bytes itself;
  `asUser: false` is a plain submit; `effort` is an SDK `EffortLevel`; `$.fs.list` and `stat`
  carry only the documented fields; `$.agent.list` rows are checked against the reference's
  statuses; casts on JSON data are replaced by parses. The maximum process timeout and `maxTokens`
  are proven under `spec(...)`, the tests that only echoed a stub are now real, and the new
  judgments are rows in `spec/judgments.md`.
- Mods events: `mergeToolCheck` honours `e.ceiling` (`ask` caps a mod's `allow` at `ask`, as
  permissions.md says for connector tools an organization set to `ask`); `SESSION_END_REASONS` now
  lives in `src/protocol/exit-reasons.ts`, tied to the SDK's `ExitReason`; tests prove that a hook's
  `next(e)` rejects when a session message is not delivered, and the ordering, resumed-run and
  input-shape assertions moved out of `spec(...)` into judgments (new rows in `spec/judgments.md`).
- The tool catalog (`TOOL_CATALOG`, `isKnownTool`, `KNOWN_TOOLS`, `toolRequiresPermission`): the
  "Permission required" column and the rule format of each of the 46 documented tools, now the
  source of `ruleFormatOf`; `availableTools` (bare deny rules and globs remove a tool, the
  `EndConversation` exception, Glob and Grep absent by default on posix) and `resolveSubagentTools`
  (`tools`, `disallowedTools`, the filters of the tools available to subagents, the zero-tools
  refusal as an issue).
- Tool inputs (`rules/tools/inputs`): `parseToolInput` reads a hook's `tool_input` against the
  hooks.md table of its tool (Bash, PowerShell, Write, Edit, Read, Glob, Grep, WebFetch, WebSearch,
  Agent, AskUserQuestion, ExitPlanMode) and reports a wrong type or a missing required field as an
  issue at `tool_input.<field>`; `TOOL_INPUT_FIELDS` gives each field its type, optionality, role
  (primary, subject, param, structured) and source (SDK or docs only), and the roles now decide
  which parameter rules are ignored; `answerQuestions` answers AskUserQuestion for `updatedInput`
  (labels joined with commas); `effectiveExitPlanModeInput` drops the ignored `allowedPrompts`;
  `effectiveSearchMode` (an absent `mode` is the full search); `expandToolPath` and
  `expandToolInputPath` give `Write`, `Edit` and `Read` the absolute `file_path` a hook receives
  (backslashes on Windows).
- Tool semantics (`rules/tools/semantics`): pure functions for the behaviour tools-reference.md
  states exactly. `applyEdit` (exact replacement, one occurrence unless `replace_all`, `$&` kept
  literal, refusals as issues), `editEncodingIssue` and `writeEncodingIssue` (the non-UTF-8 and
  `U+FFFD` guards, the documented message verbatim), `effectiveBashTimeout` (120000 default, 600000
  ceiling, the larger of the two variables), `backgroundTimeLimit`, `bashOutputLimits` and
  `windowBashOutput` (30,000 inline, 10,000 for a failure, `bashOutputMaxChars`), `classifyBashExit`
  (exit 1 is valid only for `grep`, `rg`, `egrep`, `fgrep`, `find`, `diff`, `test`, `[`, `git diff`,
  `git grep`), `readWindow` (offset, limit, the empty-file and past-the-end notices),
  `checkWebFetchUrl` (localhost and dotless hosts refused with the documented message, `http`
  upgraded) and `sliceFetched` (100,000-character window, unread count, next offset),
  `validateWebSearchDomains` (the two lists cannot be combined), `effectiveGrepOutputMode` and
  `capGlobMatches` (100 files and a truncation flag).
- Tool responses (`rules/tools/responses`): `parseAgentResponse` reads the `tool_response` of an
  Agent call as the `completed` or `async_launched` member of a union typed from the SDK's
  `AgentOutput` (a launch exposes no usage fields, `modelsUsed` is set only after a swap and its
  repeats are collapsed, `resolvedModel` may differ from the request). `parseBashEditDiff` reads
  `tool_response.bashEditDiff` (at most 200 `changedFiles`, at most 5 `files`, `moreFiles`,
  `unavailable`, `skipped`, `shared`) with warnings for broken limits, and `bashEditDiffTrust` says
  whether a list is complete and attributable.

### Fixed

- Tool responses: `parseAgentResponse` keeps `modelsUsed` as received instead of collapsing repeats
  and dropping short lists; `parseBashEditDiff` no longer warns on a file marked both created and
  deleted, and accepts a `hunks` of any shape. Agent tests now cover non-text content blocks and each
  launch field, and the two judgments moved out of `spec()`.
- Tool semantics: the limits tools-reference.md states are decided by pure functions instead of
  only the empty-file and default cases. Read: `classifyReadTarget` (binary extensions, images over
  128 MB, notebooks over 100 MB), `classifyReadSize` and `readTokenLimit` (256 KB whole-file
  refusal, 25,000 tokens or `CLAUDE_CODE_FILE_READ_MAX_OUTPUT_TOKENS`, `PARTIAL view`, `allow_large`).
  Glob: `validateGlobInput` (null byte) and `globRespectsIgnore`. Grep: `windowGrepContent`
  (`No entries at this offset`), `windowGrepCounts` and `totalGrepCount`, `effectiveGrepMultiline`,
  with `GREP_OUTPUT_MODES` declared once in `rules/tools/inputs`. Bash: `shouldMoveToBackground`
  and the moved, cwd and stop notices, `BASH_DEFAULT_TIMEOUT_MS` for a moved command, and
  `classifyPowerShellExit` (`findstr`); `! grep` at exit 1 is now a failure and the `!`, assignment,
  `&` and subshell cases are recorded as judgments. WebSearch: `webSearchLimits` and
  `webSearchAllowance`. WebFetch: `webFetchTimings` and `redirectNotice`. The Edit tests assert
  which refusal (not found or found N times) they expect.
- Tool inputs: the optionality of Bash and PowerShell `run_in_background`, Edit `replace_all` and
  Grep `-i` and `multiline` (the tables mark none optional) is recorded as a judgment and tested
  outside the spec; `answerQuestions` derives its input type from the SDK's `AskUserQuestionInput`
  (`multiSelect` stays optional, as hooks.md says); WebSearch domain lists reject non-string
  elements at `tool_input.<field>.<index>` and ExitPlanMode `allowedPrompts` must be an array,
  both recorded as judgments.
- Marketplace contracts: the `Marketplace`, `MarketplaceEntry`, `PluginSource` and
  `MarketplaceSource` shapes (with the closed `PLUGIN_SOURCE_KINDS` and `MARKETPLACE_SOURCE_KINDS`
  lists), the fetch plans (`FetchPlan`, `MarketplaceFetchPlan`, `ArchiveLimits`), the ports only
  marketplaces need (`Sha256`, `ArchiveReader`, `GitTags`, `SourceFetcher`), and the plugin id
  grammar shared by names, rename targets and dependencies (`PLUGIN_ID_PART`, `pluginIdIssues` with
  the documented "Claude Code cannot install plugin" and "cannot contain spaces" messages,
  `desktopNameIssues` for the Claude Desktop warnings).
- Plugin sources and their fetch plans (`marketplace`): `parsePluginSource` reads an entry's
  `source` (a relative path, `"."`, a bare name under `metadata.pluginRoot`, and the `github`,
  `url`, `git-subdir`, `npm`, `archive` and `command` objects with the documented field rules and
  messages: `Invalid string: must start with "./"`, `Path contains ".."`, the `unsupported`
  placeholder, `sha` of 40 lowercase hex, `sha256` of 64 hex, a command of printable ASCII, 500
  characters at most, with no run of four spaces, `timeout` 1 to 600 and `mode`); `planPluginFetch`
  turns a source into a `FetchPlan` (a relative path resolves from the marketplace root and not
  for a `url` or `settings` marketplace, `sha` wins over `ref`, `git-subdir` is a sparse and, over
  https or SSH, partial clone, npm never runs install scripts or installs dependencies, the npm
  refusals for git addresses, folders, `npm:` aliases, tarball links and http registries, an archive
  over https that is not a loopback, link-local or cloud-metadata host with its download and
  extraction limits, a command through `sh` or `cmd.exe` from the home directory, link mode refused
  on Windows); `runCommandSource` and `fetchArchive` run the two engines through `CommandRunner`,
  `HttpClient`, `Sha256`, `ArchiveReader` and the new `PluginDirectories` port and refuse every
  failure the docs list.
- Archive download headers (`marketplace`): `archiveDownloadHeaders` and `resolveHeaders` merge a
  marketplace `url` source's `headers` (sent to its own origin only) with an entry's (replacing by
  name), command output over `headers` within a place, and drop `Host`, `Cookie` and `X-Forwarded-*`
  from catalog and project entries; `helperAllowed` decides whether a `headersHelper` runs
  (`https://` marketplace URL, settings file and trust, `--add-dir`, `disableCommandPluginSources`
  and `allowManagedHooksOnly`, single install or update the user accepted); `runHeadersHelper` runs
  it through `CommandRunner` (10 seconds, JSON object of strings, no credential variables for a
  catalog or project command) and `helperCache` reuses a `url` source's output for 60 seconds. Entry
  validation also warns about routing headers and a `headersHelper` without a `sha256` pin.
- Marketplace sources (`marketplace`): `parseMarketplaceSource` reads the `source` object of
  `extraKnownMarketplaces` or an entry of `strictKnownMarketplaces` and `blockedMarketplaces`
  (`url`, `github`, `git`, `npm`, `file`, `directory`, `settings`, and the policy-only `skills-dir`,
  `hostPattern`, `pathPattern`) with every field (`path` defaulting to
  `.claude-plugin/marketplace.json`, `ref`, `sparsePaths`, the no-op `skipLfs`, a settings source's
  `name` equal to its key and not reserved, its inline `plugins` as remote entries, the `owner/*`
  wildcard in policy lists only) and the `loadStatus` `extraKnownMarketplaces` gives it;
  `planMarketplaceFetch` turns a source into a git clone, a 5 MiB and 10 second file download, an
  in-place read with the root two levels up, or an inline catalog; `parseMarketplaceInput` builds
  the source `claude plugin marketplace add` builds from what you type, with `--sparse`.
- Marketplace renames and removal (`marketplace`): `validateRenames` (also run by
  `validateMarketplace`) rejects a `renames` chain that cycles or ends outside `plugins` and a target
  that is not a plugin name; `resolveRename`, `renameNotice`, `migrateSettingsKeys` and
  `migrateSettingsScopes` follow the chain from the oldest name and rewrite or drop the old keys of
  `enabledPlugins` and `pluginConfigs` (managed settings are left and their notice recurs);
  `removedPlugins` decides what `forceRemoveDeletedPlugins` uninstalls and flags.
- Marketplace dependencies (`marketplace`): `normalizeDependency` reads a `dependencies` item
  (`"name"`, `"name@marketplace"` or an object with `name`, `marketplace` and a node-semver
  `version`), `releaseTag`, `parseReleaseTag`, `selectTag` and `combineRanges` resolve ranges against
  `<name>--v<version>` tags (pre-releases only with `^2.0.0-0`, conflicts reported as `has
  conflicting version requirements`), `resolveDependencyVersion` applies the source-kind rules (own
  repository fails with `has no git tag satisfying`, relative path falls back to the current copy,
  `npm`, `archive` and `command` check the plugin.json version), `checkInstalledDependency` and
  `checkDependency` give the quoted `is not installed`, `is disabled` and `Requires "<dep>" <range>,
  installed <version>` messages (local copies skip the range; claude.ai plugins meet a dependency
  only for `@synced` plugins), and `crossMarketplaceDecision` applies the root marketplace's
  `allowCrossMarketplaceDependenciesOn`. Adds the `semver` dependency.
- `readMarketplace` and `validateMarketplace` read every entry by default (the entry reader over
  `parsePluginSource`), so a marketplace file loads end to end and its entries feed `planPluginFetch`,
  `resolveRename`, `normalizeDependency` and `crossMarketplaceDecision`; `unreadEntry` is removed.

### Fixed

- Marketplace dependencies (`marketplace`): a dependency `name` and `marketplace` must satisfy the
  plugin id grammar (`a@b@c` and blank names are errors); the `@synced` note is added only for an
  enabled claude.ai plugin; `combineRanges` takes the dependency and names it by id; the new
  `autoUpdateDecision` skips an update whose current copy falls outside any installed range or whose
  ranges conflict; dependency issues carry the `errorType` of `claude plugin list --json`
  (`DependencyIssue`); `crossMarketplaceDecision` accepts the declaring plugin's marketplace and
  ignores its list; weak and misfiled dependency tests are replaced or moved outside `spec(...)`.
- Marketplace renames and removal (`marketplace`): `migrateSettingsKeys` and `migrateSettingsScopes`
  keep the type of the values they carry; `InstallScope` derives from the SDK's setting sources;
  `Renames` is the one type of the map; tests now prove the notice appears once, managed settings
  are left as given, a registered name that differs from the file's is used, and the first of two
  old keys rewritten to one new key wins; the judgments record these, the host's **Flagged**
  heading, and that renames chains are checked only by `validate`.
- Archive download headers: a `headersHelper` command runs only for the command and archive URL
  the user accepted (`AcceptedCommand`, replacing a bare flag; a change in the query string alone
  does not count unless the host sets `queryCounts`); an empty `CLAUDE_CONFIG_DIR` is unset;
  concurrent downloads on one origin share one command run; the entry and `url` source header
  types are taken from `MarketplaceEntry` and `MarketplaceSource`.
- Plugin sources and fetch plans: the archive compression ratio is judged against the length of
  the zip the kit downloaded and not against a size the host reports; a local plan carries a
  `submodules` rule (`none`, `plugin-subtree`, `whole-repository`) with `selectSubmodules` and
  `submodulePaths` for the git submodules a marketplace clone fetches; a `git-subdir` path with a
  drive letter or a UNC prefix is refused as absolute; the object source parsers read each field
  with a typed reader instead of a cast; the relative path tests assert the backslash message
  (also for a trailing backslash), a symlink counts as one entry at exactly 20,000 and 20,001, and
  a tarball link outside the default registry's path prefix is refused; the `sha256` lower casing
  and the placeholder `headers` of an archive plan are recorded as judgments.
- Marketplace entries: the `source` spec block proves only the entry-level behaviour (the parser's
  messages belong to the plugin source parser); `headers` and `headersHelper` count under their own
  ids, with a non-string helper dropping the entry; `effectiveTopic` gives the `relevance.topic`
  default and `effectiveDisplayName` the name users see; `dependencies` has negative cases for a
  non-string `version` and `marketplace`; the entry reserved-name check no longer filters the
  manifest's advice by its wording (`nameReservedIssues` is separate from the kebab-case advice); the
  version and no-effect headers warnings are recorded as reported when loading too.
- Marketplace file and names: a name with a non-ASCII character impersonates an official
  marketplace even when it spells a reserved name (`claude–code–plugins` with en dashes);
  `renames` keeps a `"__proto__"` entry from parsed JSON instead of dropping it; the name tests
  assert the exact reserved-name, Claude Desktop and non-anthropics `git` messages, and
  `metadata.pluginRoot` has its own spec block.
- Marketplace contracts: `ArchiveReader.stats` and `GitTags.list` report a corrupt zip, an
  unreachable git host or a fired signal as a `PortFailure` instead of a rejection (`stats` now
  takes a required `signal`); `MarketplaceSource` carries `skipLfs` on `github` and `git` and
  `version` and `registry` on `npm`, and a type-level test ties its kinds and fields to the SDK's.
- Marketplace sources: a source object that does not parse (a missing or mistyped required field,
  a `settings` name that differs from its key) reports the load status `Unsupported marketplace
  source type` instead of `loads`; `marketplace add` clones a `/_git/` URL even with a query string;
  the `http-file` plan carries the redirect rule of a `url` source (a different origin must use
  `https`, blocked hosts are refused, no configured header is sent); a relative `file` path has a
  root (`.` for fewer than two directories, the drive for `C:\m.json`); issue paths of a source
  plan are relative to the source object; one GitHub `owner/repo` rule serves plugin sources,
  marketplace sources and `marketplace add`; `--sparse`, `owner/*` and the `url` source's
  relative-path refusal count under their requirement ids, and the settings duplicate, `strict`,
  `npm` `version` and `registry`, and policy-warning tests assert their paths and messages.
- Settings layers (`settings`): `readSettingsLayer` turns the JSON of one source (managed, parent,
  `--settings`, local, project, `--add-dir`, user) into a layer: marketplace key aliases read as
  their canonical key, a key its Scope line does not allow dropped with a warning, an unreadable
  value repaired as managed-settings.md says (empty allowlists, `true` locks, `strictPluginOnlyCustomization`
  as `true`, invalid entries stripped). `createPolicyView` answers `get`, `winner` and
  `eachFromHighest` over the ordered layers with one merge rule per key (`KEY_SPECS`), and
  `loadSettingsLayers` reads layers from a host's `SettingsSources`. `mergeHooks` combines the
  `hooks` of every file without letting a file remove a managed hook, and runs a handler defined in
  two files once. `POLICY_KEYS`, `PLUGIN_ONLY_SURFACES`, `SKILL_OVERRIDE_STATES`, `WORKFLOW_SIZES`,
  `MARKETPLACE_SOURCE_KINDS` and `MarketplaceSource` are asserted equal to the SDK's types.
- The plugin keys of the settings (`settings/plugins`): `enabledPlugin` and `forceEnabledByManaged`
  (`enabledPlugins` precedence, managed block and hide, `defaultEnabled`, `@synced`), `pluginConfig`
  (`pluginConfigs`, user and managed only, the `@builtin` id aliases), `modOrder` (`prependPlugins`
  and `appendPlugins`, the built-in guard), `syncDecision` (`syncClaudeAiPlugins`), `trustWarning`
  (`pluginTrustMessage`) and `createPluginSettingsPolicy`.
- Marketplace gate (`settings/marketplaces`): `createMarketplaceGate(view)` answers
  `strictKnownMarketplaces` and `blockedMarketplaces` as verdicts (add, install, update, refresh,
  auto-update, session start, a marketplace that cannot be found, `skills-dir`), and
  `matchMarketplaceSource` is the shared matcher: exact entries, owner wildcards (case-sensitive on
  the allowlist, case-insensitive on the blocklist), `hostPattern` host extraction, `pathPattern`,
  canonical git URLs and `url` entries on the blocklist, `[]` as a lockdown, and the blocklist
  checked first.
- Marketplace registry and command sources (`settings/marketplaces`):
  `createMarketplaceRegistry(view, context).registrations()` plans `extraKnownMarketplaces` (whole-entry
  replacement across files, workspace trust for project, local and `--add-dir` entries, the allowlist
  and blocklist checked on the entry that wins, `settings` source rules, `headersHelper` ignored from
  `--add-dir`, `autoUpdate` defaults, the official marketplace implied by `enabledPlugins`), and
  `createCommandSourcePolicy(view)` answers `disableCommandPluginSources` (falling back to
  `allowManagedHooksOnly`) for command-sourced plugins and marketplace `headersHelper` commands.
- Hook policy (`settings/hooks`): `createHookPolicy(view, locks, context)` answers `disableAllHooks`
  and `allowManagedHooksOnly` as `runs(origin)` for every origin of a hook (managed settings, SDK
  callbacks, user, project, local and `--settings` files, plugins and their mods, frontmatter), with
  the value left after precedence deciding the reach, force-enabled plugins matched by their full
  `plugin@marketplace` id, command-sourced plugins and built-in mods; `commandsDisabled`,
  `commandSettingsNarrowedToManaged`, `monitorsRun` and `goalCommandAvailable` give what follows the
  hooks. `httpHook(url, allowedEnvVars)` applies `allowedHttpHookUrls` (`matchUrlPattern`: `*`,
  host case and trailing dot) and `httpHookAllowedEnvVars` (the outer limit on a hook's list), both
  merged across files. The Agent SDK's `managedSettings` rules (ignored beside an administrator
  unless `parentSettingsBehavior` is `merge`; an empty allowlist ignored when the administrator ships
  hooks or enables a plugin) are applied before any decision.
- Skill keys (`settings/skills`): `createSkillSettingsPolicy(view, context)` answers
  `skillOverrides` as `visibility(name, subject)` (the four states over what Claude sees, the `/`
  menu and the Remote Control and SDK command lists, the `skillOverrides` error for an `off` skill,
  plugin skills untouched, bundled-skill alias entries from managed settings and `--settings` files
  that can only restrict further), `disableBundledSkills` with `CLAUDE_CODE_DISABLE_BUNDLED_SKILLS`
  (neither undoes the other), `disableSkillShellExecution` as a per-origin verdict with the
  `[shell command execution disabled by policy]` replacement (a managed `true` is never overridden),
  and `syncClaudeAiSkills` as the same decision `syncClaudeAiPlugins` gives.
- Workflow keys (`settings/workflows`): `createWorkflowSettingsPolicy(view, context)` answers
  `disableWorkflows` and `enableWorkflows` as `enablement()` (off by `disableWorkflows` in any file,
  `CLAUDE_CODE_DISABLE_WORKFLOWS=1` or the organization's toggle, none undone by `enableWorkflows:
  true`; on by default except on Pro; what goes with workflows; the `/config` row),
  `workflowKeywordTriggerEnabled` as `keyword(prompt)` (the `ultracode` keyword triggers only in a
  prompt a person typed, never for `-p`, a scheduled task, an unstamped SDK prompt or a relayed
  event) and `workflowSizeGuideline` as `size()` (agent count advice, precedence over the `/config`
  choice, the `Large workflow` threshold).
- Channel keys (`settings/channels`): `createChannelSettingsPolicy(view, context)` answers
  `channelsEnabled` as `gate()` (blocked on Team and Enterprise, and on Console with managed
  settings, until managed `true`; open on Console without managed settings and on Pro, Max and
  Ultra; `false` is unset; users cannot lift it) and `allowedChannelPlugins` as `allowlist()` and
  `allowed(entry)` (the managed list replaces the host's default and is taken whole, an
  empty list blocks every plugin, an invalid value is an empty list, the string form equals the
  object; an entry carries the flag it came from, and the development flag skips the list for its own
  entries only, a bare `server:<name>` included, never for a closed gate, and only in an interactive
  session).
- Customization lock and the composed policy (`settings/customization`, `settings/resolve`):
  `createCustomizationPolicy(view, context)` reads `strictPluginOnlyCustomization` (`true` locks all
  four kinds, an array the kinds it names, an unreadable value `true`, an unknown name locks nothing
  and is counted) and answers `loads(surface, origin)` for skills, agents, hooks and MCP servers from
  the origins each sub-key entry lists, `skillsDirPlugins()` (stopped by a lock on any kind or the
  marketplace lists), `skillAllowedToolsPreapproved(skill)` and the documented `claude mcp add`
  refusal. `suggestionMarketplaces(view, registered)` answers `pluginSuggestionMarketplaces` (managed
  only, registered, source declared in the same managed settings, the official name alone).
  `resolvePolicy({ layers, context })` and `PolicyContext` compose every area over one view and feed
  the customization lock into the hook policy.

### Fixed

- Settings, customization lock: `McpOrigin` has `localConfig` beside `userConfig`, since local-scope MCP
  servers live in `~/.claude.json`, which the `mcp` lock stops loading from (the judgment that put the
  local scope in no table was wrong); tests now build the frontmatter hooks of a skills-directory plugin,
  the `--settings` and SDK-option hooks under a hooks lock, a parent's `strictKnownMarketplaces` as a
  non-declaration of a suggestion source, and the parent-lock composition; two tests that restated the
  origin table or cited a plain-skill fallback the kit does not implement are removed or renamed, and the
  fallback is recorded as a host decision.
- Settings, channel keys: `allowed(entry)` takes the flag each entry came from (`channels` or
  `development`), so a session with both kinds bypasses the list for the development entries only;
  a bare `server:<name>` development entry needs no plugin or marketplace; the closed gate carries
  `serverConnects: true` (the MCP server stays connected, only channel messages stop); `ChannelPluginRef`
  is the SDK's `allowedChannelPlugins` element type, declared once in `protocol/official.ts` and shared
  with the settings repair; the host's duty to refuse a channel server that negotiates protocol
  revision 2026-07-28 is recorded as a judgment; `null` and unreadable `channelsEnabled` and
  `allowedChannelPlugins` values are tested.
- Settings, workflow keys: the decision no longer carries `inProgressRunsContinue`, a constant that
  described no run state (the duty to let a run finish is recorded as a host duty); the size
  decision returns `largeWorkflowThreshold` and the new `largeWorkflowTokens` (1.5 million) as
  `undefined` while the host says `ultracode` is on, as the docs say the `Large workflow` warning
  does not show then; tests table every prompt surface and every non-human SDK origin with its
  expected verdict and reason, and show that `workflowKeywordTriggerEnabled: false` leaves
  `/effort ultracode` and the workflow surfaces as they are.

- Settings, hook policy: `allowedHttpHookUrls` pattern `http://localhost:*` now also matches
  `http://localhost/x` (a wildcard port also stands for no port), as the docs example says; a
  `disableAllHooks: true` in the SDK's `managedSettings` is a lock that binds as
  `allowManagedHooksOnly: true` (an administrator's `false` no longer lifts it, plugin monitors and
  agent frontmatter follow it, command sources stay enabled), and a non-Boolean value there other than
  `false` and `"false"` binds the same way with a warning instead of being dropped; `monitorsRun`
  takes the plugin id and matches managed `enabledPlugins` on the whole `plugin@marketplace`; tests
  cover `--settings` and SDK-option hooks and `--add-dir` and synced frontmatter under the `hooks`
  lock, `disableCommandPluginSources: true` alone, and the managed origin under the HTTP allowlists.

- Settings, marketplace registry: `autoUpdate` defaults off for `knowledge-work-plugins` and
  `first-party-plugins` whatever the host lists as official; routing and identity headers (`Host`,
  `Cookie`, `X-Forwarded-*`) are dropped from an inline plugin entry's `headers` in a project, local
  or `--add-dir` file, `Authorization` kept; a `url` source that does not start with `https://`
  loses its `headersHelper`; `autoUpdateFixed` is set only for a registered managed entry; the
  inline plugin source kinds are typed over the SDK's union so a new kind fails to compile.

- Settings, marketplace gate: the blocked-source message quotes the source (`Marketplace source
  '<source>' is blocked by enterprise policy`); an empty allowlist ends it with `No external
  marketplaces are allowed.`; the load-time messages carry the docs' guidance line; a `github`
  shorthand refused by an allowlist that admits a host by hostname adds the `Tip:`;
  `skillsDirectoryPlugins()` reports `strictPluginOnlyCustomization` as the reason when any
  customization type is locked; tests assert whole messages and cover a pinned `ref` or `path` and
  both lists set.
- Settings, plugin keys: a `--add-dir` directory now ranks below user settings and only its `true`
  `enabledPlugins` entry counts (plugins/loading.md), so it neither turns a plugin off nor overrides
  another file; the built-in guard's `pluginConfigs` options are read from managed settings only;
  `modOrder` reports the organization's mods that no list names (`unlisted`); a `pluginConfigs`
  entry that is not an object is dropped with a warning instead of shadowing a lower file; the
  option value types come from the SDK; tests no longer restate a constant or a neighbour.
- Settings: the policy view returns each key's value through a merge strategy typed over the key,
  with no cast; the `hooks` of a user, project, local or `--settings` file drop only the entries
  that fail (a bad handler, group or event) and keep the rest, while a managed source still ignores
  the whole field; the same handler under two matchers is recorded as an open requirement of the
  hooks engine instead of being presented as proven; the unused `PolicyContext` type is removed
  until the resolvers need it; one shared `isRecord` guard.
- Skills: an unquoted `argument-hint: [topic: foo | bar]` is written back as that text instead of
  being dropped; the unknown-event warning of a skill's `hooks` no longer repeats the `hooks.`
  prefix; the shell list is checked against the host's `ShellKind`; the judgments cover an
  unbalanced list delimiter, an unknown hook event kept with a warning, the comma split of
  `arguments` and the skill folder of a Windows path.
- `listOutputStyles` marks one row current: a custom style that reuses a built-in id or an earlier
  style's id is no longer listed, matching what `resolveOutputStyle` selects.
- Memory index: `truncateMemoryIndex` strips a block-level HTML comment only when it opens a line
  and ends on the line of its own first `-->`, and not inside fenced code, so text between two
  comments is no longer dropped and `truncated` stays honest; the `skills` tests prove `Skill` in
  `tools` is no preload, and the comma-separated `skills` string is a recorded judgment.
- Agent launch: `worktreeDisposition` takes `{ isolation, hasChanges }` and returns `none` for an
  agent without `isolation: worktree`; `ClaudeMdScopes` gains `nested` (a subdirectory's CLAUDE.md
  and path-scoped rules still load with `omitClaudeMd`); the model, effort, background and
  auto-compact tests now prove what the docs say (resolved model per value, documented-only
  cases), the judgments sit in their own blocks, and `spec/judgments.md` records the
  `CLAUDE_CODE_EFFORT_LEVEL=auto` effect on subagents, the host-side `k`/`M` suffixes of
  `CLAUDE_CODE_AUTO_COMPACT_WINDOW`, the `agent.spawn` model and the Explore and Plan subagents.
- Agent hooks: a Monitor command (matcher input `Monitor`) is also matched as `Bash` on
  `PreToolUse` and `PermissionRequest`, never on `PostToolUse` (hooks.md, "Match Monitor
  commands"); the `--agents` (flag) trust exemption, the `FileChanged` and `StopFailure` narrow
  grammar and the ignored matcher of events without matcher support are now proven under their
  `hooks.matcher.*` ids, and `spec/judgments.md` keeps only the managed-agent exemption there.
- Permission modes: the dead `classifier` trait is dropped from `PERMISSION_MODE_TRAITS` and its
  tautology test with it; `BaselineDecision` derives from the SDK's `PermissionBehavior`;
  `SubagentPermissionInput.set` takes `string` (raw host text that is no mode counts as unset);
  `spec/judgments.md` records the host-owned subagent classifier review, read-only Bash as a
  `read` and the `dontAsk` always-deny cases.
- `resolveSubagentTools`: a `tools` list naming `SubagentHandback` is no longer refused when the
  host grants it (`handback`), in the foreground or the background; `SubagentRun.teammate` keeps
  the task and cron tools in a background run; `AgentToolFields` derives from the SDK's
  `AgentDefinition`; the tests state their expected lists, cover `Task` and `Agent(type)` in
  `disallowedTools`, and the Glob/Grep grant is recorded as the host's.

- Agent fields: a quoted fraction such as `autoCompactWindow: "200000.5"` is dropped with
  `invalid autoCompactWindow` instead of truncating to 200000; `background` and `omitClaudeMd`
  accept a YAML boolean or the text `true` or `false` only (not `yes`, `on`, `1`); an empty
  inline `mcpServers` definition (`- {}`) is dropped; a plugin agent now has a test for each of
  `tools`, `disallowedTools`, `skills` and `memory`; the judgments say why plugin-ignored fields
  are not "unrecognized".

- Agent files: a project, user or managed file with a name that breaks a rule now has each rule's
  own wording tested; a plugin agent in a file named `.md` is named `.md`, not an empty string; a
  `--add-dir` directory reads as `project`, and `flag` is no source of a file read (`readAgent`).

- LSP servers of a plugin: `readLspConfig` and `readLspServer` (the 14 fields of manifest-reference's
  `lspServers` table as a strict object; `command` without spaces unless it starts with `/`,
  `extensionToLanguage` with dot-prefixed keys, positive and zero-or-more integers; one invalid entry
  skips the whole map with `Invalid LSP server config for ".lsp.json"`), `mergeLspSources` (a later
  server replaces an earlier one), `resolveLspServer` (`command`, `args`, `env` and `workspaceFolder`
  substituted, the three path variables exported, defaults `requestTimeout` 60000, `restartOnCrash`
  and `diagnostics` true, `transport` always `stdio`), and the runtime decisions the host reads:
  `lspRestartDecision`, `languageIdFor`, `lspExtensionConflicts`, `initializeOptionsOf` and
  `didChangeConfigurationOf`.
- Monitors of a plugin: `readMonitors` (the four fields of manifest-reference's `monitors` table as a
  strict entry; unique names; `when` read as `always` or `on-skill-invoke:<skill>`, anything else an
  error), `resolveMonitor` (path variables and `${ENV_VAR}` in `command`, `${user_config.*}` refused
  with the errors.md message, nothing exported) and `monitorsToStart`, the pure engine that says which
  monitors an event starts: `always` on session start and plugin reload, a skill monitor the first
  time its skill runs, none in non-interactive mode.
- `loadPlugin`: a plugin folder through `PluginFiles` to a typed `Plugin`, with the optional
  manifest, every component found by the standard layout registry (`STANDARD_LAYOUT`), the
  `replace`, `add` and `merge` rule of each manifest key (`COMBINE`), the `Default <folder>/ folder
  is ignored` warning, containment and existence checks (`<component> path escapes plugin
  directory`, `<component> path not found`), `settings.json` over the manifest `settings`
  (`readPluginSettings`), the `bin/` decisions (`binPathEntries`, `pathWithPluginBins`,
  `distribution`), the `COMPONENT_READERS` seam, and `resolveProcesses` for MCP servers, language
  servers and monitors.

### Fixed

- Layout discovery: a `skills` entry that is a file and an `agents` entry that is a directory are
  now errors instead of being dropped or scanned silently (manifest-reference, "Path-only fields");
  a manifest `hooks` path that names `hooks/hooks.json` no longer loads the file twice, so its hooks
  run once; the symlinked-folder, duplicate-file and path-shape decisions are recorded in
  `spec/judgments.md`. New tests cover the `bin/` decisions, the depth cap with a really looping
  folder, single-file `workflows` and `experimental.themes`, the symlink escape of default
  `monitors/monitors.json`, `settings.json` and a root `SKILL.md`, and exact issues for invalid LSP,
  monitor and settings files.
- Skill, command and agent content: the `user_config` policy applied to a command body is now
  recorded as the kit's reading (the page words it for skill and agent content and lists commands
  only in the one table row) in `spec/judgments.md` and the `substituteContent` doc comment.
- Monitors: the duplicate-name error and the first-wins rule, the error for any other `when` string,
  and the host-owned `description` display and `command` process behaviour are recorded in
  `spec/judgments.md` (the docs say only "Identifier unique within the plugin"); the `description`
  test no longer claims the task panel, and the option-variable test now checks the
  `CLAUDE_PLUGIN_OPTION_` prefix against a scope with configured options.
- LSP: a refused `extensionToLanguage` now names the keys that lack a dot; `languageIdFor` and
  `lspExtensionConflicts` document a plugin-qualified key (`plugin:server`) so two plugins with the
  same server name stay apart; the integer-like-name ordering limit and the host-owned timeouts are
  recorded in `spec/judgments.md`.
- MCP servers: an entry with `type: "streamable-http"` now reads as `http` (mcp.md, "Option 2");
  an entry with a `url` and no `type` is dropped with the message mcp.md quotes instead of an
  unrelated stdio error (and no longer reads as stdio when it also has a `command`, so a stray `url`
  can no longer reach the resolver and throw); a `type: "sdk"` entry is skipped with the quoted
  message; `isRemoteMcpServer` follows the transport and not the presence of a `url`.
- Permission rules: `Agent(acme:reviewer)` and `Skill(deploy:deploy)` deny rules are names, not
  parameter rules on a field called `acme` or `deploy`; only the fields of the SDK's `AgentInput`
  (and `skill`) read `name:value` as a parameter.
- Bash rules: a here-string (`<<< 'x'`) no longer opens a quoted here-document that hid the lines
  after it from deny and allow rules; a hook `if` that names Bash now runs for a Monitor call (the
  hook gets the Monitor input), and a Monitor rule still does not run for a Bash call; `if` finds
  `$()`, backticks and `$VAR` with the quote-aware scanner, so an apostrophe inside double quotes
  no longer hides one; an unreadable `if` is reported at `hooks.if`; the command field is tied to
  the SDK's `BashInput` and `MonitorInput`.
- Permission rules: an `mcp__` rule with parentheses is skipped only when it comes from a settings
  file, so a deny rule from the command line or the session matches an MCP tool parameter;
  `RuleSource` gains `managed` and `embedder-managed`; a `Skill(skill:<name>)` deny rule matches
  every name the host reports in `PreparedCall.skillNames`; the primary content field is per tool
  (`url` is only `WebFetch`'s); the default matchers fail closed for deny and ask rules; the
  matches-no-tool warning repeats the rule as written (`PermissionRule.text`); the command tools'
  parameter names are checked against the SDK input types.
- `readHooksFile` accepts a mod-only file (`modules` with no `hooks`), `readHooksSettings` keeps a
  JSON-parsed `__proto__` event as an own key, a matcher that does not compile is no longer
  warned about on an event without matcher support, and a non-finite `timeout` reports "expected a
  positive, finite number of seconds".
- `readFlag` no longer reads `constructor` or `__proto__` as a flag, and `readList` no longer splits
  a glob such as `src/**/*.{ts,tsx}` or a path with a space.
- Variable substitution: a remote MCP server now reads the documented credential variables
  (`ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `AWS_BEARER_TOKEN_BEDROCK`, `HTTPS_PROXY`,
  `NPM_TOKEN`) as empty in `url` and `headers`; `UserConfigValue` is derived from the SDK's
  `Settings`; `substituteDeep` returns `unknown` instead of an unchecked cast; the table "Where each
  variable resolves" is asserted row by row, and the path variables are checked against the port
  calls they make.
- The layer check now rejects `Date`, timers, `fetch`, `crypto`, `performance` and `globalThis` in
  `src/`, as the docs state.
- Tool availability: `--tools ""` removes `EndConversation` when no MCP tool remains, the `default`
  entry of `--tools` means the default set, `--restricted` removes `PowerShell`, `Monitor` and
  `WebFetch` as well as `Bash` unless `--tools` names them, a Bash deny rule turns `PowerShell` off
  on Windows with Git Bash (`gitBash`, `powerShellOptIn`), and
  `blockWritesOutsideWorkingDirectories` removes the worktree tools; a subagent whose `tools` glob
  covers `Bash` no longer gets `Glob` and `Grep` back; the catalog test no longer reads the removed
  tools from production data.
- Path rules: an `Edit` rule now covers the legacy `MultiEdit` (and a `Read` deny rule blocks it),
  while `MultiEdit(docs/**)` is accepted and never matches; a `Read` deny or ask rule reaches every
  LSP call and no `!` carve-out reopens one; `Read(./.env)` names the `.env` of the current directory
  only, not one at any depth; a file named `..hidden` is matched by a rule instead of being taken for
  a parent climb; `Read(src/**/*.ts)` as a deny or ask rule reaches a nested `src`; a `/` rule with
  no usable text guards its anchor, not the filesystem root.
- Permission rules: a deny or ask `WebFetch(domain:...)` rule now applies to an artifact read (an
  `Artifact` call with `action: read`) when it covers `claude.ai` or `*.claudeusercontent.com`,
  while a bare `WebFetch` rule and an allow rule do not; an `Agent(general-purpose)` deny or ask
  rule now covers a call that leaves `subagent_type` out, and `Agent(fork)` names a fork; a
  `domain:` rule with non-ASCII labels (`bücher.de`) matches the punycode host; the Cowork twin
  and the Agent, Skill and WebFetch matchers read behaviour and specifier form through a registry
  and a named guard, and their input fields are tied to the SDK's `AgentInput`, `WebFetchInput`
  and `ArtifactInput`.
- Hook selection (`hooks/select`): `createHookRegistry` and `selectHandlers` pick the handlers an
  event runs: the event catalog (cadence, supported handler types per event, `EndConversation`
  skipping both tool events), the field each event's matcher filters on (`MATCHER_TARGETS`, with
  the narrow grammar of `FileChanged` and `StopFailure`, the canonical model of a model switch, and
  the events that ignore a matcher), the documented matcher values tied to the SDK unions, `if`
  evaluated on tool events only, Monitor commands matched by a `Bash` matcher, settings-handler
  dedupe, `disableAllHooks` with managed precedence, workspace and folder trust, plugin enablement,
  `once` for skill frontmatter, and the `FileChanged` watch list.
- Hook selection (`hooks/select`): an `mcp_tool` hook on `Setup`, and on `SessionStart` at launch
  (startup, resume, fork), is skipped and reported as a warning, because the MCP servers are not
  available yet, and it runs after `/clear` or a compaction; an `if` of `Edit(src/**)` matches only
  the `src` directory in the working directory (`Edit(**/src/**)` for any depth) instead of any
  depth, and two rules joined with `&&` or `||` are reported as one rule that cannot match;
  `allowManagedHooksOnly` and the `strictPluginOnlyCustomization` hooks lock gate handlers by
  source (`allowManagedHooksOnly`, `forceEnabledPlugins` and `pluginOnlyHooks` on the session); the
  `FileChanged` watch list (`fileChangedWatchList(entries, session)`) skips handlers that cannot
  run; the session's `effort` takes the SDK type.
- Hook input (`hooks/input`): `HookSession.permissionMode` takes the host's own text, so the
  Manual label (sent as `"default"`) and a text that names no mode (warned, not sent) are reachable
  through the typed API; `duration_ms`, `seconds_since_last_response` and
  `estimated_cache_write_usd` accept any number, as the docs type them, while `context_tokens` and
  `index` stay whole numbers (a judgment); issue paths write an array index as `[n]`
  (`hooks.Stop.input.background_tasks[0].id`), as the warnings and the select stage do; the input
  build no longer relies on casts beyond one commented join, and tests now cover `mcp_server`,
  `permission_suggestions`, `tool_calls`, the optional titles and the Elicitation and ConfigChange
  enums.
- Command handler: an `asyncRewake` hook that exits with code 2 and writes only blank output no
  longer wakes Claude with an empty reminder; the `OTEL_` exporter variables are removed in any
  case on a Windows host; the handler registry dispatches without a type assertion; the PowerShell
  rewrite of a settings hook's plugin placeholders, the override of inherited variables, and the
  host-chosen default shell are recorded as judgments. Tests: judgments moved out of `spec(...)`,
  and added for `${user_config.*}` in `command`, Git Bash path normalization and Windows exported
  paths.
- Mods chain: a synchronous mods API call gives the hook's time budget back, so a hook's own
  10 s, 50 ms or 1 s limit still fires after one; `walkPlainData` measures a sub-structure
  reached twice at its deepest place, so a shared sub-tree can no longer slip past the 28,000-level
  limits; a hook whose `.catch` handler fails too is reported with the hook's own reason, as if it
  had no handler; the host passes `rewritten` and `lent` flags in `ReentryInfo` and the chain
  picks `next.error.cause` (`rewritten` wins); `plugin.name` and `plugin.root` are values and no
  longer events (`API_EVENT_NAMES`, `ApiEventName`); `register` no longer takes the `core` tier.
  The speculative ports `ModSurface`, `ModEnv`, `ModWatcher`, `ModTurnPort` are removed, and the
  mods name and limit tables are compared with the pulled reference.
- Permission modes (`rules/decide`), review fixes: a double-quoted `sh -c` script (also after
  `find -exec`) is read after the invoking shell expands it, a single-quoted one binds `$1` only
  when an argument follows; `cd logs && rm -rf a/*`, a backslash-only target, a volume-GUID path,
  the `\\?\C:\`, `\\localhost\C$` and 8.3 home spellings are critical paths; a command that does
  not parse gets the critical-path outcome in every mode. `ps`, `file` and `docker` join the
  read-only set with their documented prompt cases, a UNC argument on Windows and a write to a
  special shell variable (`for IFS in`, `unset PATH`) prompt. Under
  `blockReadsOutsideWorkingDirectories` a Bash command that reads outside the working directories,
  or that the parser cannot trace, prompts in every mode; under `blockWritesOutsideWorkingDirectories`
  settings files are refused inside the working directories too and plan files, the scratchpad and
  auto-memory Markdown stay writable. `--restricted` makes a classified protected-path write ask,
  the target of a symlinked settings file is its own option and asks in auto and plan, `dev-mods` and
  `CLAUDE_CONFIG_DIR` are protected, Bash `rm`, `mv` and `cp` go through the symlink check, and
  `acceptEdits` approves `Set-Content`, `Add-Content`, `Clear-Content` and `Remove-Item` in scope.
  `HookPermissionDecision` is re-exported from the SDK, and hook decisions and rule behaviors are
  read through registries.
- Permission modes (`rules/decide`): `decide(call, context)` answers allow, ask, deny or classify
  for one call in `default`, `acceptEdits`, `plan`, `auto`, `dontAsk` and `bypassPermissions`: deny,
  then ask, then allow with a compound Bash command allowed subcommand by subcommand, a PreToolUse
  hook's block, deny, ask and allow, a mod's block and approval (with managed settings or a Team or
  Enterprise login a mod cannot undo a deny rule, an ask rule or a hook's block), the read-only
  command set, `acceptEdits` filesystem commands in scope, protected paths and their exceptions per
  mode, critical-path `rm` and `rmdir` removals per mode, network-path reads, tools that require user
  interaction, `permissions.block{Reads,Writes}OutsideWorkingDirectories`, plan mode's bypass and
  auto-during-plan cases, and the broad allow rules auto mode drops. The `PermissionClassifier` port
  and `settleClassification` carry a `classify` decision to the host's reviewer.
- Marketplace file and names (`marketplace`): `readMarketplace` and `validateMarketplace` read the
  top level of `marketplace.json` (`name`, `owner`, `plugins`, `$schema`, `description`, `version`,
  `metadata`, the removal and rename keys) as Claude Code loads it and as `claude plugin validate`
  reports it, hand each entry to an `EntryReader` alone, and report unknown keys; the reserved-name
  rules (`marketplaceNameIssues`: official, community and directory names with the
  `github.com/anthropics/` exemption, impersonation, another spelling, `inline`, `npm`, JavaScript
  member names, `claudeai-`, the download-folder clash); `effectiveDescription` and
  `effectiveVersion`.
- Marketplace entries and the strict-mode merge (`marketplace`): `createEntryReader` and `readEntry`
  read each `plugins[i]` of `marketplace.json` alone (`name` as an install id with the documented
  messages, `source` handed to the plugin source parser, `description`, `version`, `category`,
  `tags`, `strict`, `dependencies`, `defaultEnabled`, `displayName`, `metadata`, every other
  `plugin.json` field, unknown keys, the archive-only `headers` and `headersHelper` reports, the
  version-versus-plugin.json warning, duplicate names, the quoted `relevance`, `metadata` and
  `experimental` warnings, and the typed `relevance` model with its limits and the `signals.hosts`
  rule); `mergeEntryWithManifest` combines an entry with the plugin's `plugin.json` as the strict-mode
  table says (the entry is the manifest without one; strict appends the component fields and the
  entry's hooks replace the manifest's per event; strict false with components is the
  `has conflicting manifests` error; the entry-only fields are ignored beside a `plugin.json`;
  `defaultEnabled` and the display fields come from the entry, `version` from the manifest, the
  entry name is the install id and the manifest name the namespace; a root-source entry that lists
  skills does not scan the default `skills/`; hooks as a path or an array are reported as not yet
  supported in a marketplace entry). `EntrySlot.mode`, `ReadMode` and duplicate-name detection join
  the marketplace assembly.

- Settings, skills: the `disableBundledSkills` decision now says built-in commands and `/doctor` stay
  typable (`builtInCommandsTypable`); tests cover a `--settings` own-name entry that does not beat an
  alias, the same alias set in managed and `--settings` files, a parent `true` against a lower
  `false`, and a parent `false` under a managed `true`; the repair of an unknown `skillOverrides`
  state is recorded in `spec/judgments.md`, and the non-Boolean managed
  `disableSkillShellExecution` test sits with the judgments.

- Command hooks and Markdown content of a plugin: `resolveHookCommand` (exec form substitutes
  `command` and each `args` element including `${user_config.*}`; shell form through bash or
  PowerShell refuses `${user_config.*}` with the documented error, `${env:NAME}` placeholders for
  PowerShell, the path and option variables the process receives) and `substituteContent` (path
  variables and non-sensitive options in a skill, command or agent body, a placeholder for a
  sensitive one), with the `HOOK_GUARD` message.

### Fixed (policy completion)

- resolveEnv resolves settings environment values with scope, trust and launch-environment rules; envChange and envAfterCd model later application without unsetting removed variables. General readers cover agent view, theme, teammate mode, worktree settings, processWrapper argv parsing, command-line hook gates and plugin defaults. The host supplies the startup-safe variable classification and performs process execution.
### Fixed (content completion)

- Split subagent context by responsibility: persistent memory, preloaded skills and scoped MCP servers; add folder trust diagnostics and model allowlist substitution. The host still owns provider resolution, connections and prompt assembly.
### Fixed (exec completion)

- Hook output exposes classifierContext with its shared 2,000-character cap and classifierTrust; notes for unrecorded read-only lookups are discarded. reviewHookRewrite decides whether a changed call applies, is denied, or drops a further rewrite on a repeat. afterHandbackDenial counts the three retry notices; the host delivers them.
### Fixed (mods review completion)

- Preserve a refusal of the engine settings read even when an outer hook returns a value; use a typed plugin-layer merge, isolate engine toast ownership and cover a timeout after next.
