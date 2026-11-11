# `@rsaryev/llx-plugin/marketplace`

Marketplaces, installs, updates and uninstalls, and the plugin store.

One row per export; `scripts/check-docs.ts` (DOC3) keeps this table equal to the entry's exports.

| Name | Kind | What it is |
| --- | --- | --- |
| `Acceptance` | type | "Claude Code shows them the new command and asks them to accept it." |
| `ACCEPTED_SOURCE_FORMS` | constant | The accepted forms a bare name or hostname is told about (`Invalid marketplace source format`) |
| `AddFailure` | type | The `failure` argument of `addFailureMessage` |
| `addFailureMessage` | function | The line a failed add ends with |
| `afterBackgroundCheck` | function | "After the check, Claude Code does one of the following." |
| `afterCommandRun` | function | "When the command's hashed output has changed, Claude Code installs the result as a new version and reloads it in the running interactive session" |
| `afterDisabling` | function | Disabling the holder (a copy managed settings do not turn on) and reloading registers the remaining copy's hooks |
| `afterReclone` | function | "If that clone fails, the existing checkout stays in place." |
| `AfterRun` | type | What `afterCommandRun` returns |
| `agedCopies` | function | The dated copies among `entries` that are older than `cleanupPeriodDays` at `nowMs` |
| `AgedName` | type | A name directly under the plugins root and when it was last written, in Unix milliseconds |
| `alreadyAddedFromDifferentSource` | function | The error of adding a marketplace already added under the same name from another source |
| `alreadyInstalledAtScope` | function | What `claude plugin install` prints for a plugin already installed at the target scope (exit 0) |
| `alreadyInstalledGlobally` | function | `/plugin install` refuses a plugin already installed globally: `Plugin '<name>@<marketplace>' is already installed globally. Use '/plugin' to manage existing plugins.` |
| `answerEffect` | function | What an answer to a plugin hint does |
| `ANY_CASING_NAMES` | constant | Reserved "in any casing" (requires Claude Code v2.1.275 or later) |
| `ApplyMoment` | type | When an install takes effect in a session |
| `ApplyOrigin` | type | Where an install was made: `claude plugin install` in a shell, or the host's own install surface |
| `applySeeds` | function | The registry after the seeds: every user entry, replaced where a seed declares the same name, and every seed marketplace the user has no entry for |
| `ARCHIVE_LIMITS` | constant | The limits of an `archive` source: the download and the extraction ("Stay within the download limits") |
| `archiveDownloadHeaders` | function | The headers of an archive download: the `url` source's when the archive is on its origin, then the entry's over them |
| `ArchiveEntry` | type | One entry of a zip as its central directory lists it: the path as stored (`/`-separated |
| `ArchiveFailure` | type | Why an archive download failed: `corrupt` or `aborted` |
| `ArchiveFetchPlan` | type | The `plan` argument of `fetchArchive` |
| `archiveIntegrityMessage` | function | The message of a `sha256` pin that does not match, as the docs print it whole |
| `ArchiveLimits` | type | The download and extraction limits of an `archive` source |
| `ArchivePorts` | type | Fetching an `archive` source: the download goes through `HttpClient`, the digest through `Sha256` |
| `ArchiveReader` | type | The `archive` field of `ArchivePorts` |
| `ArchiveScan` | type | What a scan of a zip returns: every entry, in archive order |
| `archiveStats` | function | The totals of a scan: derived, never reported by the host, so the limits cannot be argued with |
| `ArchiveStats` | type | What the kit judges about an archive: the documented extraction limits and the plugin root |
| `ArmedPass` | type | What `armFirstPass` returns |
| `armFirstPass` | function | Call this after the first message |
| `AutoUpdateCandidate` | type | The plugins the auto-update pass leaves alone |
| `autoUpdateDecision` | function | Whether auto-update moves a constrained dependency, and to what: to the highest tag that satisfies every installed plugin's range |
| `AutoUpdateDecision` | type | What auto-update does with a dependency that installed plugins constrain |
| `AutoUpdateFacts` | type | Which marketplaces auto-update, and whether the pass runs at all |
| `AutoUpdateInput` | type | The `input` argument of `autoUpdateDecision` |
| `autoUpdatePassAllowed` | function | Whether the pass runs, and the Enable auto-update toggle shows |
| `AutoUpdateSkip` | type | What `pluginSkippedByAutoUpdate` returns |
| `backgroundCheckAuthenticates` | function | Whether the unattended update check of a private marketplace authenticates; a token in the environment does not count |
| `backgroundCheckResult` | function | What the unattended check finds: a remote it cannot reach, or cannot authenticate to (a helper that must prompt "fails quietly"), is `cannot-reach-or-authenticate` |
| `CachedCopy` | type | The cached copy of an enabled plugin, as far as the note goes |
| `CacheLink` | type | A link of a link-mode cache entry: one per top-level entry of the printed directory |
| `catalogDependencies` | function | The `dependencies` of a `CatalogPlugin`: its `plugin.json`'s, then its marketplace entry's, in the order `mergeEntryWithManifest` lists them |
| `CatalogPlugin` | type | What the marketplace catalog says about a plugin the dependency graph may have to install |
| `Channel` | type | One of `CHANNELS` |
| `ChannelManifests` | type | The `manifests` argument of `checkReleaseChannels` |
| `ChannelManifestVersions` | type | The `version` of each plugin's `plugin.json` at the ref a channel points at, by plugin name |
| `CHANNELS` | constant | The version policy of Claude Code itself |
| `channelSwitch` | function | What the user settings change when the channel is picked under **Auto-update channel** in `/config` |
| `ChannelSwitch` | type | The `request` argument of `channelSwitch` |
| `checkDeclaredDependency` | function | The load-time check of one declared dependency against what is installed or loaded locally |
| `checkDependency` | function | Whether a dependency is met given both places it can be |
| `CheckFollowUp` | type | What `afterBackgroundCheck` returns |
| `checkForUpdate` | function | The outcome of an update check for a plugin whose installed version is `installed`: a plugin that loads in place is never compared, whatever its version string says |
| `checkInstalledDependency` | function | Whether a declared dependency is met by its installed copy: `Dependency "<dep>" is not installed`, `... is disabled`, and `Requires "<dep>" <range>, installed <version>` |
| `checkReleaseChannels` | function | What is wrong with `first` and `second` as the two catalogs of a channel pair |
| `CheckResult` | type | What the check found |
| `ChosenScope` | type | The scopes a user chooses between in a command or the `/plugin` panel: the three settings files |
| `classifySpecifier` | function | The kind of an npm dependency specifier |
| `classifyStoreEntry` | function | What an entry of the plugin store folder is |
| `CLAUDE_COMMANDS` | constant | The commands the required range does and does not stop: everything else is a start |
| `ClaudeCommand` | type | One of `CLAUDE_COMMANDS` |
| `clonePlan` | function | The environment and SSH program of a clone, for an HTTPS credential helper (prompts off), an SSH key that "must work without a passphrase prompt", |
| `ClonePlan` | type | What `clonePlan` returns |
| `CloneTransport` | type | How Claude Code clones with the credentials already on the machine: pure, the host runs git |
| `closePanel` | function | What closing the `/plugin` panel does: runs `/reload-plugins` when it has pending changes |
| `collaboratorInstallCommand` | function | What a collaborator runs once after the project's `.claude/settings.json` enables the plugin |
| `combineRanges` | function | The tag a dependency resolves to when several installed plugins constrain it: the highest that satisfies every range |
| `CommandDeclaration` | type | The command and `mode` a user accepted, or that the catalog declares now |
| `CommandFetchPlan` | type | The `mode` field of `FetchedCommandPlugin`; The `plan` argument of `runCommandSource` |
| `CommandPlugin` | type | The `plugin` argument of `commandSourceRuns` |
| `CommandSourcePorts` | type | Running a `command` source: the command goes through the `CommandRunner` port, from the user's home directory |
| `commandSourceRuns` | function | The runs `event` brings about for one command-sourced plugin |
| `CommandSourceSetting` | type | The `setting` argument of `runCommandSource` |
| `CommandSurface` | type | The `surface` argument of `marketplaceCommand`; The `surface` field of `UpdateArguments` |
| `CommitFailure` | type | Why `StagedDirectory.commit` did not finish: `busy` (the new copy or the version folder stayed busy, with the file-system `code` such as `ENOTEMPTY`), `held` (Windows |
| `commitStagedPlugin` | function | Installs `stagedPath` at `destination` (moved whole, or materialized by `plan`) |
| `COMMUNITY_NAMES` | constant | The reserved names of the community marketplaces |
| `ComponentSummary` | type | What an enabled plugin adds to every session: pure over a plain summary of the plugin's components, so no layer above is needed |
| `Constraint` | type | An installed plugin that constrains `dependency` with a range |
| `constraintsOn` | function | The ranges installed plugins put on a dependency, once per constraining plugin |
| `contextEntries` | function | "for each skill, agent, and command that Claude can invoke on its own, the name and description are in Claude's context on every turn", in every session |
| `ContextEntry` | type | What `contextEntries` returns |
| `CopyLookup` | type | What "installed on a host that loads the copy" means for the `--plugin-dir` copy of a dependency |
| `copyModeHash` | function | The version of a `copy`-mode `command` source: "a hash of the copied files", 12 characters |
| `CopySweep` | type | What `sweepAgedCopies` returns |
| `copyThatLoads` | function | Which copy loads when a session-only plugin shares its name with an installed one: the session-only copy |
| `createEntryReader` | function | The entry reader of a marketplace, over the plugin source parser (pass it to `readMarketplace`) |
| `createStoreLayout` | function | The layout under `root` |
| `Credentials` | type | What authenticates a remote in the background |
| `crossMarketplaceDecision` | function | Whether a dependency from another marketplace may install, by the root marketplace's allow list |
| `CrossMarketplaceDecision` | type | What `crossMarketplaceDecision` returns |
| `CrossMarketplaceQuestion` | type | The `question` argument of `crossMarketplaceDecision` |
| `decideEnabledFetch` | function | What Claude Code does with an enabled plugin that has no install record on this machine |
| `decideInstallMode` | function | How the plugin is installed, or why it may not be |
| `Declaration` | type | The settings file that declares the marketplace under `extraKnownMarketplaces`, as the registry plans it |
| `DeclaredDependency` | type | A dependency as a manifest or a marketplace entry declares it: where it was declared decides what a cross-marketplace refusal does |
| `DeclaredIn` | type | Where the dependency is declared: it decides what a refusal does |
| `DeclaredPath` | type | The `path` argument of `escapedPathIssue` |
| `declaredSourceFix` | function | The fix the docs give first: "Use the declared source", typed as the entry writes it |
| `DEFAULT_CLEANUP_PERIOD_DAYS` | constant | The dated copies beside `installed_plugins.json` age out |
| `DEFAULT_MARKETPLACE_PATH` | constant | What the `path` of a `github` or `git` source defaults to ("Fields by type") |
| `defaultScope` | function | The scope a command acts on when `--scope` is omitted: `install` and `uninstall` use user scope |
| `DEPENDENCY_INSTALL_OPERATIONS` | constant | The operations that install any missing declared dependency |
| `DependencyCause` | type | What is wrong with the dependency: no copy meets it, its copy is off, or its version is outside the range |
| `DependencyCopies` | type | The two places a dependency that names a marketplace can be found |
| `DependencyErrorType` | type | The `errorDetails.type` `claude plugin list --json` carries for a dependency problem |
| `dependencyId` | function | `name@marketplace`, or `name` when the dependency has no marketplace (a plugin loaded from claude.ai names none) |
| `DependencyInstallOperation` | type | One of `DEPENDENCY_INSTALL_OPERATIONS` |
| `DependencyIssue` | type | A dependency problem, with the type the host reports it under and the facts a host words its own advice from |
| `DependencyMap` | type | The `dependencies` field of `PackageJson`; The `devDependencies` field of `PackageJson` |
| `dependencyRefusal` | function | Why a `package.json` dependency specifier gets no install; `undefined` for a registry package |
| `DependencyResolution` | type | The `input` argument of `resolveDependencyVersion` |
| `DependencySection` | type | One of `DEPENDENCY_SECTIONS` |
| `dependentsOf` | function | The enabled plugins that declare `id` as a dependency |
| `deprecatedPluginAdvice` | function | Advice for the two plugins that need it; `undefined` for every other: "you can leave your plugins and the marketplace as they are" |
| `DeprecatedPluginAdvice` | type | What `deprecatedPluginAdvice` returns |
| `DEPS_ORIGIN_OF_MODE` | constant | The install mode of `decideInstallMode` as the origin the dependency plan takes (`inline`: a session-only plugin, never an install mode) |
| `DepsOrigin` | type | Where the plugin's files lie, as far as the install goes (`InstallMode`, `InstallOrigin`) |
| `Dereference` | type | The `dereferences` field of `TreePlan` |
| `describeSource` | function | A source as the "already added from a different source" message writes it: `github:acme/plugins` for GitHub (the docs' example) |
| `desktopNameIssues` | function | Warnings for names Claude Desktop rejects: the reserved marketplace names and the 128-character grammar |
| `dialogLines` | function | The dialog's text: the command's first word, the plugin and the marketplace |
| `DIRECTORY_NAMES` | constant | The reserved names of the plugin directory marketplaces |
| `dirsToOrphan` | function | The version directories an update or uninstall leaves behind: those of `removed` inside the cache that no `remaining` record uses |
| `disableDecision` | function | Whether a plugin may be disabled |
| `DisableDecision` | type | What `claude plugin disable` does with a plugin other plugins still need |
| `discoverAnnotation` | function | The annotation that names the first matching signal; `command` is the matching command name of a `cli` signal |
| `DisplayFields` | type | The display fields users see in plugin listings and details: `displayName`, `description`, `author`, `homepage`, `repository`, `license` and `keywords` |
| `DowngradeAnswer` | type | The `/config` choice when moving from `latest` to `stable`: allow the downgrade, or stay on the current version |
| `downloadFolderIssues` | function | The refusal of a marketplace named like the download folder of another registered GitHub marketplace |
| `DownloadHeaderPorts` | type | The headers of a download: `headers` and `headersHelper` can be set on the marketplace's `url` source and on an entry |
| `DownloadHeaderRequest` | type | The `request` argument of `archiveDownloadHeaders` |
| `downloadLinkRefusal` | function | The refusal of a download link: it "must use `https`, unless it points at the installing user's own default npm registry" |
| `effectiveDescription` | function | `description`, or `metadata.description` when the top level has none ("Alternate location") |
| `effectiveDisplayName` | function | The name users see: the display name the merge settled on (the entry's, then plugin.json's), "when neither... sets one, users see the plugin's `name`" |
| `effectiveEnabled` | function | The value the winning scope writes for `id`, if any scope writes one |
| `effectiveTopic` | function | The phrase of "Working with <topic>?": `relevance.topic` |
| `effectiveVersion` | function | `version`, or `metadata.version` when the top level has none |
| `EmptyView` | type | Where the empty list shows: the **Discover** tab, or `claude plugin marketplace list` |
| `EnableBlock` | type | Why a dependency stops an enable |
| `EnabledFacts` | type | The `facts` argument of `decideEnabledFetch` |
| `EnabledFetchDecision` | type | What `decideEnabledFetch` returns |
| `enabledNotInstalled` | function | A project's settings enable the plugin, but it was never installed on this machine |
| `EnabledPlugins` | type | `enabledPlugins` of each scope: the value written for a plugin id, if any |
| `EnableIssue` | type | One dependency that stops the enable, with what the user can do about it |
| `enablePlan` | function | What enabling `id` at `target` does to its dependencies, transitively: the ones installed but disabled are enabled, dependencies first |
| `EnablePlan` | type | What `enablePlan` returns |
| `EnableSource` | type | The sources an `enabledPlugins` entry can come from (the table of "Find where a plugin is enabled") |
| `ENTRY_KEYS` | constant | Every key an entry knows: any other is reported as an unknown field |
| `EntryDeclaration` | type | The `declared` argument of `entryLayer` |
| `EntryHeaders` | type | A plugin entry's fields (`MarketplaceEntry`, or an inline entry in settings) |
| `entryLayer` | function | The header layer a marketplace entry declares for an archive download |
| `EntryMerge` | type | What loading the plugin from this entry gives |
| `EntryReader` | type | Reads one raw `plugins[i]` into an entry; never throws, an entry that cannot load is `undefined` |
| `EntryReading` | type | What reading one entry gave: the entry when it loads, and what was found either way |
| `EntrySlot` | type | Where an entry stands in its marketplace |
| `ErrorsTabEntry` | type | An entry of the `/plugin` **Errors** tab: "Each entry pairs a message with a guidance line." |
| `escapedPathIssue` | function | The issue that drops the path, or `undefined` when it stays inside the plugin |
| `failedToInstall` | function | The summary the `/plugin` menu closes with when none of the selected plugins installed: `Failed to install: <plugin> (<reason>)` |
| `failedToInstallPlugin` | function | `Failed to install plugin "<name>@<marketplace>": <message>`: the shell's prefix, with the plugin's real name |
| `failureOnce` | function | The returned function says whether this event and command have not failed yet this session, and remembers that they have |
| `fetchArchive` | function | Downloads the archive and judges it; the verified zip and its plugin root, or the issue that refuses it |
| `FetchedArchive` | type | The verified zip and where the plugin root is in it: `''` at the top, or the one directory down |
| `FetchedCommandPlugin` | type | What a successful run leaves for the host: the directory to copy or link, as read-only files |
| `FetchedPlugin` | type | What a fetch leaves: the plugin's files to read, or a directory the host staged them in (a git clone, an unpacked tarball) by absolute path |
| `fetchMarketplaceFile` | function | Downloads the marketplace file: its text, or the issue that refuses it |
| `FetchPlan` | type | How a plugin source is fetched, as data: the kit plans it, the host (or an engine over ports) runs it |
| `FetchPlanContext` | type | What planning a plugin fetch needs to know about the host and the marketplace it reads |
| `FetchPlanKind` | type | The kind of a fetch plan |
| `fetchSessionArchives` | function | Downloads the `--plugin-url` archives at startup; a failed one is a load error and never stops the others |
| `findDependencyCopy` | function | The copy that meets a dependency entry: the one installed from the marketplace, else the `--plugin-dir` copy of the same name |
| `firstPassDelayMs` | function | A delay in `[0, 10 minutes]` from a source of numbers in `[0, 1]` (anything outside is clamped) |
| `FirstPassOptions` | type | The `options` argument of `armFirstPass` |
| `FolderChange` | type | The first segment of every standard component location but the manifest's: what a plugin has at its top level |
| `folderChanges` | function | What an interactive session does when the folder's plugins change after startup |
| `FolderCollision` | type | What `folderCollisions` returns |
| `folderCollisions` | function | The incoming ids that cannot be installed |
| `folderOf` | function | The folder name an id maps to: `.` and `@` written as `-`, capitals folded where the platform does |
| `FolderPlatform` | type | Two plugin ids that share one folder |
| `footprintGuide` | function | Where a person sees a plugin's footprint before and after installing it |
| `FootprintGuide` | type | The three stages the docs name and where to look or what to run at each |
| `GitFetchPlan` | type | The plan of a git fetch: the repository, ref and sha |
| `GitRepository` | type | The repository a tag listing is about: a GitHub `owner/repo` shorthand or a git URL |
| `GitTags` | type | Lists the tags of a plugin's repository, so dependency tag resolution runs without git |
| `GitTagsFailure` | type | What `GitTags.list` returns |
| `gitUrlRefusal` | function | A protocol it doesn't support, and an address git could read as naming a different server than the one shown, are refused with `Invalid git URL` and the reason |
| `GraphFacts` | type | The `facts` argument of `checkDeclaredDependency`; The `facts` argument of `constraintsOn` |
| `HEADER_ORIGINS` | constant | Where the declaration lives: a `marketplace.json` entry (`catalog`), or a settings file |
| `HEADER_PLACES` | constant | The two places `headers` and `headersHelper` can be set |
| `HeaderLayer` | type | One `headers`/`headersHelper` declaration, with what the policy needs to know about it |
| `HeaderMap` | type | Header names are lower case, as on the ports (`HttpRequest`) |
| `HeaderOrigin` | type | One of `HEADER_ORIGINS` |
| `HeaderPlace` | type | One of `HEADER_PLACES` |
| `HeadersHelperPorts` | type | Running a `headersHelper` command: through the `CommandRunner` port, from the configuration directory, under 10 seconds |
| `HeadersSetting` | type | What the host knows when it asks |
| `HELPER_REASONS` | constant | Why a command did not run |
| `helperAllowed` | function | Whether the layer's command may run now, or why not (and what that does to the download) |
| `helperCache` | function | A cache of command runs over the clock (`Clock.now`); keep one per host session |
| `HelperCache` | type | The `cache` field of `DownloadHeaderPorts`; What `helperCache` returns |
| `HelperEffect` | type | What a refused `headersHelper` does: skip the helper or refuse the download |
| `HelperReason` | type | One of `HELPER_REASONS` |
| `HelperVerdict` | type | What `helperAllowed` returns |
| `HINT_ANSWER_TIMEOUT_MS` | constant | "No answer for 30 seconds: counts as No." |
| `HintAnswer` | type | The three answers of the dialog |
| `HintEffect` | type | What `answerEffect` returns |
| `hintLine` | function | The one-line tag for a plugin in an official marketplace |
| `HookCopy` | type | One copy of a plugin name that declares hooks |
| `HookNote` | type | What `afterDisabling` returns |
| `HostFetchPlan` | type | What only the host can do: a git clone with sparse checkout, an `npm pack` |
| `HttpFilePlan` | type | Running the `http-file` plan of a `url` marketplace source |
| `IdPart` | type | The `part` argument of `desktopNameIssues`; The `part` argument of `pluginIdIssues` |
| `IgnoreChecks` | type | What the host found out about the entry's location (the clone's folder, or the local path it was added from) |
| `ignoredLine` | function | The line `claude plugin list` prints (text), or the Errors tab entry (message and guidance) |
| `ignoredReason` | function | Why an entry is ignored, or `undefined` when it loads: the first check that fails, in the order the docs list them (location, git URL or URL, settings declaration, name) |
| `IgnoredReason` | type | The `reason` argument of `ignoredLine`; What `ignoredReason` returns |
| `IgnoredSettings` | type | Why a settings file does not load: a value Claude Code does not accept (`keys` names the settings in file order) or a top level that is not an object |
| `IgnoredSurface` | type | Where the line shows: `claude plugin list` (one line, name bare) or the `/plugin` Errors tab (name quoted, fix beneath) |
| `inlinePluginId` | function | `<name>@inline`: "a plugin that `--plugin-dir`, `--plugin-url`, `CLAUDE_CODE_PLUGIN_DIRS` or the Agent SDK `plugins` option loaded" |
| `INSTALL_COMMANDS` | constant | "You can run `/plugin install` in a session or `claude plugin install` in your shell." |
| `INSTALL_TIMEOUT_MS` | constant | "Claude Code stops an install that runs longer and treats it as failed." |
| `installActivation` | function | Whether an install activated the plugin, and the line its summary ends with |
| `InstallActivationFacts` | type | The `facts` argument of `installActivation` |
| `installClosure` | function | The plan that installs, enables or updates the dependencies of `request.root`, transitively and dependencies first |
| `InstallCommand` | type | What an install command does on each surface: pure plans of what the command opens, adds, asks and prints; the host runs them |
| `InstallCommandPlan` | type | What `planInstallCommand` returns |
| `InstallDecision` | type | What `decideInstallMode` returns; The `decision` field of `InstallFinish` |
| `InstalledDependency` | type | A dependency as the host found it: its version, whether it is enabled, and whether it is a `--plugin-dir` copy |
| `InstalledForUpdate` | type | A plugin the user installed, with what decides whether a bulk update may touch it |
| `InstalledPlugin` | type | A plugin the user has installed, and the scopes it is installed or enabled in |
| `InstalledPluginsPorts` | type | Reading `installed_plugins.json` through `PluginStateStore` and doing what the troubleshooting page says Claude Code does with a file it cannot use |
| `InstalledPluginsRead` | type | The `read` field of `LoadedInstalledPlugins`; What `parseInstalledPlugins` returns |
| `InstalledRecord` | type | One install of a plugin at one scope (`installed_plugins.json`) |
| `InstalledRecords` | type | Plugin id (`name@marketplace`) to its installs, one per scope (and project) |
| `InstallFailure` | type | The `failures` argument of `failedToInstall` |
| `InstallFinish` | type | The `input` argument of `planInstallFinish` |
| `InstallFinished` | type | What `planInstallFinish` returns |
| `InstallHost` | type | Where a plugin is installed from and what each place does: one table of facts per host, read only through the plans below, which a host runs |
| `installLocationFor` | function | Where the registry says a marketplace is: `marketplaces/<name>/` for one added from GitHub, another Git host or a URL |
| `InstallMode` | type | How a plugin is installed: loaded where it lies, copied into the cache, or linked from the cache entry |
| `InstallOrigin` | type | Where a plugin came from, as far as how it is installed goes |
| `installOutcome` | function | What a finished run means: installed, or failed with its cause and the end of its output |
| `InstallOutcome` | type | What `installOutcome` returns |
| `InstallPlan` | type | What `installClosure` returns; The `dependencies` field of `AddConclusion` |
| `InstallRecord` | type | The `removed` argument of `dirsToOrphan`; The `remaining` argument of `dirsToOrphan` |
| `InstallRequest` | type | The `request` argument of `installClosure` |
| `installsAt` | function | The records that apply at `at`, by plugin id in file order; a plugin none of whose records apply is left out |
| `InstallsAt` | type | Where the session runs: the project folder whose `.claude/` settings it reads, if any |
| `InstallScope` | type | The SDK's setting sources but `flag` (the `--settings` tier), which the docs do not name as a scope a plugin is installed in |
| `InstallStart` | type | Installing a marketplace plugin as two pure steps |
| `InstallStartInput` | type | The `input` argument of `planInstallStart` |
| `InstallStep` | type | The `steps` field of `InstallPlan`; The `steps` field of `InstallEffects` |
| `installSummary` | function | The summary after the scope is chosen: "Active now" (`Plugin is now active.`), active with a server that needs setup, "Reload needed" (`Run /reload-plugins to apply.` |
| `InstallSummary` | type | What `installSummary` returns |
| `InstallSurface` | type | Where an install was typed: `/plugin install` in a session, or `claude plugin install` in a shell |
| `installWith` | function | What to use to install and manage plugins on the host |
| `InstallWith` | type | What to use to install and manage plugins on a host |
| `isBlockedHost` | function | True when `hostname` (as `URL.hostname` writes it, IPv6 in brackets) is loopback, link-local or a metadata host |
| `isCredentialVariable` | function | True for a variable name that looks like a credential, by the pattern or the fixed list |
| `isEnabled` | function | Whether an installed plugin is on: the value the winning scope writes, else its `defaultEnabled` ( |
| `isInstalledGlobally` | function | A plugin installed at user scope or by managed settings is "already installed globally" |
| `isPluginIdPart` | function | Whether a text is a valid part (plugin or marketplace name) of a plugin id |
| `isUpdate` | function | Whether `computed` is an update over what `installed_plugins.json` records for the plugin |
| `isVersionSegment` | function | Whether a version can name one folder: "The version also names the plugin's cache directory", so a version that is empty, `.` |
| `isWithin` | function | True when `path` is `root` or inside it, by whole path segments (both in one `/` spelling) |
| `KnownMarketplace` | type | `known_marketplaces.json`, "each marketplace Claude Code has fetched, with its `source`, `installLocation`, `lastUpdated`, and `autoUpdate`", one per user |
| `KnownMarketplaces` | type | The `marketplaces` field of `KnownMarketplacesRead`; The `known` argument of `planMarketplaceStartup` |
| `KnownMarketplacesRead` | type | What `parseKnownMarketplaces` returns |
| `KnownVersions` | type | What the host knows of the releases: the installed version and what each channel serves |
| `Layer` | type | The three layers of overview.md: settings, disk and session |
| `LeftOut` | type | A dependency the install leaves out; the dependent then fails to load until the user acts |
| `LeftOutReason` | type | Why Claude Code does not install a dependency itself |
| `LeftReason` | type | The `reason` field of `LeftToUser` |
| `LeftToUser` | type | The `leftToUser` field of `UpdatePlan` |
| `LfsPointer` | type | What `readLfsPointer` returns |
| `lfsPointerIssue` | function | The warning for a plugin file that is a pointer: the plugin needs the real file and cannot get it |
| `lfsPointerIssues` | function | The install check for a git-based plugin that was cloned |
| `linkedPluginLoads` | function | "a session started in the printed directory or anywhere below it doesn't load" a link-mode plugin |
| `linkModeHash` | function | The version of a `link`-mode `command` source: "the printed directory's real path and its top-level entries, not... the files inside them" |
| `linkReach` | function | Where a target resolves: "Within the plugin's own directory", "Elsewhere within the same marketplace", or "Outside the marketplace" |
| `LinkReach` | type | What a link's resolved target is, relative to the plugin and, when it has one, its marketplace |
| `listingFields` | function | The display fields of one plugin as users see them at `stage` |
| `ListingStage` | type | Whether the listing is of a plugin not installed yet (`listed`) or one whose files are on disk (`installed`) |
| `LoadedInstalledPlugins` | type | What `loadInstalledPlugins` returns |
| `loadInstalledPlugins` | function | Reads the records and applies the recovery the read calls for |
| `loadNameIssues` | function | What adding or loading a marketplace refuses about its name, on top of `validationNameIssues` |
| `loadsInPlace` | function | Whether a marketplace plugin is loaded in place rather than copied into the cache |
| `loadsInstalledPlugins` | function | Whether plugins installed on the machine, or enabled by the repository, load on the host; `undefined` where the docs say nothing |
| `LocalCopy` | type | A plugin loaded for one session with `--plugin-dir`: it is `<name>@inline`, whatever its manifest says |
| `LockedOrigin` | type | A package the lockfile pins to something other than a registry version |
| `LOCKFILE_NAMES` | constant | The lockfiles the install reads, in the order Claude Code checks them: "the first match" |
| `LockfileFacts` | type | The `lockfiles` field of `NodeDepsInput`; What `readLockfile` returns |
| `LockfileName` | type | One of `LOCKFILE_NAMES` |
| `lookupPlugin` | function | Installing looks a plugin up by its entry name only |
| `ManifestFact` | type | The `manifests` field of `SessionFacts` |
| `manifestFailureMessage` | function | The message of a plugin whose manifest is corrupt or invalid |
| `ManifestProblem` | type | What is wrong with `.claude-plugin/plugin.json` of a plugin that was fetched: not JSON, or JSON that fails the schema |
| `Marketplace` | type | The `first` argument of `checkReleaseChannels`; The `second` argument of `checkReleaseChannels` |
| `MARKETPLACE_FILE` | constant | Reading a marketplace's catalog once the host has it |
| `MARKETPLACE_SOURCE_KINDS` | constant | Every `source` kind of a marketplace source object |
| `MarketplaceAction` | type | A marketplace action: list, update or remove |
| `MarketplaceAdd` | type | What `marketplacesAddedAtStart` returns |
| `marketplaceAutoUpdate` | function | Whether the marketplace auto-updates: "the first of these that is set": the settings entry, the `known_marketplaces.json` entry, the default |
| `marketplaceCommand` | function | The command for an action, in a shell or in a session |
| `MarketplaceContext` | type | What the host knows about the marketplace it hands to the reader |
| `marketplaceDirectoryNotFound` | function | The marketplace's own directory is missing, such as a local marketplace that moved |
| `MarketplaceEntry` | type | The `entry` field of `LoadPluginInput`; The `entry` argument of `catalogDependencies` |
| `MarketplaceFetchPlan` | type | The plan of fetching a marketplace |
| `MarketplaceInputOptions` | type | The marketplace source `claude plugin marketplace add <source>` builds from the string you type: pure text in, a source or an issue out |
| `MarketplaceLoadStatus` | type | What `extraKnownMarketplaces` does with a source when the marketplace is added: the docs name two that parse and then fail to load |
| `MarketplaceMetadata` | type | The `metadata` field of `Marketplace` |
| `marketplaceNameIssues` | function | Every refusal a marketplace's name can draw: `validate`'s and adding or loading's |
| `MarketplaceResult` | type | What `readMarketplace` returns; What `readMarketplaceDirectory` returns |
| `marketplacesAddedAtStart` | function | The marketplaces Claude Code adds on its own at start |
| `MarketplaceSource` | type | A marketplace source (`MarketplaceSourceKind`); the `path` of git sources defaults to `.claude-plugin/marketplace.json` |
| `MarketplaceSourceKind` | type | One of `MARKETPLACE_SOURCE_KINDS` |
| `MarketplaceSourceOf` | type | The marketplace source of one kind |
| `MarketplaceSourceOptions` | type | Reading a marketplace source object: the `source` of an `extraKnownMarketplaces` value, or an entry of `strictKnownMarketplaces` and `blockedMarketplaces` |
| `matchesAtSessionStart` | function | `cwd` is "the only signal that can match at session start, before the user sends a first message" |
| `matchingSignals` | function | The signals that match, in the docs' order |
| `mergeEntryWithManifest` | function | The manifest a plugin loads with, given its marketplace entry and its own `plugin.json` (`undefined` when it has none) |
| `mergeHeaders` | function | `later` replaces a header of the same name in `earlier`: the entry's value over the source's |
| `MigratedKeys` | type | What `migrateSettingsKeys` returns |
| `MigratedScopes` | type | What `migrateSettingsScopes` returns |
| `migrateSettingsKeys` | function | Rewrites the keys of one `enabledPlugins` or `pluginConfigs` map for the marketplace registered as `marketplaceName` |
| `migrateSettingsScopes` | function | `migrateSettingsKeys` over the maps of each scope: user, project and local are rewritten |
| `missingMarketplace` | function | `Marketplace "<name>" not found` on `/plugin install <plugin>@<name>` |
| `MissingMarketplace` | type | What `missingMarketplace` returns |
| `MissingPluginFacts` | type | The three checks, in the docs' order, and what to do next |
| `ModeInput` | type | The `input` argument of `decideInstallMode`; The `platform` argument of `linkedPluginLoads` |
| `mostSpecificScope` | function | The highest-precedence scope among `scopes` that has a settings file; `managed` has none the user writes |
| `moveFailureMessage` | function | `Could not move the new copy of this plugin version into <path>: <why>` |
| `NameClash` | type | The `clash` argument of `copyThatLoads` |
| `NameOrigin` | type | The `where` argument of `loadNameIssues`; The `where` argument of `marketplaceNameIssues` |
| `namesMarketplace` | function | Whether a `dependencies` item names its marketplace |
| `nameTheMarketplace` | function | The fix for the lookup that found nothing: name the marketplace, so Claude Code refreshes it first |
| `nextStep` | function | The next step: the first check that fails, else what to do when the plugin loads with no error and still shows no skills |
| `NodeDepsFailureCause` | type | Why a plugin's Node dependency install failed |
| `NodeDepsInput` | type | The `input` argument of `planNodeDepsInstall` |
| `NodeDepsInstall` | type | The `plan` argument of `nodeDepsRun` |
| `nodeDepsNote` | function | The note on an enabled plugin whose cached copy has a lockfile and a `package.json` that lists runtime dependencies, but no `node_modules` |
| `NodeDepsNote` | type | What `nodeDepsNote` returns; The `shown` argument of `updateRetriesInstall` |
| `NodeDepsPlan` | type | The `plan` argument of `nodeDepsNote`; The `plan` field of `NodeDepsResult` |
| `NodeDepsResult` | type | What `planNodeDepsInstall` returns |
| `nodeDepsRun` | function | The process the host runs for an install: the plan, the host's environment and abort signal; output merged so a failure shows its cause |
| `NodeDepsSkip` | type | Why a plugin's Node dependency install was skipped |
| `NodeDepsSkipOf` | type | The skip of one reason, with the fields that reason carries |
| `NodeDepsSkipReason` | type | The `skipped` field of `TreePlan` |
| `noMarketplaces` | function | `No plugins available` on the Discover tab, `No marketplaces configured` from the list command: both mean no marketplace is registered, so there is no catalog |
| `NON_MARKETPLACE_NAMES` | constant | Names Claude Code gives plugins that come from no marketplace, and what each one means |
| `NormalizedDependency` | type | A dependency with its defaults applied: the marketplace is the declaring one when omitted |
| `normalizeDependency` | function | Reads one `dependencies` item |
| `normalizeHeaders` | function | Header maps as the kit passes them to a download: names lower case, as on the `HttpClient` port (`HeaderMap`) |
| `notCached` | function | `Plugin "<name>" not cached at <path>`: the install record points at a directory that is gone |
| `NoteKind` | type | The `kind` field of `NodeDepsNote` |
| `NpmFetchPlan` | type | The plan of an npm fetch: the package or tarball and the registry |
| `npmRefusalMessage` | function | `"<value>" was not installed: <reason>. An npm plugin source must name a registry package...`. The docs' example reason is `it is not an http or https link` |
| `OBJECT_MEMBER_NAMES` | constant | Member names every JavaScript object has (requires Claude Code v2.1.296 or later) |
| `OFFICIAL_NAMES` | constant | The names the docs print: one list per group, in the docs' order |
| `Orphan` | type | The `input` argument of `orphanSweep` |
| `ORPHAN_GRACE_MS` | constant | How long an orphaned version folder stays before cleanup removes it: 14 days |
| `ORPHANED_MARKER` | constant | The marker file (`.orphaned_at`) that sets a plugin version folder aside as orphaned |
| `orphanedAutoInstalled` | function | The auto-installed plugins at `scope` that no remaining plugin needs, transitive orphans included |
| `orphanMarkerPath` | function | The path of the marker that sets a plugin version folder aside as orphaned |
| `orphanSweep` | function | The directories the background cleanup removes now |
| `overriddenUserDisable` | function | `Disabled in ~/.claude/settings.json but still loads — project settings enable it, which overrides your user setting` |
| `Owner` | type | The `owner` field of `Marketplace` |
| `PackageJson` | type | The parts of a plugin's `package.json` the dependency install looks at |
| `PackageManager` | type | The Node.js package dependencies of a plugin |
| `PanelClose` | type | What `closePanel` returns |
| `parseInstalledPlugins` | function | What a file's text says |
| `parseKnownMarketplaces` | function | The registry's text; no file is no marketplaces |
| `parseMarketplaceInput` | function | The source the input stands for, or the issue that says it is none |
| `parseMarketplaceSource` | function | The marketplace source an object describes |
| `parsePluginSource` | function | The plugin source of `plugins[i]`: the source, or `undefined` with the issues that say why |
| `parseReleaseTag` | function | The version a tag names for `name`, or `undefined` for another plugin's tag or one whose version is not strict semver |
| `parseReloadArguments` | function | `/reload-plugins [--force]`; "`force` without dashes works too" |
| `PassMarketplace` | type | The `marketplaces` argument of `planAutoUpdatePass` |
| `PassPlan` | type | What `planAutoUpdatePass` returns |
| `PathJoin` | type | `base` and a `/`-separated relative path joined the way the host writes paths (`Locations.joinPath`) |
| `pickAllowedVersion` | function | What a background auto-update or `claude update` installs: the channel's version, unless it is already installed or the policy rules it out |
| `pinInDiscover` | function | The Discover tab pins the plugin the first time the tab opens while a signal matches; neither tip setting affects it |
| `planAutoUpdatePass` | function | One pass: nothing when the environment turns it off, otherwise per auto-update marketplace its plugins less the skipped |
| `planInstallCommand` | function | Plans an install command |
| `planInstallFinish` | function | After the fetch: the cache folder and the record |
| `planInstallStart` | function | Before the fetch: its plan and how the plugin will be installed |
| `planMarketplaceFetch` | function | How the marketplace file is fetched, or why it cannot be |
| `planMarketplaceStartup` | function | What a session start does with the marketplaces: plugins load from the records and cache, without the network |
| `Planned` | type | Planning how a plugin source is fetched: pure, a source and what the host knows in, a `FetchPlan` or the issues that refuse it out |
| `planNodeDepsInstall` | function | Whether and how Claude Code installs a plugin's Node.js packages |
| `planPluginApply` | function | When an install takes effect: from a shell, at the next start or on `/reload-plugins`, whatever the host |
| `planPluginCommand` | function | What `/plugin` does on a host: "run `/plugin` with no plugin name: the panel opens on the Discover tab"; with a name it opens that plugin's details |
| `planPluginFetch` | function | How `source` is fetched, or why it may not be |
| `planPrune` | function | `claude plugin prune` as a decision: with none to remove a line that starts `Nothing to prune`; `--dry-run` lists them and ends `(dry run — nothing removed)` |
| `planTreeCopy` | function | A plan of copying `entries`; `limits` apply to a tree that is copied whole (a `command` source in copy mode) |
| `planUninstall` | function | `claude plugin uninstall <id> [--prune]` as a decision: the plugin goes |
| `planUpdate` | function | What `request` does |
| `PLUGIN_ID_PART` | constant | Each part of a plugin id, `plugin@marketplace`: letters a-z and A-Z, digits, `.`, `_` and `-`, starting with a letter or digit |
| `PLUGIN_OPERATIONS` | constant | What the user is doing when an entry's archive is about to be downloaded |
| `PLUGIN_SOURCE_KINDS` | constant | The seven ways a plugin entry's `source` can name where the plugin lives: a relative path string, or an object whose `source` field is one of the other six |
| `PLUGIN_TELEMETRY_EVENTS` | constant | The plugin and marketplace names an OpenTelemetry event reports |
| `PluginActionFacts` | type | The `facts` argument of `pluginActions` |
| `pluginActions` | function | The items of a plugin's details menu: `Disable plugin` or `Enable plugin`, `Update now` and `Uninstall` |
| `PluginCommandPlan` | type | What `planPluginCommand` returns |
| `pluginDirArgument` | function | What a `--plugin-dir` argument names: "a directory or a `.zip` archive of one" |
| `pluginDirDependencyIssues` | function | The `--plugin-dir` plugins of a session that do not load for a dependency |
| `PluginDirectories` | type | Opens a directory the host names by absolute path (the directory a `command` source printed) as read-only plugin files rooted there |
| `pluginDirectoryMissingAtRun` | function | A plugin hook's failure when the directory the session loaded its hooks from is gone |
| `pluginDirectoryNotFound` | function | An enabled plugin its marketplace lists by relative path, with no directory at that path |
| `PluginDirPlugin` | type | A plugin a session loads with `--plugin-dir`: its name and its manifest's `dependencies` |
| `PluginHint` | type | A hint that parsed: `value` is `name@marketplace` |
| `pluginIdIssues` | function | What a marketplace or entry `name` breaks before it can be part of an id |
| `PluginLookup` | type | What `lookupPlugin` returns |
| `pluginNames` | function | The names of a plugin from its entry merge; a plugin that fails to load keeps its entry name, as it still has an id |
| `PluginNames` | type | The two names of a marketplace plugin |
| `pluginNotFound` | function | `Plugin "<name>" not found in marketplace "<marketplace>"`, with a hint when Claude Code did not refresh the marketplace before the lookup |
| `PluginNotFound` | type | What `pluginNotFound` returns |
| `pluginNotFoundAnywhere` | function | `Plugin "<name>" not found in any marketplace` in a session; `claude plugin install` says `any configured marketplace` |
| `PluginOperation` | type | One of `PLUGIN_OPERATIONS` |
| `PluginRef` | type | A plugin as `<name>@<marketplace>`: the two parts the commands use, never split out of one string |
| `pluginRootIssue` | function | The refusal for a plugin directory of a fetched marketplace that is, or passes through, a link that resolves outside the marketplace |
| `pluginSkippedByAutoUpdate` | function | Whether the pass skips the plugin |
| `PluginSource` | type | A parsed plugin source |
| `PluginSourceKind` | type | One of `PLUGIN_SOURCE_KINDS` |
| `PluginStateStore` | type | The files Claude Code keeps directly under the plugins root, read, written and removed by name |
| `PluginSummary` | type | The `plugin` argument of `contextEntries`; The `plugin` argument of `processesOf` |
| `pluginUpdatedNotice` | function | What the running session shows after a plugin updated on disk: it keeps the version it loaded |
| `pluginUrls` | function | `--plugin-url`: "Repeat the flag, or pass the URLs space-separated in one quoted argument." |
| `PluginVersion` | type | The `version` field of `InstallFinish`; What `resolvePluginVersion` returns |
| `PrecheckOutcome` | type | The update check before the fetch, or `fetch` when only what the fetch brings can decide |
| `precheckUpdate` | function | The update check a host can run before it fetches |
| `PreviousCopy` | type | What became of the copy that was installed before, when moving the new one in failed |
| `PrintedDirectory` | type | What the command printed and where the session started, for the checks that need them |
| `Processes` | type | What `processesOf` returns |
| `processesOf` | function | The processes a plugin starts: its MCP servers and hook events |
| `PromptFacts` | type | What the host knows when a hint arrives |
| `PromptRefusal` | type | Why a plugin hint does not prompt |
| `promptVerdict` | function | Whether the **Plugin recommendation** dialog shows for a hint |
| `PromptVerdict` | type | What `promptVerdict` returns |
| `PruneOutcome` | type | What `planPrune` returns |
| `PruneRun` | type | What prune shows and does, by the flags and the terminal |
| `rangesOverlap` | function | Whether some version satisfies all of `ranges` (each valid) |
| `readEntry` | function | Reads one raw `plugins[i]`; never throws |
| `readLfsPointer` | function | The pointer a text is, or `undefined` for any other text |
| `readLockfile` | function | The facts of a lockfile's text; text that is not JSON has no version, so no install runs from it |
| `readMarketplace` | function | The parsed `marketplace.json` as Claude Code loads it: an error in a top-level field or in the name keeps the marketplace from loading |
| `readMarketplaceDirectory` | function | The marketplace of a directory, through `files` rooted at it |
| `readMarketplaceText` | function | The marketplace a `marketplace.json` text holds |
| `ReadMode` | type | Loading drops what Claude Code refuses; validating also reports what only `claude plugin validate` checks |
| `readPackageJson` | function | A parsed `package.json` value narrowed to the parts the install reads; `'unreadable'` for a value that is not an object |
| `ReadPackageJson` | type | A `package.json` that is there but is not a JSON object |
| `readVersionPolicy` | function | Reads the Claude Code version policy from the settings layers; the highest-precedence valid channel wins |
| `RECORDS_UNREADABLE_CODE` | constant | `failureCode` of `--json` on those three commands when a record cannot be read |
| `RecordsRefusal` | type | The `refusal` argument of `refusalResultLine`; What `refuseForUnreadableRecords` returns |
| `recoveryNotes` | function | The notes `claude plugin list` prints "for as long as" a dated copy "sits beside `installed_plugins.json`" |
| `refreshBeforeInstall` | function | What to refresh before the lookup of `request.ref` |
| `RefreshDecision` | type | What `refreshBeforeInstall` returns; The `refresh` field of `PendingInstall` |
| `refreshFailed` | function | "When the refresh fails, the install proceeds from the cached catalog and `claude plugin install` reports `marketplace not refreshed`." |
| `RefreshFailure` | type | What `refreshFailed` returns |
| `RefreshRequest` | type | The `request` argument of `refreshBeforeInstall` |
| `RefusalEffect` | type | What a refusal does: a marketplace entry's refuses the install; `plugin.json`'s installs without the dependency, and the plugin then fails to load |
| `refusalResultLine` | function | The last line of stdout of `claude plugin install\|uninstall\|update --json` for that refusal |
| `refuseForUnreadableRecords` | function | How `claude plugin install`, `uninstall` and `update` refuse |
| `RefusingCommand` | type | The three commands that refuse while a record cannot be read, with the word their refusal uses |
| `RegisteredMarketplace` | type | A registered marketplace, as far as the download-folder rule needs it |
| `RegistryEntry` | type | What `applySeeds` returns |
| `RegistryFailureCode` | type | Why `known_marketplaces.json` failed to read: `unreadable` or `corrupted` |
| `reinstallCommand` | function | The shell command that re-downloads a plugin whose record exists but whose directory is missing |
| `relativeFrom` | function | `rel` (a path below the plugin root) as a path from the folder `fromDirectory` (also below it) |
| `releaseTag` | function | `<plugin-name>--v<version>` |
| `ReleaseTag` | type | A release tag and the version it names |
| `Relevance` | type | The `entry` argument of `effectiveTopic`; The `relevance` field of `MarketplaceEntry` |
| `RelevanceSignals` | type | `relevance` of an entry |
| `Relink` | type | The `relinks` field of `TreePlan` |
| `reloadAllowed` | function | In a session without an interactive terminal the command runs "only when you type it into the session yourself" |
| `ReloadChange` | type | The `change` argument of `reloadGate` |
| `ReloadCounts` | type | `/reload-plugins`: the one line it prints, whether the reload is applied or refused, and who may run it |
| `reloadGate` | function | Whether `/reload-plugins` applies, is refused for breaking the prompt cache, or applies with the MCP servers deferred |
| `ReloadGate` | type | What `reloadGate` returns |
| `reloadSummary` | function | The summary line `/reload-plugins` prints |
| `RemoteState` | type | What the host sees of the remote when the check runs |
| `REMOVED_STATUS` | constant | The status `/plugin` shows under its **Flagged** heading |
| `RemovedPlugin` | type | What `removedPlugins` returns |
| `removedPlugins` | function | The installed plugins a marketplace update removes or renames |
| `renameNotice` | function | The notice a user sees for `name` in `marketplace`, or nothing when it is current or unknown |
| `Renames` | type | The `renames` map of `marketplace.json`: each former plugin name maps to its current name |
| `RenameStatus` | type | What `resolveRename` returns |
| `reportedNames` | function | The names the event carries: real for the official tier or with `OTEL_LOG_TOOL_DETAILS=1`, else redacted or omitted |
| `ReportedNames` | type | What `reportedNames` returns |
| `RERUN_EVENTS` | constant | What starts a decision: an explicit install or update, the start of a session, `/reload-plugins` |
| `RerunEvent` | type | One of `RERUN_EVENTS` |
| `RerunPlan` | type | What `commandSourceRuns` returns; The `plan` argument of `runsAfterAnswer` |
| `resolveDependencyVersion` | function | What a dependency's constraint resolves against, by the kind of its plugin source: a tag of its own repository (`github`, `url`, `git-subdir` |
| `ResolvedHeaders` | type | The headers a fetch or download sends, once any command has run |
| `ResolvedVersion` | type | What the constraint was checked against: a tag, or the marketplace's current copy (`version` is its `plugin.json` version, absent when it has none) |
| `resolvedVersionLabel` | function | The version `claude plugin list` shows for a resolved dependency: a tag-resolved copy carries "a 12-character commit suffix, such as `2.1.0-8713c5b11005`" |
| `resolveHeaders` | function | The headers one place sends: its `headers`, with the command's output over them when the command may run |
| `resolvePluginsRoot` | function | The plugins root: `CLAUDE_CODE_PLUGIN_CACHE_DIR` when set, else `plugins` under the configuration directory (`CLAUDE_CONFIG_DIR` |
| `resolvePluginVersion` | function | The version of a plugin |
| `resolveRename` | function | Where `name` stands in `marketplace`: `current` when it is listed (a listed name wins over a key of the same name, judgment) |
| `RootDependencies` | type | The `root` field of `LockfileFacts` |
| `RUN_KINDS` | constant | The runs the docs list: "Every time you install or update", "Once per session", "installed version is missing" |
| `runCommandSource` | function | Runs the command and judges what it printed; the fetched plugin, or the issue that refuses it |
| `runHeadersHelper` | function | Runs the layer's command and reads what it printed; a layer without a command prints no headers |
| `RunKind` | type | One of `RUN_KINDS` |
| `RunResult` | type | What a finished run leaves to do with the version it produced |
| `runsAfterAnswer` | function | The runs that go ahead once the user has answered the question of `plan.acceptance`: a declined command never runs |
| `runsAs` | constant | "What the plugin runs, it runs as you." |
| `RunSkip` | type | The `skipped` field of `RerunPlan` |
| `sameMarketplaceSource` | function | An entry that sets a `ref` you did not pass differs, and so does a `github` entry from the same repository as an https URL (recorded as `git`) |
| `scopeChoices` | function | The scopes the host's install surface offers, in the order the docs list them; none without a surface |
| `ScopedCommand` | type | The shell commands that take `--scope` and default when it is omitted |
| `ScopedSettings` | type | The `scopes` field of `MigratedScopes`; The `scopes` argument of `migrateSettingsScopes` |
| `scopeReach` | function | Where an install scope reaches |
| `ScopeReach` | type | Who a scope reaches, and in which projects |
| `SCOPES_BY_PRECEDENCE` | constant | The scopes from the one that wins to the one that loses, the one precedence table |
| `Seed` | type | One seed directory and the marketplaces its `known_marketplaces.json` declares |
| `SeededEntry` | type | What the kit needs of a registry entry |
| `selectSubmodules` | function | The submodules to fetch, in `.gitmodules` order |
| `selectTag` | function | The highest tag of `name` that satisfies `range`, with node-semver's rules: a range never matches a pre-release unless it opts in (`^2.0.0-0`) |
| `selectUninstall` | function | The install records an uninstall removes and those it keeps |
| `serializeInstalledPlugins` | function | The file's text for these records: two-space indented JSON and a final newline (a judgment) |
| `serializeKnownMarketplaces` | function | The registry's text, two-space indented with a final newline (a judgment, as for `installed_plugins.json`) |
| `SessionArchives` | type | What `fetchSessionArchives` returns |
| `SessionFacts` | type | The `facts` argument of `matchingSignals` |
| `sessionOnlyOffEntry` | function | `--plugin-dir` plugin ids are `<name>@inline`: the entry that keeps one from loading |
| `sessionOnlyRow` | function | The row of a session-only plugin (`--plugin-dir`, `--plugin-url`) in the list |
| `SessionOnlyRow` | type | How `claude plugin list` shows a session-only plugin |
| `sessionStartNoticeText` | function | The one-line notification of a `cwd` match at session start |
| `settingsIgnoredWarning` | function | The warning after the success line of `claude plugin install`, `enable`, `disable` and `claude plugin marketplace add` |
| `Sha256` | type | A SHA-256 digest of bytes as 64 lower-case hex digits (a port keeps `crypto` out of `src/`, L3) |
| `SharedThing` | type | What the two plugins would share: the section quotes both `its folder` and `its saved data` |
| `shellInstallLines` | function | What the shell prints, in order: the marketplace it added, then the install ("when it finishes") |
| `shellInstallPrelude` | function | The command a script runs before installing from the official marketplace on a fresh machine |
| `shorthandAttempts` | function | The transports tried in order for a GitHub `owner/repo`: `ssh -T git@github.com` first, SSH when it succeeds |
| `ShorthandFacts` | type | Facts about the machine the host reads |
| `shortHash12` | function | A hex digest cut to 12, lower case |
| `shouldEmitHint` | function | "Emit the tag only when `CLAUDECODE` or `CLAUDE_CODE_CHILD_SESSION` is set": what a CLI's gate reads |
| `showSessionStartNotice` | function | Whether the session-start notification shows the plugin: a `cwd` match, the spacing, and at most two showings |
| `showSpinnerTip` | function | Whether the spinner tip shows the plugin now |
| `SignalName` | type | Whether the signals of a `relevance` block match the session: pure, over the facts the host collected |
| `skillCount` | function | "The skills count covers every skill a plugin provides, both its `commands/` entries and its `SKILL.md` skills." |
| `skillsDirPluginId` | function | `<name>@skills-dir`: "`skills-dir` stands where a marketplace name would" |
| `SKIP_REASONS` | constant | Why nothing is refreshed |
| `SKIPPED_TUTORIAL_STEP` | constant | The tutorial step to skip |
| `SkippedBy` | type | The `skipped` field of `PassPlan` |
| `SkipReason` | type | The `skipped` field of `TreePlan` |
| `skipReasonText` | function | Why an install cannot run, as the clause that follows "because" in the note (`it has no package.json`) |
| `SourceFetcher` | type | The port that fetches a plugin's source by its fetch plan |
| `SourceParser` | type | The `parseSource` argument of `createEntryReader`; The `parseSource` argument of `readEntry` |
| `SourceParseResult` | type | What `parseMarketplaceSource` returns |
| `SourceReading` | type | What a plugin source parser returns: the source, or `undefined` with the issues that say why |
| `SpecifierKind` | type | What counts as a registry package (plugins/loading.md, "Limits on the dependency install" |
| `SpecifierRefusal` | type | What `specifierRefusals` returns |
| `specifierRefusals` | function | Every dependency of `package.json` that is not a registry package, with the reason |
| `spellingOf` | function | The reserved marketplace name a name spells after normalising, if any |
| `spinnerTipText` | function | The spinner tip that suggests a relevant plugin |
| `SshProgramFacts` | type | Where the user's git setup names an SSH program; the host reads these three |
| `Stage` | type | The `stage` field of `StageReport` |
| `StagedCommit` | type | One install of a staged directory into the cache |
| `StagedDirectory` | type | A directory a host staged a fetched plugin in, so it installs by moving that directory rather than copying files the kit read |
| `StagedFile` | type | The `stage` field of `NodeDepsInstall` |
| `StagedRemoveFailure` | type | What `StagedDirectory.remove` returns |
| `StageFacts` | type | How far a plugin got: an `enabledPlugins` entry is **declared** in settings, **fetched** to disk (`installed_plugins.json` records it and `cache/` holds its files) |
| `stageReport` | function | How far a plugin's install got: declared, recorded, cached and loaded |
| `StageReport` | type | What `stageReport` returns |
| `startGate` | function | "When the running version is older [newer], Claude Code exits at startup" |
| `StartRequest` | type | The `request` argument of `startGate` |
| `StartupAction` | type | What Claude Code does after the session starts for a marketplace that settings declare |
| `StartVerdict` | type | What `startGate` returns |
| `StateStoreFailure` | type | Why a state file write failed: `write`, `remove` or `aborted` |
| `Step` | type | What `nextStep` returns |
| `StepAction` | type | What a dependency step does: `install`, `enable` or `update` |
| `stopLoadingSkillsDirPlugin` | function | The two ways to stop loading a scaffolded plugin: "delete its directory, or run `claude plugin disable my-tool@skills-dir` in your shell" |
| `STORE_NAMES` | constant | The names the table of "Find plugins on disk" gives; each is directly under the root |
| `StoreEntry` | type | What a name directly under the plugins root is, as the table of "Find plugins on disk" lists them |
| `StoreLayout` | type | What `createStoreLayout` returns; The `layout` argument of `dirsToOrphan` |
| `stripHints` | function | A tag on its own line is removed from the output "even when `v` or `type` is unrecognized" |
| `StrippedOutput` | type | What `stripHints` returns |
| `subdirectoryPathHash` | function | The hash a `git-subdir` version carries ("a hash of the subdirectory path") |
| `SubmoduleEvidence` | type | What the plugin's repository and files say about its submodules; every path is relative to the repository root |
| `submodulePaths` | function | The `path` of each submodule in the text of a `.gitmodules` file, in file order |
| `SubmoduleRule` | type | Which of the marketplace repository's git submodules a local plugin needs |
| `submoduleRuleFor` | function | The rule for a plugin at `path` ("." at the root) of a marketplace added as `origin` |
| `SuggestedPlugin` | type | Where a matching plugin is suggested and how often: the spinner tip, the session-start notification and the `/plugin` Discover tab |
| `SuggestionContext` | type | The `context` argument of `pinInDiscover`; The `context` argument of `showSessionStartNotice` |
| `SuggestionHistory` | type | What the host recorded about one plugin's suggestions |
| `SummaryFacts` | type | The `facts` argument of `installSummary` |
| `sweepAgedCopies` | function | Lists the root, looks up the age of each dated copy, and removes those that aged out |
| `SwitchPlan` | type | What `channelSwitch` returns |
| `TelemetryEvent` | type | One of `PLUGIN_TELEMETRY_EVENTS` |
| `TelemetryNameFacts` | type | The `facts` argument of `reportedNames` |
| `toggleDecision` | function | The Enable or Disable auto-update toggle: hidden when the pass is off; refused when a managed entry sets the field |
| `ToggleDecision` | type | What `toggleDecision` returns |
| `toggleLabel` | function | What the Marketplaces tab labels the toggle: "Enable auto-update" when it is off, "Disable auto-update" when it is on |
| `ToggleRequest` | type | The `request` argument of `toggleDecision` |
| `ToggleWrite` | type | Where an auto-update toggle writes: `known_marketplaces.json` or a settings scope |
| `TreeEntry` | type | What copying a plugin tree into the cache does with each entry |
| `TreePlan` | type | What `planTreeCopy` returns; The `plan` field of `StagedCommit` |
| `TreeRoots` | type | The `roots` argument of `planTreeCopy` |
| `TrueIn` | type | One source that sets the plugin to `true`; a `local` file says whether git tracks it |
| `uninstallChoice` | function | For a plugin this repository's `.claude/settings.json` enables, Uninstall asks |
| `UninstallOption` | type | What `uninstallChoice` returns |
| `UninstallPlan` | type | What `planUninstall` returns |
| `UninstallSelection` | type | What `selectUninstall` returns |
| `UninstallSelector` | type | Which install records one `claude plugin uninstall` removes |
| `UNKNOWN_VERSION` | constant | The version of a source that gives nothing to version it by |
| `unknownFormatMessage` | function | "The whole file declares a format this version doesn't know" |
| `UnknownVersionPlan` | type | What `unknownVersionSteps` returns |
| `unknownVersionSteps` | function | The steps for a plugin and the scopes of the blocks that still show `unknown` afterwards |
| `UnloadedPlugin` | type | A `--plugin-dir` plugin that does not load, and the dependency issue that stops it |
| `unreadableRecordsMessage` | function | "installed_plugins.json holds a record under "<id>" that this version of Claude Code cannot read"; with several, "holds records under" |
| `unresolvedAfterStart` | function | The `/plugin` Errors tab entries after the start |
| `unsafeEntryIssue` | function | The first entry that would be written outside the plugin directory, is written through a link, or is a link that leaves it |
| `UNSUPPORTED_LOCKFILES` | constant | The lockfiles Claude Code recognises and skips the install for |
| `UNSUPPORTED_SOURCE_TYPE` | constant | The message of a source type this version cannot fetch, with the line the docs say follows it |
| `UnsupportedLockfile` | type | One of `UNSUPPORTED_LOCKFILES` |
| `untrustedSource` | function | The notice of a marketplace registered under a reserved name from a source that is not Anthropic's; it stops loading |
| `untrustedSourceMessage` | function | `Marketplace "<name>" is registered from an untrusted source:...` |
| `UpdateCheck` | type | The `check` field of `UpdateVerdict` |
| `UpdateErrorsTabEntry` | type | "An entry in the `/plugin` Errors tab: the entry shows the new command and the `claude plugin update` command to run." |
| `UpdateInstallCommand` | type | One of `INSTALL_COMMANDS` |
| `UpdateKnownMarketplace` | type | What the kit needs to know about a marketplace the user has registered |
| `UpdateOutcome` | type | How Claude Code decides a plugin has an update |
| `UpdatePick` | type | What `pickAllowedVersion` returns |
| `UpdatePlan` | type | What `planUpdate` returns |
| `UpdatePrecheck` | type | What the host knows of a plugin before it fetches anything: the entry's source and marketplace, and a claude.ai record |
| `UpdateRequest` | type | The `request` argument of `planUpdate` |
| `updateRetriesInstall` | function | "While `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` is set, `claude plugin update` and `/plugin` skip the retry and report that the plugin is at its latest version." |
| `UpdateSkipReason` | type | One of `SKIP_REASONS` |
| `UpdateSubject` | type | What the update check is about: `source` and `origin` decide whether the plugin loads in place (`loadsInPlace`) |
| `UpdateVerdict` | type | The outcome of the check and the version computed again, which a new copy is made at |
| `upToDateMessage` | function | What `claude plugin update` prints when the computed version is unchanged: "<name> is already at the latest version (<version>)." |
| `UrlSourceHeaders` | type | The `url` source of a marketplace, declared in a settings file |
| `urlSourceLayer` | function | The header layer a URL source declares for a download |
| `usableVersion` | function | A stated version that also names one folder; one that does not is skipped, as if unset |
| `UserDisableOverridden` | type | What `overriddenUserDisable` returns |
| `validateMarketplace` | function | What `claude plugin validate` reports about a `marketplace.json` |
| `validateRenames` | function | What `claude plugin validate` reports about `renames`, on `renames.<old>` |
| `validationNameIssues` | function | What `claude plugin validate` reports about a marketplace's name beyond the id grammar |
| `VersionInput` | type | The `input` argument of `resolvePluginVersion`; The `version` field of `UpdateSubject` |
| `VersionOrigin` | type | Where a version came from; `claude-ai` is the version a marketplace hosted on claude.ai records |
| `VersionPolicy` | type | The `policy` argument of `pickAllowedVersion`; What `readVersionPolicy` returns |
| `VersionSource` | type | The source of a plugin: a `git-subdir` source always has its `path`, which its version hashes |
| `VersionStep` | type | The way out of `Version: unknown` for a plugin installed from a git repository: Claude Code could not read the commit it uses as the plugin's version |
| `winningScope` | function | The highest-precedence scope whose `enabledPlugins` lists `id`, if any does |
| `withoutCredentials` | function | `environment` without its credential variables |
| `withoutRoutingHeaders` | function | `headers` without the request-routing and client-identity names; authentication names stay |
