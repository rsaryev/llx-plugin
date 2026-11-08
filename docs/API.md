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
| `readManifest(raw)`                 | done    | `plugin.json` as loaded: unknown keys stripped, any error blocks load; a `userConfig` option's `options` must sit on a non-`multiple`, non-`sensitive` `string` field with a `default` from the list or `required: true`; `types` is a `./` path to a `.d.ts` file inside the plugin |
| `validateManifest(raw)`             | done    | plus the validator: reserved names, kebab-case, missing metadata      |
| `readMarketplace(raw)`              | done    | `marketplace.json`: top level, names, entries, plugin sources (see Marketplace) |
| `readSkill(path, text, layout)`     | done    | `SKILL.md` into a `Skill`: the 19 documented fields (defaults applied, a bad value dropped with a warning), the body, the folder; a YAML error loads the skill with no fields; the name and command come from `resolveSkillName`; a refused name is an error issue |
| `resolveSkillName(layout, declared)` | done    | the command name of a skill: directory or `name`, the plugin prefix (not doubled), the plugin-root fallback, `anthropic-skills:` for a synced skill; a name with a zero-width, control, private-use, unassigned, bidi or blank character or `<` `>` is refused outside a plugin and hyphenated in a plugin skill folder |
| `readCommand(path, text, layout)`   | done    | a flat command file (the older skill format) into a `Command`: the skill frontmatter except `name` and `paths`; the name is the path below `commands/` without the extension, folders joined by `:`, after the plugin prefix; a refused character or (outside a plugin) `anthropic-skills` refuses the file |
| `readCommandEntry(key, entry, sourceText, ctx)` | done | one entry of the manifest `commands` map: `source` text or inline `content` (the body as written), `description`, `argumentHint`, `model` and `allowedTools` replace the same fields of the file; both or neither of `source` and `content`, and a missing source file, are errors for that entry |
| `readAgent(text, origin)`           | done (name, description, tools, disallowedTools, model, effort, maxTurns, autoCompactWindow, background, omitClaudeMd, isolation, color, initialPrompt, experimental, hooks) | an agent file → `AgentRecord` (official `AgentDefinition` + scoped name, source, `extras` for `color`, `isolation` and `cacheTtl`; `hooks` in the settings' hook format, never for a plugin agent): a project, user or managed file without a name is documentation and a bad name, no description or unparseable YAML skips it; a plugin agent always loads (file-name fallback, `Agent from <plugin> plugin`) and lists the fields it ignores in `ignored`; a bad value is dropped with a warning; `unrecognized` names up to five unknown fields; the other fields follow |
| `AGENT_FIELDS`, `AGENT_FIELD_NAMES`, `PLUGIN_IGNORED_FIELDS`, `AGENT_COLORS`, `AGENT_ISOLATIONS`, `AGENT_MEMORY_SCOPES`, `AUTO_COMPACT_RANGE` | done | the registry of the 19 documented frontmatter fields (plugin `supported` or `ignored`, and a coercer each) and the closed lists behind them |
| `scopedAgentName`, `hookAgentType`, `validAgentName` | done | `my-plugin:review:security` (frontmatter `name` replaces the file segment, a manifest-listed file drops subfolders); the `agent_type` hooks receive; the name rules |
| `readHooksFile(raw)`                | done    | `hooks/hooks.json` → official `HooksSettings`: events, matcher groups, every handler field; an error leaves no hooks, as Claude Code does |
| `readHooksSettings(raw)`            | done    | the bare event map (inline `hooks`, skill frontmatter, `settings.json`) |
| `matchesMatcher(matcher, value, mode?)` | done | a hook `matcher` against the field its event filters on: match-all, exact list, unanchored regex; `'narrow'` for FileChanged and StopFailure |
| `readMcpConfig(raw, origin)`, `readMcpServer(name, raw, origin)` | done | `.mcp.json` (wrapper or bare map) → `PluginMcpServer` map; an entry Claude Code would drop is an error issue |
| `collectMcpServers(files, manifestValue, options)`, `classifyMcpSource(value)` | done | the root `.mcp.json`, then each `mcpServers` source in order (`.json` file, inline map, `.mcpb` or `.dxt` bundle path or URL); a later name replaces an earlier one |
| `readLspConfig(raw, origin)`, `readLspServer(name, raw, origin)`, `mergeLspSources(reads)` | done | an LSP server map (`.lsp.json` or inline: no wrapper) → `LspServer` map; one invalid entry skips the whole map; a later source replaces an earlier server of the same name |
| `readMonitors(raw, origin)`, `readMonitor(raw, origin, index)`, `parseMonitorTrigger(when)` | done | `monitors/monitors.json` or the inline `experimental.monitors` array → `Monitor[]` (strict entry; unique names; `when` as `{ kind: 'always' }` or `{ kind: 'on-skill-invoke', skill }`); every problem is an error issue |
| `readOutputStyle(path, text, { plugin? })` | done | an output style file: `name` (default the file name; `<plugin>:<name>` for a plugin), `description`, `keep-coding-instructions`, `force-for-plugin` (plugin styles only); a YAML error loads the style with no fields and a warning |

### Skills (done: `format/skill*`, the field readers; planned: command name, commands, expansion)

```ts
import { readSkill } from '@rsaryev/claude-plugin-kit';

const { skill, issues } = readSkill('skills/review/SKILL.md', text, {
  origin: { kind: 'plugin', plugin: 'my-plugin' },
  dirName: 'review',
});
skill.allowedTools; // ['Bash(git add *)', ...] as written: `${CLAUDE_*}` is substituted at expansion
skill.userInvocable; // true unless `user-invocable: false`
```

`Skill` and `Command` share `InvocableFrontmatter`. Defaults are the documented ones
(`disable-model-invocation` false, `user-invocable` true, `background` true, `shell` bash). The
`description` falls back to the first non-empty body line. The model keeps `<` and `>` as written;
`escapeAngleBrackets` is what a listing or menu shows. `allowedTools` rules are raw strings:
parsing them is `rules`' (layer 3), and substitution is the expansion's. `SKILL_FIELDS` is the
closed list of documented keys, `FIELD_READERS` the reader of each; any other key is ignored
without an issue. Whatever a host does with a field (forking, the model override, matching
`paths`) is decided by the runtime functions that read the same `Skill`.

### Commands (done: `format/command`, `skills/command-entries`)

A command is the older skill format: a flat Markdown file (`commands/db/migrate.md` is
`/my-plugin:db:migrate`) with the skill frontmatter except `name` and `paths`, or an entry of the
manifest's `commands` object map. `loadCommandEntries` reads the entries through the files port; the
result is a `Command` that `expandSkill` and `menuEntries` take like a skill:

```ts
const { commands, issues } = await loadCommandEntries(
  manifest.commands, // { status: { source: './commands/status.md', argumentHint: '[env]' }, about: { content: '...' } }
  files, // PluginFiles
  { origin: { kind: 'plugin', plugin: 'my-plugin' } },
  signal,
);
commands.map((command) => command.command); // ['my-plugin:status', 'my-plugin:about']
```

An entry sets exactly one of `source` and `content`; `content` is the body as written (never read
for frontmatter). `description`, `argumentHint`, `model` and `allowedTools` of an entry replace the
same fields of its source file. Each failure (both or neither of `source` and `content`, a missing
or out-of-folder `source`, a refused name) is an error issue for that entry, and the other entries
still load; an `allowedTools` rule that does not parse is dropped with a warning.

### Skills and commands of the folders (done: `ports/folder-scan`, `foundation/folder-walk`, `skills/scan`)

The skills a person or an organization keeps outside a plugin: `.claude/skills/<name>/SKILL.md` and
the flat `.claude/commands/**.md` of the managed (enterprise) directory, `~`, the project and its
parents, each directory passed with `--add-dir`, a `.claude/skills` below the working directory, and
the skills downloaded from claude.ai into `~/.claude/skills/synced/` (skills.md, "Choose where skills
load"). The kit reads them through the `FolderScan` port (`managedDirectory`, `open(dir)` giving
`{ dir, files: PluginFiles, hostPath, canonicalPath }`, `repository(cwd)` giving the working
directory and its parents up to the repository root, and the main checkout of a linked worktree,
`directoriesBelow(start, touched)`); the fake is `folderScan(record, { managed, repositories, worktrees })`.

```ts
import { resolveFolderSkills, scanFolders, scanNested } from '@rsaryev/claude-plugin-kit';

const context = { folders, request: { home, cwd, addedDirectories: ['../cli'] }, signal };
const outcome = await scanFolders(context); // { entries, plugins, issues, watch }
const nested = await scanNested(context, '/repo/apps/web/src/page.ts', loadedDirectories);
const { resolved, shadowed } = resolveFolderSkills([...outcome.entries, ...nested.entries], {
  cwd,
  addedDirectories: ['../cli'],
  taken: ['usage'], // commands other sources use: only a synced skill's short name yields to them
});
resolved[0]; // { invocable: Skill | Command, scope, names: ['deploy', 'deploy-staging'] }
```

- `scanFolders` reads the scopes in precedence order (`SCAN_SCOPES`): managed, personal, project, the
  added directories, synced. A refused name (`anthropic-skills`, a folder `synced` in any
  capitalization, a zero-width space or `<`) is an error issue and the skill does not load; a link that
  leads nowhere is a warning. A symlinked skill folder is read from its target. `watch` lists the
  skills folders that exist and that a session watches (personal, project, added directories).
  `plugins` lists the skill folders of the personal and project locations that hold
  `.claude-plugin/plugin.json` as `<name>@skills-dir` (a project's needs the workspace trust dialog,
  `requiresTrust`, and is looked for in the working directory only); the host opens one with
  `FolderScan.open(dir)` and `loadPlugin`.
- `scanNested` reads the `.claude/skills` of the directories between the working directory and a touched
  file, outermost first, skipping `loaded` ones; the session keeps them for the rest of its life.
- `resolveFolderSkills` decides the names: enterprise over personal over project (the nearest
  directory first); a skill over a command file of one name; a nested skill that clashes is
  `<subdir path>:<name>` with its directory in the description, and the root one keeps the plain name; an
  added directory's skill that clashes with a local skill or an earlier added directory takes the folder
  name as prefix (`cli:verify`, `b/cli:verify` when two folders share a name); a synced skill is
  `anthropic-skills:<name>` and also its short name unless another command uses it, names compared
  ignoring case, spacing, invisible characters and compatibility forms. The same real folder reached
  through several links is one skill. `names` lists every name that invokes an entry: a skill is typed
  by its frontmatter `name` and by its folder's name.
- `resolveFolderSkills` also says, per entry, the `yielded` names (a preferred name another command
  already used, with the folder skill or command file that holds it as `heldBy`) and returns the
  `shadowed` entries that lost every name.
- The host: `HostPorts.folders` and `SessionOptions.addedDirectories` turn it on;
  `SessionOptions.takenCommands` names the commands the host's own sources use (built-in commands,
  bundled skills, MCP prompts), which only a synced skill's short name yields to.
  `session.reloadSkills({ signal })` (the `/reload-skills` of Claude Code, and the first read) lists the
  folders next to the plugins' skills, and `session.touchFile(path, { signal })` loads the nested ones.
  `session.addDirectory(path, { signal })` (`/add-dir`) and `session.moveTo(cwd, { signal })` (`/cd`)
  read the folders again on the live session: its skill hooks, `once` keys and nested directories stay
  (judgments in `spec/judgments.md`), and hook input `cwd` follows the move. The reads of one session
  run one after another. `session.skillSources()` returns `{ entries, shadowed }` for the last read:
  per listed skill its `scope` (`synced` is the `claude.ai sync` group of `/skills`), `origin`, `names`
  and `yielded`, which is what the note under that group is built from.
  `strictPluginOnlyCustomization` for `skills` stops the personal, project, added-directory and synced
  sources, never the managed directory. A skill of the managed directory keeps its hooks and its
  `allowed-tools` grant under the locks. `SkillsReload.plugins` leaves out the skills-directory plugins
  while the settings stop them (`strictPluginOnlyCustomization` set to `true` or to any kind,
  `strictKnownMarketplaces` without a `skills-dir` entry, `blockedMarketplaces` with one); the folder's
  `SKILL.md` is still a plain skill unless skills are locked.
- A plugin's skill whose frontmatter `name` differs from its folder's is also typed by the bare name
  (`/fancy` for `/my-plugin:fancy`) unless a command already uses it; `readSkillMentions` takes
  `names` so a directory-qualified name (`/apps/web:deploy`) is one word.

### Skill substitution (done: `skills/arguments`, `skills/substitute`, `skills/variables`)

What a skill's text becomes before the model reads it (skills.md, "Available string
substitutions"). Arguments first, then `${CLAUDE_*}` over the result, so a variable inside an
argument value is replaced too:

```ts
import { buildVariables, substitute } from '@rsaryev/claude-plugin-kit';

const vars = buildVariables(skill, { sessionId, effort: 'high' }, { locations, environment });
const { text, issues } = await substitute(skill.body, {
  rawArguments: '"hello world" second', // as typed after the command name
  names: skill.arguments,
  vars,
});
```

| Name                                        | Does                                                                                   |
| ------------------------------------------- | -------------------------------------------------------------------------------------- |
| `parseArguments(raw)`                       | shell-style split: `"hello world" second` is two arguments                             |
| `substituteArguments(content, input)`       | `$ARGUMENTS`, `$ARGUMENTS[N]`, `$N` (0-based), `$name`; one pass over the original text, so a value is never expanded; `\$` before a token escapes it (a doubled backslash does not) and an escaped token receives nothing; an index with no argument stays, a named one becomes empty; `ARGUMENTS: <value>` is appended when arguments were typed and no placeholder received one |
| `buildVariables(skill, session, ports)`     | the `SubstitutionScope` of `loading/resolve` plus the names this skill leaves as written: `CLAUDE_SESSION_ID`, `CLAUDE_EFFORT` and `CLAUDE_SKILL_DIR` travel as `scope.extra` |
| `substituteVariables(text, vars)`           | the six `${CLAUDE_*}` variables through `loading/resolve` (the `markdown-content` surface) |
| `substituteAllowedTools(skill, vars)`       | the same for the Bash rules of `allowed-tools` (other rules kept as written); the host matches the result with the rules matcher against the substituted command |
| `substitute(content, { rawArguments, names, vars })` | both stages                                                               |

`${CLAUDE_PLUGIN_ROOT}` and `${CLAUDE_PLUGIN_DATA}` are substituted only for a plugin skill and stay
as written elsewhere, without asking the host for a folder. A synced skill keeps
`${CLAUDE_PROJECT_DIR}` and `${CLAUDE_SESSION_ID}` as literal text unless the host says the session
is isolated (`isolatedSession`, a cloud or Cowork session). `${CLAUDE_SKILL_DIR}` is the folder of
the `SKILL.md` (for a plugin skill its subfolder, not the plugin root), built from `Skill.dir` and
the origin's root through `Locations`. `effort` is the level in force while the skill runs: when the
skill sets its own, pass the one `resolveTurnOverrides` chose.

### Skill invocation, listing and execution (done: `skills/invocation`, `mention`, `listing`, `path-gate`, `execution`)

Who may run a skill, what the model and the `/` menu are told, when `paths` activate it and how it
runs once invoked (skills.md, "Control who invokes a skill", "Override skill visibility from
settings", "Skill descriptions are cut short", "Run skills in a subagent"). All pure: the host passes
the settings, the usage counts and what it knows of the session.

```ts
import { checkInvocation, modelListing, menuEntries, resolveExecution } from '@rsaryev/claude-plugin-kit';

checkInvocation(skill, 'model', settings.skillOverrides); // { allowed: false, reason, message } for `disable-model-invocation`
modelListing(skills, { overrides, budget: { contextWindow: 200_000 }, usage, activated });
resolveExecution(skill, { interactive: true, backgroundTasksDisabled: false, trigger: 'user' });
```

| Name                                          | Does                                                                                 |
| --------------------------------------------- | ------------------------------------------------------------------------------------ |
| `invocationPolicy(skill, overrides?)`         | the matrix: user, model, what the model is told (`description`, `name`, `hidden`), menu, preload, scheduled prompt; `skillOverrides` does not reach a plugin skill |
| `checkInvocation(skill, by, overrides?, options?)` | `by` is `user`, `model`, `preload` or `scheduled-task`; a refusal carries the reason and the text to give back (a scheduled fire's says the prompt reaches Claude as plain text); `options.permittedByMention` lets the model run a `disable-model-invocation` skill the user named in this message |
| `readSkillMentions(message, options?)`        | `/name` at the start runs directly (with its arguments); more names right after it are `stacked` (the first plus five more, each with the shared trailing arguments, until a name `options.stackable` rejects; only the first with `interactive: false`); after plain text, as a separate word with no punctuation, a name only names a permission |
| `modelListing(skills, options)`               | what the model reads: `description` plus `when_to_use` cut at 1,536 characters (`maxDescChars`), `<` `>` escaped, a character budget (8,000 characters when the host gives no window or count) that drops the descriptions of the least used skills first and never a name, `skillOverrides`, path-scoped skills by name until `activated` |
| `menuEntries(skills, options)`                | the official `SlashCommand[]` of the `/` menu: skills a user may type |
| `skillActivatesFor(skill, file, cwd, options?)` | `paths` globs (gitignore syntax and `{a,b}` expansion within the list's budget of 1,000 patterns and 4 MiB) relative to `cwd`; a file outside `cwd` never matches; no `paths` is always active |
| `resolveExecution(skill, ctx)`                | inline, or a fork: `agent` (default `general-purpose`), background or waiting (`background: false`, non-interactive, background tasks disabled, the same skill running, a scheduled task, a workflow agent) |
| `resolveTurnOverrides(skill, session)`        | the `model` and `effort` for the rest of the turn or for the forked subagent: `inherit` and an excluded model keep the session's, `CLAUDE_CODE_EFFORT_LEVEL` wins, a cap lowers, `supportedEfforts` falls back to the highest level the model supports at or below |
| `resolveShell(skill, tools)`                  | the tool that runs `` !`command` ``: PowerShell when asked and enabled, else bash, else PowerShell; an explicit `shell: bash` without bash fails with the documented message |
| `readExecutionEnvironment(environment)`       | `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS` and `CLAUDE_CODE_EFFORT_LEVEL` through the `Environment` port |

`Skill.shellDeclared` tells an explicit `shell` from the default, which `resolveShell` needs. The
model catalogue (`availableModels`, the family substitution, auto mode support) is the host's:
`ModelAvailability` is the three questions the kit asks.

### Skill expansion (done: `skills/shell-scan`, `shell-exit`, `shell-run`, `expand`, `expand-policy`, `hook-limits`)

What a skill becomes when it is invoked: the text the model receives and what the host must apply
for the turn (skills.md, "Inject dynamic context", "How injected commands run", "Pre-approve tools
for a skill", "Run skills in a subagent"; hooks.md, "Hooks in skills and agents"). The placeholders
are found in the original text, arguments and `${CLAUDE_*}` are substituted, the commands run
through the `CommandRunner` port, and their output is never scanned again.

```ts
import { expandSkill } from '@rsaryev/claude-plugin-kit';

const out = await expandSkill(skill, {
  arguments: '123', sessionId, effort: 'high', permissionMode, disableShellExecution: false,
  shells: { bash: true, powershell: false },
  context: { interactive: true, trigger: 'user' }, signal,
}, { runner, locations, environment, permissions });
if (out.ok) { out.text; out.grants; out.disallowed; out.execution; out.turn; out.hooks; }
else out.issues; // the invocation aborted: Claude never sees the skill
```

| Name                                   | Does                                                                                           |
| -------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `expandSkill(skill, request, ports)`   | `text` with commands replaced by their output; `grants` (`allowed-tools`, Bash rules with `${CLAUDE_*}` substituted) and `disallowed` for this turn; `execution` and `turn` from `resolveExecution` and `resolveTurnOverrides` (the environment variables are read through `Environment`); `hooks` to register for the session, present only when the skill declares them; warnings in `issues`. A failed command, a refused permission check, a refused character or a missing shell returns `{ ok: false, issues }` and no text |
| `ExpandRequest`                        | the typed arguments, the session id and effort, `permissionMode` (auto mode turns an unapproved command into an instruction to run it first, except in a forked skill that sets `agent`), `disableShellExecution` (every command becomes `[shell command execution disabled by policy]`), the shell tools available, `cwd`, `limits` (model allowlist, effort cap), `session` (plugin id, `userConfig`, `isolatedSession`, `pluginSource` for a skills-directory or managed `@inline` plugin...) and `policy` (`hooksLockedToPlugins`, `managedPermissionRulesOnly`) |
| `ShellPermission`                      | the host's answer for one command, `(call: { tool, command, grants }) => 'allow' \| 'deny' \| 'ask'`: its rules (deny and ask beat the grants), then the skill's `grants`, then the mode. Tests build it from `matchRule`; the kit holds no rule engine here |
| `countSkillHooks`, `admitSkillHooks`, `hookSourceOf` | the hook limits per source and session (1,024 hooks, 16,384 matcher characters, a matcher counted once per hook); a skill past a limit registers none of its hooks |

Behaviour worth knowing: the inline form is recognized only at the start of a line or after
whitespace (`KEY=!`cmd`` stays literal); with bash a non-zero exit fails except exit 1 of `grep`,
`rg`, `egrep`, `fgrep`, `find`, `diff`, `test`, `[`, `git diff` and `git grep` (PowerShell: no `find`
or `diff`, plus `findstr`); each command runs under the `BASH_DEFAULT_TIMEOUT_MS` timeout (2 minutes by default) with stderr merged for bash;
a synced skill's commands are not run on the owner's machine (`isolatedSession` says otherwise).
The host owns registering and firing the hooks, the process, the working directory after a `cd`,
moving a long command to the background, saving output past the inline ceiling to a file, and
keeping `EndConversation` out of `disallowed` while another tool remains.

### Output styles (done: `format/output-style`, `skills/output-style-select`)

```ts
import { readOutputStyle, resolveOutputStyle, includeCodingInstructions } from '@rsaryev/claude-plugin-kit';

const { style } = readOutputStyle('output-styles/terse.md', text, { plugin: 'my-plugin' });
const active = resolveOutputStyle({ setting: 'Concise', command, styles: [style] });
includeCodingInstructions(active, 'full'); // false for a custom style without keep-coding-instructions
```

`resolveOutputStyle` takes the `outputStyle` setting (case-sensitive, unknown gives Default), the
argument of `/output-style` (case-insensitive) and the custom styles in precedence order; a
`force-for-plugin` style wins over both and the first one loaded wins. `includeCodingInstructions`
says whether Claude Code's software engineering section stays in the prompt: only the full prompt has
it. `listOutputStyles` is the `/output-style` list. The host writes the setting and injects the
`instructions` of `active.style`; the kit never sends a prompt.

## Marketplace

`marketplace.json` and where plugins come from (plugins/marketplace-reference.md,
plugins/host-marketplace.md, plugins/dependencies.md). The shapes below live in
`src/format/marketplace/types.ts` and `src/marketplace/types.ts`; the readers, the fetch
planners and the decisions are written against that one contract. Reading and planning are pure; the
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
| `readMarketplace(raw, context?, readEntry?)`, `validateMarketplace(...)` | done | the top-level fields and the marketplace's name as Claude Code loads them (a bad top-level field or name keeps the marketplace from loading) and as `claude plugin validate` reports them; each entry goes to an `EntryReader` on its own, so a bad one is dropped alone; the default reader is `createEntryReader(parsePluginSource)`, so the plugin sources are read too, and what is read feeds `planPluginFetch`, `resolveRename`, `normalizeDependency` and `crossMarketplaceDecision` |
| `effectiveDescription`, `effectiveVersion` | done | `description` or `version`, else the one under `metadata` |
| `marketplaceNameIssues(name, { origin?, hostedOnClaudeAi? })`, `validationNameIssues`, `loadNameIssues`, `downloadFolderIssues(name, registered)`, `spellingOf` | done | the reserved-name rules: `validationNameIssues` is what `validate` prints, `loadNameIssues` what adding or loading refuses (official names outside `github.com/anthropics/`, another spelling, JavaScript member names, `claudeai-`), `marketplaceNameIssues` both |
| `OFFICIAL_NAMES`, `COMMUNITY_NAMES`, `DIRECTORY_NAMES`, `NON_MARKETPLACE_NAMES`, `ANY_CASING_NAMES`, `OBJECT_MEMBER_NAMES` | done | the lists of "Reserved names" |
| `createEntryReader(parseSource)`, `readEntry(raw, slot, parseSource)`, `ENTRY_KEYS` | done | one `plugins[i]` as Claude Code loads it and `claude plugin validate` reports it: `name` as an install id, `source` through the plugin source parser, every entry field, unknown keys, the typed `relevance`, duplicate names; pass the reader to `readMarketplace` |
| `mergeEntryWithManifest(entry, manifest?)` | done | the strict-mode table: the entry is the manifest without a plugin.json; strict appends the component fields and the entry's hooks replace the manifest's per event; strict false with components is `has conflicting manifests`; entry-only fields, version, `defaultEnabled`, display fields and the two names resolve as documented; returns the manifest (`undefined` when the plugin fails to load), `installName`, `replacedHookEvents` and `scanDefaultSkills`; `effectiveDisplayName(merge)` is the name users see and `effectiveTopic(entry)` the `relevance.topic` default |
| `parsePluginSource(raw, slot)` | done | the plugin source parser (`SourceParser`) the entry reader is given: a relative path, `"."`, a bare name under `metadata.pluginRoot`, and the six object types with the documented field rules and messages (`createEntryReader(parsePluginSource)`) |
| `planPluginFetch(source, context)` | done | a source as a `FetchPlan` (local, git, npm, archive, command) or the issues that refuse it: `sha` wins over `ref`, sparse and partial `git-subdir`, the npm refusal list, archive https and blocked hosts, command shell and link mode on Windows; issue paths are relative to the entry (`source.url`) |
| `selectSubmodules(rule, evidence)`, `submodulePaths(gitmodules)`, `submoduleRuleFor(path, origin)` | done | which git submodules of a marketplace clone a relative-path plugin needs: the local plan's `submodules` rule (`none`, `plugin-subtree`, `whole-repository`) applied to the paths in `.gitmodules`, link targets, component directories, configured paths and texts the host collects |
| `ARCHIVE_LIMITS`, `isBlockedHost(hostname)` | done | the download and extraction limits of an `archive`, and the lexical loopback, link-local and cloud-metadata host check |
| `parseMarketplaceSource(raw, { policy, key? })`, `DEFAULT_MARKETPLACE_PATH` | done | a marketplace source object (`extraKnownMarketplaces`'s `source`, or an entry of `strictKnownMarketplaces`/`blockedMarketplaces` with `policy: true`) as a `MarketplaceSource` with the issues and the `loadStatus` `extraKnownMarketplaces` would give it: the ten types and their fields (`url`, `headers`, `headersHelper`, `repo` with the policy-only `owner/*`, `ref`, `path` defaulting to `.claude-plugin/marketplace.json`, `sparsePaths`, `skipLfs`, `name` equal to the key and not reserved, the inline `plugins` read as entries that must be remote), `npm` and the policy-only types parsing and failing to load; paths are relative to the source object |
| `planMarketplaceFetch(source)` | done | a marketplace source as a `MarketplaceFetchPlan` (`git` with `ref`, `path` and `sparsePaths`; `http-file` of 5 MiB and 10 seconds with its redirect rule, normalized headers and `headersHelper`; `read-file` with the root two levels up; `read-directory`; `inline` entries) or the issue that refuses it (`npm`, `skills-dir`, the patterns, an `owner/*` repository) |
| `parseMarketplaceInput(text, { platform?, sparse? })` | done | the `claude plugin marketplace add` input forms: `owner/repo[#@ref]`, SSH `user@host:path`, `.git` and `/_git/` URLs, github.com and gitlab.com repository URLs (`.git` appended), any other http(s) URL as a `url`, paths to a directory or a `.json` file, the documented refusals, `--sparse` for `github` and `git` only |
| `runCommandSource(plan, ports, setting, signal)` | done | runs a command source through `CommandRunner` (`sh -c` or `cmd.exe /c` from the home directory) and judges the output: one absolute path, not a UNC path, not the session directory or a parent, plugin content at the top level, copy mode within 256 MiB and 20,000 entries, link mode refused on Windows and top-level symlinks inside the directory; returns the files of the printed directory or a `PluginIssue`; the copy or link is the host's |
| `fetchArchive(plan, ports, signal)` | done | downloads an archive through `HttpClient` (256 MiB, 120 s, five redirects judged hop by hop, https and no blocked host, no headers after a cross-origin hop), checks the `sha256` through `Sha256`, the extraction limits (the 50-times ratio against the zip's own length) and the plugin root (top or one directory down) from `ArchiveReader` stats; returns the bytes, stats and root or a `PluginIssue` |
| `PluginDirectories` | done | the port that opens the directory a command source printed as read-only `PluginFiles` rooted there |
| `urlSourceLayer(source, origin)`, `entryLayer(entry, archiveUrl, declared)` | done | one `headers`/`headersHelper` declaration as a `HeaderLayer`: where it was declared (`HeaderOrigin`), the `CLAUDE_CODE_*` variables its command gets, and for an entry what the user is doing (`PluginOperation`) and the command and archive URL they accepted (`AcceptedCommand`; a query-only change in the URL does not count unless `queryCounts`) |
| `helperAllowed(layer, setting)` | done | whether a `headersHelper` command may run: `https://` marketplace URL, the settings file it is in (project needs the trusted folder, server-managed the approval, `--add-dir` never), the managed policy blocks (`disableCommandPluginSources`, `allowManagedHooksOnly`) except for a marketplace managed settings declare, and for an entry a single install or update the user accepted; a refusal says whether the fixed headers still go (`skip-helper`) or the download stops (`refuse-download`) |
| `runHeadersHelper(layer, ports, setting, signal)`, `helperCache(clock)` | done | runs the command through `CommandRunner` (`sh -c` or `cmd.exe /c`, from `CLAUDE_CONFIG_DIR` or `~/.claude`, 10 seconds, no credential variables for an entry or project command) and reads one JSON object of string headers (a `ResolvedHeaders`, `{ headers }`, or a `PluginIssue`); a `url` source's output is reused for 60 seconds |
| `resolveHeaders(layer, setting, ports, signal)`, `archiveDownloadHeaders(request, setting, ports, signal)` | done | the headers of a `marketplace.json` fetch or an archive download: the `url` source's only for its own origin, the entry's over them, command output over `headers` within a place, `Host`, `Cookie` and `X-Forwarded-*` dropped from a catalog or project entry; the result (`{ headers }` or a `PluginIssue`) fills `ArchiveFetchPlan.headers` |
| `mergeHeaders`, `normalizeHeaders`, `withoutRoutingHeaders`, `isCredentialVariable`, `withoutCredentials` | done | lower-case header maps, the later replacing by name; the routing and identity names; the credential variable rule of an MCP `headersHelper` |
| `validateRenames(renames, pluginNames)`, `Renames` | done | a `renames` chain that cycles, or ends at a name that is neither a plugin nor a key, is `renames.<old>: chain does not resolve (...)`; a target that is not a plugin name is `target "x" is not a valid plugin name (PluginIdSchema)`; `validateMarketplace` runs it |
| `resolveRename(name, marketplace)`, `renameNotice(name, marketplace)` | done | where a name stands (`current`, `renamed` to the end of the chain from the oldest name, `removed`, `unknown`) and the notice the user sees (`Renamed to "x" in the "m" marketplace`, `Removed from the "m" marketplace`) |
| `migrateSettingsKeys(map, marketplaceName, marketplace)`, `migrateSettingsScopes(scopes, ...)`, `InstallScope` | done | rewrites the old key to the new one (or drops it) in `enabledPlugins` and `pluginConfigs`, unchanged value; managed settings are not rewritten and their notice recurs |
| `removedPlugins(installed, marketplace)`, `InstalledPlugin`, `REMOVED_STATUS` | done | what `forceRemoveDeletedPlugins` uninstalls: installed from the marketplace, neither listed nor renamed; from user, project and local scopes, managed stays; flagged `Removed from marketplace` |
| `normalizeDependency(value, declaringMarketplace, path?)`, `dependencyId(dep)` | done | one `dependencies` item as `{ name, marketplace?, range? }` (the marketplace defaults to the declaring plugin's; none for a plugin loaded from claude.ai); `name` is required, `version` a valid node-semver range (an empty one is no constraint), each a string; `name` and the marketplace must satisfy the plugin id grammar (`a@b@c` is refused); `PluginIssue` otherwise |
| `releaseTag(name, version)`, `parseReleaseTag(tag, name)`, `selectTag(tags, name, range)` | done | the `<name>--v<version>` tag convention; the highest tag in the range, a pre-release only with an opt-in range such as `^2.0.0-0` |
| `combineRanges(ranges, tags, dep)` | done | the highest tag that satisfies every plugin's range; `has conflicting version requirements` (ranges listed), `has an invalid version requirement` or `has version requirements too complex to intersect` as a `PluginIssue`; `undefined` when the ranges overlap and no tag does (the current copy is fetched); the messages name the dependency by id (`name@marketplace`) |
| `autoUpdateDecision({ dep, ranges, tags, currentCopyVersion? })` | done | what auto-update does with a constrained dependency: update to the highest tag in every range, skip when the ranges conflict, else update to the current copy unless its version is outside any range |
| `resolveDependencyVersion({ dep, source, tags, currentCopyVersion? })` | done | what a constraint is checked against by source kind: a tag of its own repository (`github`, `url`, `git-subdir`; none in range is `has no git tag satisfying <range>`), a tag or else the current copy (`relative`), the plugin.json version (`npm`, `archive`, `command`); the tag version beats plugin.json |
| `checkInstalledDependency(dep, installed)`, `checkDependency(dep, copies, loadsFromClaudeAi)`, `InstalledDependency`, `DependencyIssue` | done | a `PluginIssue` with the `errorType` of `claude plugin list --json` (`dependency-unsatisfied`, `dependency-version-unsatisfied`): `Dependency "<dep>" is not installed`, `... is disabled`, `Requires "<dep>" <range>, installed <version>`; a `--plugin-dir` copy skips the range; a claude.ai plugin meets a marketplace dependency only for a plugin loaded from claude.ai (no version passes), and the `@synced` note names it only while it is enabled |
| `crossMarketplaceDecision({ dep, requiredBy, root, declaringMarketplace?, enabledAtScope, declaredIn })` | done | `allowCrossMarketplaceDependenciesOn` of the root marketplace only, an already enabled dependency bypasses it; the refusal message and whether it refuses the install (`entry`) or installs without the dependency (`plugin.json`) |

`SourceFetcher` is for what only a host can do (a git clone with sparse checkout, an `npm pack`):
it takes the git and npm plans and returns the fetched files or a `PluginIssue`. A missing port is
a `PluginIssue` for that source only.

## Loading (done: `loading`, `format/layout`)

```ts
import { loadPlugin } from '@rsaryev/claude-plugin-kit';

const { plugin, issues } = await loadPlugin({ files, fallbackName: 'formatter' });
```

`files` is the `PluginFiles` port: read access to one plugin folder, wherever it is (a disk, an
object store, a sandbox, an archive in memory). `loadPlugin` finds every component in the
standard layout and the manifest's paths (plugins/manifest-reference.md, "Standard layout", "How
each key combines with its default location") and returns a `Plugin`. It never throws: `plugin` is
`undefined` only when the plugin does not load at all (a `plugin.json` that is not JSON or fails
validation, or no manifest and no `fallbackName`); any other problem is an issue and skips that
component while the rest loads.

```ts
interface Plugin {
  readonly name: string; // the manifest's `name`, else `fallbackName`
  readonly manifest: PluginManifest | undefined; // the manifest is optional
  readonly skills: readonly PluginTextFile[]; // path, name, `<plugin>:<name>`, text
  readonly commands: readonly PluginTextFile[]; // files, and the manifest's object map
  readonly agents: readonly PluginTextFile[]; // `review:security` for agents/review/security.md
  readonly hooks: HooksSettings; // official; hooks/hooks.json first, then the manifest's, per event
  readonly mcpServers: Readonly<Record<string, PluginMcpServer>>; // official types plus `ws` and `headersHelper`
  readonly lspServers: Readonly<Record<string, LspServer>>;
  readonly monitors: readonly Monitor[];
  readonly outputStyles: readonly PluginTextFile[];
  readonly workflows: readonly PluginPath[];
  readonly themes: readonly PluginPath[];
  readonly settings: PluginSettings; // official `Pick<Settings, 'agent' | 'subagentStatusLine'>`
  readonly userConfig: Readonly<Record<string, UserConfigOption>>;
  readonly bin: readonly string[]; // the files directly in bin/
  readonly hasBin: boolean; // bin/ exists, empty or not
}
```

| API | What it does |
| --- | --- |
| `loadPlugin({ files, fallbackName?, bundles?, bundleSettings?, signal? })` | the optional manifest, discovery, every reader; all issues collected |
| `discoverComponents(files, manifest, pluginName, signal?)` | paths and names only (no file parsed): the default location and the manifest's paths per kind, containment (`..`, a symlink that leaves the plugin) and existence (`<component> path escapes plugin directory: <path>`, `<component> path not found: <path>`) checked |
| `STANDARD_LAYOUT`, `COMPONENT_KINDS`, `declaredKey(manifest, kind)` | the registry typed over the component kinds: default location, manifest keys, combine rule, extension; the first manifest key set wins (`experimental.themes` over `themes`) |
| `COMBINE` | `replace` (`commands`, `agents`, `outputStyles`, `workflows`, `experimental.themes`, `experimental.monitors`: the default is not scanned, with the warning `Default <folder>/ folder is ignored because the manifest sets "<key>"` unless a declared path is inside the folder), `add` (`skills`), `merge` (`hooks`, `mcpServers`, `lspServers`: the default first) |
| `COMPONENT_READERS` | the seam: one reader per kind over what discovery found. Skills, commands, agents and output styles keep path, name and text until the streams that own those formats plug in a parser |
| `mergeHooks(sources)` | the hooks of several sources joined per event, in loading order |
| `readPluginSettings(raw, origin)`, `hasAppliedSettings(read)` | `settings.json` or the inline `settings`: only `agent` and `subagentStatusLine` take effect, the rest is dropped with a warning; `settings.json` wins when it sets one |
| `binPathEntries(plugin, pluginId, locations)`, `pathWithPluginBins(userEntries, bins)` | the absolute `bin/` directory when the plugin has one, and its place after the user's own `PATH` entries; the host changes the `PATH` |
| `distribution(plugin, target)`, `DISTRIBUTION_TARGETS` | `claude.ai` and Cowork do not install a plugin that has `bin/`; the host refuses the install |
| `resolveProcesses(plugin, scope)` | every MCP server, language server and monitor of a plugin resolved for this host; an entry that must not start is left out with its issue |

Loading never calls the resolvers: the host loads, then resolves with its scope.

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
the caller passes `hook-powershell` there (`resolveHookCommand`, below, takes that as `defaultShell`).

### Hook commands and Markdown content (done: `loading/resolve/hook-command`, `content`)

```ts
import { resolveHookCommand, substituteContent } from '@rsaryev/claude-plugin-kit';

const { resolved, issues } = await resolveHookCommand(handler, scope, { defaultShell: 'bash' });
// resolved.spec: { form: 'exec', command, args } | { form: 'shell', command, shell }: a CommandRunner `spec`
// resolved.environment: CLAUDE_PLUGIN_ROOT/DATA, CLAUDE_PROJECT_DIR, CLAUDE_PLUGIN_OPTION_<KEY>
const { text } = await substituteContent(skillBody, scope); // Markdown body of a skill, command or agent
```

| API | What it does |
| --- | --- |
| `resolveHookCommand(handler, scope, { path?, defaultShell? })` | with `args`: exec form, `command` and each element substituted as plain strings (`${user_config.*}` allowed, `shell` ignored); without: shell form through `shell` (default `defaultShell`, then `bash`), where `${user_config.*}` anywhere in `command` is the errors.md message and `resolved` is `undefined`, with no value needed; the environment holds the three path variables and an option variable per option with a value, sensitive included |
| `HOOK_GUARD` | the shell-form hook message for `rejectUserConfigInShell` |
| `substituteContent(body, scope, path?)` | the three path variables, `scope.extra` (a skill's `CLAUDE_SKILL_DIR`, `CLAUDE_SESSION_ID`), non-sensitive `${user_config.KEY}`; a sensitive one becomes `SENSITIVE_PLACEHOLDER`; `${VAR}` stays; nothing is exported |

A PowerShell shell-form command gets `${env:NAME}` for the placeholders, and a bare `$CLAUDE_PROJECT_DIR`
(or the other two) stays and is a warning; an exec-form `command` that is a bare name with whitespace
beside `args` is a warning (the spawn would fail). `substituteContent` takes the body: splitting the
frontmatter off, `$ARGUMENTS` and the `allowed-tools` rules are the skills'. The kit never spawns the
hook: the host passes `spec` and `environment` to its `CommandRunner`, and says through `defaultShell`
that a Windows host without Git Bash runs `powershell`.

### MCP servers (done: `format/mcp-*`, `loading/resolve/mcp`)

```ts
import { collectMcpServers, resolveMcpServer } from '@rsaryev/claude-plugin-kit';

const { servers, issues } = await collectMcpServers(files, manifest.mcpServers, { bundles, bundleSettings });
const { resolved, issues: more } = await resolveMcpServer('db', servers.db, scope);
// resolved.server (substituted), resolved.key 'plugin:<plugin>:db', resolved.environment,
// resolved.headersHelperEnvironment (CLAUDE_PLUGIN_ROOT, CLAUDE_CODE_MCP_SERVER_NAME, _URL)
```

| API | What it does |
| --- | --- |
| `PluginMcpServer` | the SDK's stdio, SSE and HTTP configs plus the two things the SDK does not type: the `ws` transport and `headersHelper` on every remote server (mcp.md, "Option 4"); `type: "streamable-http"` reads as `http`; a `url` with no `type` and a `type: "sdk"` entry are dropped with the messages mcp.md quotes |
| `collectMcpServers(files, manifestValue, { bundles?, bundleSettings?, signal? })` | root `.mcp.json` first, then each declared source in array order; sources load concurrently, merge in order |
| `McpBundleReader` (port, optional) | the host opens a `.mcpb` or `.dxt` (extract into `.mcpb-cache`, or download) and returns `{ name, server, userConfig? }`; the kit never unzips or downloads, and never maps the MCPB manifest |
| `resolveMcpServer(name, server, scope)` | stdio: `command`, `args`, `env` substituted, the three path variables in `environment`; http, sse and ws: `url`, `headers`, `headersHelper` substituted, credential variables read as empty in `url` and `headers`; a `headersHelper` that references `${user_config.*}` keeps the server from starting |
| `resolveChannel(channel, servers, scope)` | a `channels` entry against the plugin's servers: `server` must be a key of `mcpServers` (else an issue and no `resolved`), `displayName` defaults to the server name, and the channel's `userConfig` options join the plugin's so `${user_config.KEY}` in that server's `env` takes the saved value; `loadPlugin` reports a `channels[i].server` that names no server as an error issue (the plugin still loads) |
| `validateUserConfigValues(config)` | one error per declared option whose value (saved, else `default`) would not be accepted: `required` and empty, a value of the wrong `type`, `multiple` not an array of strings, outside `options`, below `min` or above `max`; the dialog is the host's |
| `rejectUserConfigInShell(guard, template, context, path)`, `HEADERS_HELPER_GUARD` | the shell-field check on the template, with the message errors.md quotes; monitors and shell-form hooks pass a guard of their own |

A bundle whose own `user_config` has a required setting with no saved value is not started and
reports `Bundled MCP server "<name>" was not started: it needs configuration`; the rest of the
plugin loads. Without a `McpBundleReader` a bundle is a warning. Paths given to the reader are
relative to the plugin root, like every `PluginFiles` path. The server's tool prefix is `rules`'
`pluginMcpServerName`; `mcpServerKey` is the `plugin:<plugin>:<server>` name `/mcp` shows.

### LSP servers (done: `format/lsp-config`, `loading/resolve/lsp*`)

```ts
import { readLspConfig, mergeLspSources, resolveLspServer, languageIdFor, lspRestartDecision } from '@rsaryev/claude-plugin-kit';

const root = readLspConfig(JSON.parse(lspJson), '.lsp.json'); // { servers, issues }
const { servers } = mergeLspSources([root, readLspConfig(manifest.lspServers, 'lspServers')]);
const { resolved } = await resolveLspServer('go', servers.go, scope);
// resolved.command/args/env/workspaceFolder substituted, resolved.environment = the three path variables
languageIdFor(servers, 'src/main.go'); // { server: 'go', languageId: 'go' }
lspRestartDecision(resolved, restartsSoFar); // 'restart' | 'stay-stopped'
```

| API | What it does |
| --- | --- |
| `LspServer`, `LSP_FIELDS` | kit-owned type (the SDK has no LSP config type): the fourteen documented fields, a strict object: an unknown key is an error |
| `readLspConfig(raw, origin)` | one map, no wrapper object; an invalid entry skips the whole map, each reported as `Invalid LSP server config for "<origin>": <server>: <reason>` |
| `mergeLspSources(reads)` | `.lsp.json` first, then each declared source in order; a later name replaces the earlier entry whole and keeps its first position |
| `resolveLspServer(name, server, scope)` | `command`, `args`, `env`, `workspaceFolder` substituted (`${user_config.*}` allowed, `${VAR}` left to the process), `environment` = `CLAUDE_PLUGIN_ROOT`, `CLAUDE_PLUGIN_DATA`, `CLAUDE_PROJECT_DIR`; `transport` is always `stdio`; `requestTimeoutMs` 60000, `restartOnCrash` and `diagnostics` true by default; `shutdownTimeoutMs`, `startupTimeoutMs`, `maxRestarts` stay unset when unset |
| `lspRestartDecision(server, restartsSoFar)` | `restartOnCrash: false` stays stopped; `restartsSoFar >= maxRestarts` stays stopped; unset `maxRestarts` is unbounded |
| `languageIdFor(servers, filePath)`, `lspExtensionConflicts(servers)` | the server and language ID of a file (the first registered server keeps a shared extension; the longest extension wins); the record key must be unique across plugins, so qualify it as `plugin:server`; the `LSP server "<name>" is not used for <ext> files` warning |
| `initializeOptionsOf(server)`, `didChangeConfigurationOf(server)` | the `initializationOptions` of the initialize request and the `workspace/didChangeConfiguration` notification for `settings` |

The kit never starts a language server and never enforces a timeout: the host's LSP client starts the
process, waits `startupTimeoutMs`, applies `requestTimeoutMs`, terminates after `shutdownTimeoutMs`,
pushes diagnostics when `diagnostics` is on and speaks the protocol. The kit proves the values and
decisions it hands over.

### Monitors (done: `format/monitors`, `loading/resolve/monitor*`)

```ts
import { readMonitors, resolveMonitor, monitorsToStart } from '@rsaryev/claude-plugin-kit';

const { monitors, issues } = readMonitors(JSON.parse(monitorsJson), 'monitors/monitors.json');
const { resolved } = await resolveMonitor(monitors[0], scope); // undefined when it must not start
const toStart = monitorsToStart(monitors, { kind: 'session-start' }, started, { interactive: true });
for (const monitor of toStart) started.add(monitor.name); // the host spawns each and remembers the name
```

| API | What it does |
| --- | --- |
| `Monitor`, `MonitorTrigger` | kit-owned types (the SDK has no monitor config type): `name`, `command`, `description`, and `when` as a tagged trigger |
| `readMonitors(raw, origin)` | the array of one source; a strict entry (an unknown key is an error), `when` absent is `always`, a malformed `when` is an error naming the two forms, a repeated `name` is an error and the first keeps it; valid entries are still returned |
| `resolveMonitor(monitor, scope)` | `command` gets the three path variables and `${ENV_VAR}`; `${user_config.*}` in it is the errors.md message and `resolved` is `undefined`, with no value needed; `environment` is always empty (nothing exported, no `CLAUDE_PLUGIN_OPTION_<KEY>`) |
| `monitorsToStart(monitors, event, started, mode)` | pure: `always` starts on `session-start` and `plugin-reload`; `on-skill-invoke:<skill>` starts on `skill-invoked` for that skill, the first time only; nothing starts when `mode.interactive` is false (`-p`) |
| `MONITOR_GUARD` | the monitor message for `rejectUserConfigInShell` |

The kit never spawns a monitor: the host runs `command` in a shell in the session's working
directory, outside the sandbox, keeps the set of started names (a name in it is never returned
again), and turns what the process prints into notifications.

## Validating (done: `loading/validate`, `format/validate`)

```ts
import { validatePlugin } from '@rsaryev/claude-plugin-kit';

const { target, issues } = await validatePlugin({ files, label: 'my-plugin' });
for (const { severity, file, path, message } of issues) console.log(severity, file, path, message);
```

`validatePlugin` reproduces `claude plugin validate <dir>` of the Claude Code release the kit
tracks: the same folder, the same findings, the same wording (docs/SPEC.md, "Sources of truth", the
oracle). It reads the folder through the `PluginFiles` port, never throws, and never follows a
symlink (a link is skipped, with the warning the official CLI gives).

| API | What it does |
| --- | --- |
| `validatePlugin({ files, label?, signal? })` | picks what to validate as the CLI does: `.claude-plugin/marketplace.json` (the marketplace, its entries whose folder is inside it, and the plugin at the root too when it has a `plugin.json`), else `.claude-plugin/plugin.json`, else a bare skills tree or `.claude/{skills,commands,agents}` folder (`components`), else the error `No manifest found in directory…`; a folder that does not exist is `File not found: <label>` |
| `ValidationReport` | `{ target: 'marketplace' \| 'plugin' \| 'components' \| 'none', issues }` |
| `ValidationIssue` | `{ severity: 'error' \| 'warning', file, path, message }`: the folder-relative file, the place inside it (`name`, `plugins.0.source`, `plugins[0].version`, `hooks.Stop`, `frontmatter`, `directory`) and the CLI's own text |

What it checks: the manifest's schema, then (when the schema passes) the name advice and the
recommended `version`, `description` and `author`; unknown fields with the CLI's hints; declared
paths; the inline `hooks` and `mcpServers`; `hooks/hooks.json` and `.mcp.json`; the frontmatter of
every `SKILL.md` and of every Markdown file under `agents/` and `commands/` (paths the manifest
declares are not read); `CLAUDE.md` at the root; and, for a marketplace, the top-level fields, each
entry, the entry's own `plugin.json` (findings prefixed `plugins[i] plugin.json → `) and the
cross-check of the entry's `version` with it. Schema errors name their place with dots
(`plugins.0.name`), the validator's own checks with brackets (`plugins[0].name`), as the CLI does.

Validating and loading differ on purpose. `loadPlugin` answers "does it load, and what is in it";
`validatePlugin` also reports advice and checks the loader never makes. Where the two read the same
text they read it the same way: plugin hooks (`hooks/hooks.json`, the inline `hooks`) drop an entry
they cannot read and keep the rest, except under `PreToolUse` and `PermissionRequest`, where a guard
that went missing fails the file, and frontmatter that plain YAML refuses is retried with the plain
value of a line quoted, as Claude Code does. Checks that need the network or the marketplace
directory service (the `directory` profile) are not made.

## Ports (done)

Interfaces the host implements, in `src/ports/` (type-only, one file per port, all exported from the
package; a stream's own port, such as `McpBundleReader`, is exported through its module barrel and not
`src/ports/index.ts`, docs/ARCHITECTURE.md). Each is small, takes an `AbortSignal` where it does I/O, and is optional when the host
supports no plugin that needs it (a missing port is reported per component, never a crash). An
absent file is `undefined`; an effect that did not happen is a `PortFailure` value, never a throw.

| Port             | Used for                                                          | A local host            | A cloud host                    |
| ---------------- | ----------------------------------------------------------------- | ----------------------- | ------------------------------- |
| `PluginFiles`    | reading a plugin's files (`TextFileReader` is its `readText`)     | the disk                | object storage                  |
| `CommandRunner`  | `command` hooks, `` !`cmd` `` in skills, status lines             | `spawn`                 | exec in the sandbox             |
| `HttpClient`     | `http` hooks, archive and marketplace downloads (text or `bytes`) | `fetch`                 | `fetch` behind an egress policy |
| `ModelRunner`    | `prompt` and `agent` hooks, a mod's `$.model`                     | the host's model        | the host's model                |
| `McpCaller`      | `mcp_tool` hooks                                                  | the host's MCP client   | the host's MCP client           |
| `McpBundleReader` | opening an `.mcpb` or `.dxt` bundle named by `mcpServers` (optional)  | unzip into `.mcpb-cache` | extract in the sandbox or a service |
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

## Host and sessions (done: `host`)

`createPluginHost` composes what the modules below already do; it adds no behaviour of its own. The
host takes plugins loaded once with `loadPlugin`, the ports, the settings and the saved options, and
reads the Markdown components of the enabled plugins once. A session reads nothing again.

```ts
import { createPluginHost, loadPlugin } from '@rsaryev/claude-plugin-kit';

const { plugin } = await loadPlugin({ files });
const host = createPluginHost({
  plugins: [{ id: 'formatter@acme-tools', plugin }], // `enabled?` and `source?` per plugin
  ports, // HookPorts: commands, locations, environment, http?, mcp?, models?, scratch?, clock?, observer?
  settings, // optional: the PolicyView of createPolicyView(layers)
  userConfig: { 'formatter@acme-tools': { endpoint: 'https://svc.example' } },
});
const session = host.openSession({ sessionId, cwd, permissionMode, transcriptPath });

session.skills(); // { model, menu }: what to list to the model and in `/` menus
await session.expandSkill('formatter:review', { arguments: 'src/', signal }); // prompt text
const outcome = await session.dispatch('PreToolUse', facts, { signal }); // typed per event
(await session.mcpServers()).resolved; // ResolvedMcpServer per server
```

Signatures:

```ts
createPluginHost(options: PluginHostOptions): PluginHost;
// PluginHostOptions: { plugins: HostPlugin[]; ports: HostPorts; settings?: PolicyView;
//   parentSettings?: ParentSettingsContext; userConfig?: Record<pluginId, OptionValues>;
//   windows?: boolean; shells?: { bash; powershell } }
// HostPlugin: { id: 'name@marketplace'; plugin: Plugin; enabled?: boolean; source?: SkillPluginSource }
host.plugins: readonly { id; name; enabled }[]   // every plugin given, with whether it runs
host.issues: readonly PluginIssue[]              // what the format readers found in enabled plugins
host.openSession(options: SessionOptions): PluginSession;
// SessionOptions: { sessionId; cwd; permissionMode; transcriptPath; effort?: { level };
//   interactive? (true); trusted? (true); additionalDirectories?; addedDirectories?;
//   permissions?: ShellPermission }
// HostPorts adds `folders?: FolderScan` (docs/API.md, "Skills and commands of the folders")
```

A plugin runs when `HostPlugin.enabled` says so, else when `enabledPlugins` of the settings says so,
else it does; managed settings that turn it off win over both. A disabled plugin contributes
nothing: no skill, hook, agent, server, monitor or style.

The session:

| Method | Returns |
| --- | --- |
| `skills(options?)` | `{ model, menu }`: `modelListing` and `menuEntries` over the skills and commands of every enabled plugin, named `<plugin>:<name>`. The two invocation flags and the budget apply; `skillOverrides` leaves a plugin skill alone, as skills.md says. |
| `reloadSkills({ signal })`, `touchFile(path, { signal })`, `addDirectory(path, { signal })`, `moveTo(cwd, { signal })` | The folders' skills and commands (docs/API.md, "Skills and commands of the folders"): `reloadSkills` reads the managed, personal, project, added and synced folders and lists them next to the plugins' skills; `touchFile` loads the `.claude/skills` below the working directory on the way to a file; `addDirectory` is `/add-dir` and `moveTo` is `/cd` on the live session. Each returns `{ issues, watch, plugins }`. Needs `HostPorts.folders`. |
| `skillSources()` | Where each listed folder skill came from: `{ entries: { command, names, scope, origin, yielded }[], shadowed }` of the last read, for the `claude.ai sync` group and the note under it. |
| `expandSkill(name, { arguments?, signal, invoker? })` | The `Expansion` of `expandSkill`: text with `$ARGUMENTS`, `${CLAUDE_PLUGIN_ROOT}` and the plugin's options substituted, shell placeholders run through the runner. `invoker` is `user` (default) or `model`. An unknown name, a skill of a disabled plugin or a refused invoker is `{ ok: false, issues }`. `disableSkillShellExecution` of the settings replaces the placeholders. Without `SessionOptions.permissions` a shell placeholder asks, which aborts the expansion. |
| `dispatch(event, facts, { signal })` | The `HookOutcome<E>` of the engine. `facts` is the event's own fields (`EventFactsOf<E>`); the common fields come from the session. Handlers of every enabled plugin, then of the settings files, run with `if` read by the rules module and the policy of the settings: `disableAllHooks`, `allowManagedHooksOnly` (plugins force-enabled in managed `enabledPlugins` exempt), the `hooks` lock of `strictPluginOnlyCustomization`, `allowedHttpHookUrls`, `httpHookAllowedEnvVars`. A skill's `once` hook that ran is dropped after the dispatch. |
| `agents(options?)` | `Resolved<SessionAgent>`: the official `AgentDefinition` of each plugin agent under `<plugin>:<name>`, its prompt with the plugin variables substituted, and `extras` (`color`, `isolation`, `cacheTtl`). |
| `mcpServers(options?)`, `lspServers(options?)`, `monitors(options?)` | `Resolved<ResolvedMcpServer>`, `Resolved<ResolvedLspServer>`, `Resolved<ResolvedMonitor>`: the substituted configs, with `${CLAUDE_PLUGIN_ROOT}`, `${CLAUDE_PLUGIN_DATA}` and `${user_config.*}` resolved. A server that cannot start is left out and its issue is in `issues`. |
| `outputStyles()` | The `OutputStyle` of each enabled plugin, `id` `<plugin>:<name>`. |

`Resolved<T>` is `{ resolved: readonly T[]; issues: readonly PluginIssue[] }`. The saved options
of a plugin are the `pluginConfigs` of the settings with the host's `userConfig` over them.

`dispatch<E extends HookEvent>(event, facts: EventFactsOf<E>)` runs every matching handler as
hooks.md describes (matchers, `if`, parallel runs, timeouts, `once`, `async`, exit codes, JSON
output) and returns one merged, typed outcome: the decision, the reason, an updated input, added
context and the system messages, with each handler's error kept beside.

The host maps its own tools to Claude Code's names and inputs before dispatching (`Bash`,
`Write`, `Edit`…, typed by the official `ToolInputSchemas`), so a plugin's `"matcher": "Write|Edit"`
and `"if": "Bash(git *)"` mean what they mean in Claude Code.

`expandSkill` also registers the frontmatter hooks of the skill into the session when it expands
(hooks.md, "Hooks in skills and agents"): they keep running for the rest of the session, `once` removes
one after its first successful run, invoking the skill again replaces its hooks, and each source of
skills (the project, the personal folder, one plugin) registers at most 1,024 hooks and 16,384 matcher
characters per session: a skill past the limit "registers none of its hooks" and the `Expansion`
carries a warning saying so. The plugin-only lock and `allowManagedPermissionRulesOnly` (read from
a managed layer only) decide whether a skill keeps its hooks and its `allowed-tools` grant. A manifest
command whose `allowedTools` holds a rule that does not parse is reported in `host.issues` as
`loadCommandEntries` reports it, and loads without that rule.

Not in the host: starting servers and monitors, the permission decision of a tool call (`decide` in the rules module),
and mods, which stay their own entry (`MODS_API`, `modsTesting`).

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

## Settings (done: layers, merge, the `hooks` key, and every policy key through `resolvePolicy`)

The policy keys of settings files, pure over data (`src/settings`). A host hands over the JSON of
each source it has; the kit never knows a file path, an MDM profile or a server-managed fetch, and
choosing among managed sources (`managedSourcesBehavior`, `policyHelper`) stays the host's.

```ts
import { createPolicyView, loadSettingsLayers, mergeSettingsHooks, readSettingsLayer } from '@rsaryev/claude-plugin-kit';

const { layer, issues } = readSettingsLayer('managed', JSON.parse(text));
const view = createPolicyView([layer, ...other]);
view.get('allowedHttpHookUrls'); // the lists of every file combined
view.winner('enableWorkflows'); // { scope, position, value } of the highest file that sets it
mergeSettingsHooks(view.layers); // every file's hooks, managed ones never removable
```

| Name                                    | Status  | Does                                                                                      |
| --------------------------------------- | ------- | ----------------------------------------------------------------------------------------- |
| `readSettingsLayer(scope, raw)`         | done    | one source's JSON to a `PolicyLayer`: aliases, scope filter, repairs; issues, never a throw |
| `SettingsSources`, `loadSettingsLayers` | done    | the host's optional port for its sources (an object or JSON text per scope) and the helper that reads them all |
| `createPolicyView(layers)`              | done    | `get`, `winner`, `eachFromHighest` over the layers, one merge rule per key               |
| `KEY_SPECS`, `admits`                   | done    | per key: its scope rule, merge kind and repair kind, from the key's entry in settings-reference.md |
| `mergeSettingsHooks(layers)`                    | done    | the `hooks` key: groups concatenated per event, the same handler under the same matcher in two files once |
| `enabledPlugin(view, id, default?)`, `forceEnabledByManaged(view, id)` | done | `enabledPlugins`: the highest file with an entry for the id decides (managed beats local beats project beats user); a managed `false` blocks and hides, a managed `true` cannot be turned off; no entry follows `defaultEnabled` |
| `pluginConfig(view, id)`                | done    | `pluginConfigs`: the options and per-server values of one plugin, from user or managed settings only, a built-in plugin read under either id; a value of another shape is dropped with a warning |
| `modOrder(view, context, orgMods)`      | done    | `prependPlugins` and `appendPlugins`: the ids that take effect in the listed order, the organization's mods no list names (`unlisted`), the skipped ones with the debug-log line, and where the built-in guard loads |
| `syncDecision(view)`                    | done    | `syncClaudeAiPlugins`: only `false` counts, from user, local, managed and `--settings`, also over a managed `true`; the move to the trash for user and managed |
| `trustWarning(view, standard)`          | done    | `pluginTrustMessage`: the managed text appended to the host's standard warning, which stays whole |
| `createPluginSettingsPolicy(view, context)` | done | the five above as one object (`PluginSettingsPolicy`); `pluginSuggestionMarketplaces` joins it in the composed policy |
| hooks engine: one run of the same handler across the groups that matched an event | planned | hooks.md, "Hook handler fields": a handler defined in more than one settings file runs once whatever its matcher; a plugin's or skill's copy stays separate. `mergeSettingsHooks` keeps both groups when the matchers differ |
| `createMarketplaceGate(view)`, `matchMarketplaceSource(list, entry, source)` | done | `strictKnownMarketplaces` and `blockedMarketplaces`: `check(source)` for add, install, update, refresh and auto-update (blocklist first; `is blocked by enterprise policy`, with the allowed sources for the allowlist), `checkRegistered` and `checkMissing` for session start (`is not in the allowed marketplace list`), `restrictionActive`, `skillsDirectoryPlugins`; the matcher: exact entries, owner wildcards, `hostPattern`, `pathPattern`, canonical git URLs on the blocklist |
| `createMarketplaceRegistry(view, context).registrations()` | done | `extraKnownMarketplaces` as the plan a host executes: per name the highest file wins whole (nothing inherited), a project, local or `--add-dir` entry in an untrusted folder is `ignoredUntrusted` (no message, as if absent), an entry the allowlist or blocklist refuses is `refusedByAllowlist`, a source that names no marketplace (a policy-list kind, an unknown kind, a `settings` source whose `name` differs from the key or whose plugins are not external) is `invalid` with `PluginIssue`s, a lower entry is `shadowed`; `autoUpdate` resolved (explicit, else on for `claude-plugins-official` and the host's `officialMarketplaces`, off for `knowledge-work-plugins` and `first-party-plugins`), `autoUpdateFixed` for a registered managed entry that sets it, `headersHelper` removed from an `--add-dir` entry and from a non-`https://` `url` source, routing and identity headers (`Host`, `Cookie`, `X-Forwarded-*`) dropped from an inline plugin entry of a project, local or `--add-dir` file, and the official marketplace implied (`implied`) by an `enabledPlugins` `true`. `RegistryContext` is `isFolderTrusted`, `officialMarketplaces` and the gate's `check` as a function |
| `createCommandSourcePolicy(view)` | done | `disableCommandPluginSources`: `disabled`, `pluginSource` (never run, install, update or load a `command`-sourced plugin, force-enabled ones included) and `headersHelper(declaredIn)`; the effective value is the explicit one (managed only), else `allowManagedHooksOnly`; `disableAllHooks` is not consulted; a marketplace helper is blocked except for a marketplace managed settings declare |
| `createHookPolicy(view, locks, context)` | done | `disableAllHooks`, `allowManagedHooksOnly`, `allowedHttpHookUrls`, `httpHookAllowedEnvVars` as one `HookPolicy`: `runs(source)` says whether a hook runs for every source (managed settings, SDK callbacks, user, project, local, `--settings` and SDK-option settings, plugins and mods, frontmatter) and why not (`disableAllHooks`, `allowManagedHooksOnly`, `strictPluginOnlyCustomization.hooks`, `commandSourceDisabled`); the value left after precedence decides, only a managed `true` stops managed hooks and force-enabled plugins (matched by full `plugin@marketplace` id), SDK callbacks always run; `httpHook(url, allowedEnvVars)` is `{ run, interpolate }` or `{ run: false, message }` (every source, managed included); `commandsDisabled`, `commandSettingsNarrowedToManaged`, `monitorsRun(pluginId)`, `goalCommandAvailable`; the SDK `managedSettings` rules are applied first (a parent `disableAllHooks: true`, or any value but `false` and `"false"`, binds as `allowManagedHooksOnly: true`). `HookLocks` (the `hooks` surface of `strictPluginOnlyCustomization`) is an input the customization package supplies; the origin type is named `HookSource` because mods already exports `HookOrigin`. `HookPolicyContext` is `hasManagedSettings`, `parentMerge`, `folderTrusted` and `safeMode` |
| `matchUrlPattern(pattern, url)` | done | `allowedHttpHookUrls` patterns: `*` for any characters, scheme and host case-insensitive, a trailing dot on the host ignored; the HTTP hook handler may reuse it |
| `createSkillSettingsPolicy(view, context)` | done | `skillOverrides`, `disableBundledSkills`, `disableSkillShellExecution`, `syncClaudeAiSkills` as one `SkillSettingsPolicy`: `visibility(name, { plugin?, aliases? })` (state table: listed to Claude in full, by name or hidden, in the `/` menu, in the Remote Control and SDK lists, `invokableByFullName` and `blockedBy: 'skillOverrides'` for `off`; plugin skills always on; alias entries from managed and `--settings` files only restrict further), `bundled()` (setting or `CLAUDE_CODE_DISABLE_BUNDLED_SKILLS=1`, neither undoes the other), `shell(origin)` (`{ run: false, replacement: '[shell command execution disabled by policy]' }` for user, project, plugin and add-dir skills; bundled and managed unaffected; a managed `true` is final; verdict only, the `!` block scanner belongs to the skills expansion), `syncClaudeAiSkills()` (`SyncDecision`, as `syncDecision` does for plugins). The pieces are exported alone: `skillVisibility`, `bundledSkills`, `shellVerdict`, `syncSkillsDecision` |
| `createWorkflowSettingsPolicy(view, context)` | done | `disableWorkflows`, `enableWorkflows`, `workflowKeywordTriggerEnabled`, `workflowSizeGuideline` as one `WorkflowSettingsPolicy`: `enablement()` (`WorkflowsDecision`: off by `disableWorkflows` in any file, `CLAUDE_CODE_DISABLE_WORKFLOWS=1`, the organization's toggle (`orgWorkflowsOff`) or `enableWorkflows: false`, on otherwise except on Pro unless `enableWorkflows: true`; `true` never lifts another off switch; `offBy` names every reason, `surfaces` what goes with workflows: `/workflows`, the commands, the `/workflow-authoring` skill, the keyword, the Ultracode toggle; `configRowVisible`), `keyword(prompt)` (`ultracode` triggers only when workflows are on, the prompt was typed by a person: interactive, IDE panel, Remote Control, or an SDK prompt stamped `{ kind: 'human' }`, never `-p`, a scheduled task, an unstamped SDK prompt or a relayed webhook or pull request comment, the highlight was not dismissed and `workflowKeywordTriggerEnabled` is not `false`; `reason` says why not, `highlight` is the range), `size()` (`workflowSizeGuideline` over the `/config` choice the host hands over, else `medium`, `small` on Pro: `agentsBelow` 5, 10, 50 or none for `unrestricted`, advice and not a cap, `configRowVisible`, `largeWorkflowThreshold` 25 unless a size was chosen and `largeWorkflowTokens` 1.5 million, both `undefined` while the host says `ultracode` is on). `WorkflowPolicyContext` is `env`, `plan: { pro }`, `orgWorkflowsOff`, `configChoice` and `ultracode`. A run in progress keeps going when workflows turn off: the host never cancels it (no run state in the kit). The pieces are exported alone: `workflowsDecision`, `keywordTrigger`, `workflowSize` |
| `createChannelSettingsPolicy(view, context)` | done | `channelsEnabled` and `allowedChannelPlugins` as one `ChannelSettingsPolicy`: `gate()` (`ChannelGate`: closed on claude.ai Team and Enterprise until managed `true`, and on Console once managed settings exist (a managed layer counts); open by default on Console without them and on Pro, Max and Ultra without an organization, which skip both keys; `false` is unset; `startupWarning` names the admin warning), `allowlist()` (the managed `allowedChannelPlugins` taken whole from the highest managed source, replacing the host's `defaultChannelAllowlist` even when empty; an unusable value is an empty list, an invalid entry is stripped, the string `plugin@marketplace` is the equivalent object) and `allowed(entry)` (`ChannelVerdict { allowed, reason }` for a `ChannelEntry` that carries its `origin`: `channels` with a `plugin`, or `development` with `interactive` and, for `plugin:<name>@<marketplace>`, the `plugin`; a bare `server:<name>` is a development entry with none. A closed gate blocks everything, the development flag included; otherwise a development entry, in an interactive session only, skips the list and a `--channels` entry needs both names on it; the bypass is per entry, so a mixed session is answered entry by entry). `ChannelPolicyContext` is `account` (`claudeaiTeamEnterprise`, `claudeaiPersonal`, `console`), `hasManagedSettings` and `defaultChannelAllowlist` (the Anthropic list is not in the docs). The kit starts no channel server: a closed gate carries `serverConnects: true` (the MCP server stays connected and its tools work, only channel messages stop), and the verdict only says whether it may register as a channel; refusing a server that negotiates protocol revision 2026-07-28 on the v2 MCP client runtime is the host's concern (spec/judgments.md). The pieces are exported alone: `channelGate`, `effectiveChannelAllowlist`, `channelVerdict` |
| `suggestionMarketplaces(view, registered)` | done | `pluginSuggestionMarketplaces`: the listed names that take effect, managed settings only; each must be registered and its registered source declared in the same managed settings, as the `extraKnownMarketplaces` entry of that name or an entry of `strictKnownMarketplaces` that admits it; the official marketplace needs its name alone; also `PluginSettingsPolicy.suggestionMarketplaces` |
| `createCustomizationPolicy(view, context)`, `readSurfaceLocks(value)` | done | `strictPluginOnlyCustomization`: `locked` (`true` all four, an array the kinds it names, an unreadable value `true`, an unknown name locks nothing and is counted in `unknownSurfaceNames`), `loads(surface, origin)` per surface (skills: user, project, commands, added directory and claude.ai sync stop, bundled, managed directory and plugins load; agents; hooks: asked of the hook policy's origin table; mcp: `~/.claude.json` and `.mcp.json` stop, managed files and plugin servers load), `skillsDirPlugins()` (stopped by a lock on any surface or the marketplace lists), `skillAllowedToolsPreapproved(skill)` (a personal or project skill with `hooks` loses it unless `context: fork`) and `mcpAddRefusal` (the documented message while `mcp` is locked) |
| `PolicyContext` | done | the facts a host copies in: account, plan, managed-settings presence, `parentSettingsBehavior`, folder trust, environment values, the default channel allowlist, the official marketplace names, the organization's workflow toggle, safe mode, the `/config` workflow size and the ultracode state; each field names its docs page |
| `resolvePolicy({ layers, context, issues? })` | done | every area behind one `ResolvedPolicy`: `plugins`, `marketplaces` (`gate`, `registry`, `commandSources`), `hooks`, `skills`, `workflows`, `channels`, `customization`, the `view`, and `issues` (the reader's, then the registry's); parent settings are dropped where an administrator deploys managed settings without opting in, and the `hooks` lock comes from the customization policy |

Scopes, highest first: `managed`, `parent` (the SDK `managedSettings`), `flag` (`--settings`),
`local`, `project`, `addDir`, `user`. A key a scope may not carry is dropped with a warning (its
**Scope** line); a `--add-dir` directory's settings carry `enabledPlugins` and
`extraKnownMarketplaces` only. In the policy tier (`managed`, `parent`) an unreadable allowlist is
an empty one, an unreadable lock reads as `true`, and `strictPluginOnlyCustomization` as `true`;
elsewhere the value or entry is dropped. The aliases `allowedMarketplaces` and
`additionalMarketplaces` are rewritten to their canonical keys, so a resolver sees only those.

## Sub-agents (done: the tools a subagent gets)

```ts
import { resolveSubagentTools } from '@rsaryev/claude-plugin-kit';

const outcome = resolveSubagentTools(
  { name: agent.name, tools: agent.definition.tools, disallowedTools: agent.definition.disallowedTools },
  { builtin: mainConversationTools, mcp: mcpTools }, // the pool the host offers
  { kind: 'subagent', background: true, atDepthLimit: false, permissionMode: 'default', asMainThread: false },
);
if (!outcome.ok) return outcome.refusal.message; // "Agent 'x' would be spawned with zero tools — refusing. ..."
```

| Function                          | Status  | Does                                                                                   |
| --------------------------------- | ------- | -------------------------------------------------------------------------------------- |
| `resolveSubagentTools(agent, pool, run)` | done | `tools` and `disallowedTools` against the host's pool: the first filter (`AskUserQuestion`, `EndConversation`, `EnterPlanMode`, `ScheduleWakeup`, `WaitForMcpServers`, `Workflow`, `Agent` at the depth limit, `ExitPlanMode` unless `plan`, `ExitWorktree` when `ownWorkingDirectory`), the background built-in set, the `Glob` and `Grep` a `tools` list names without `Bash` (they come back though the pool lacks them), `disallowedTools` first (a tool in both is removed, a specifier removes the whole tool, `mcp__github`, `mcp__github__*`, `mcp__*`, `mcp__reports__v2__*`), forks unfiltered, `Agent(worker, researcher)` as an allowlist only for the main thread (`Task(...)` is an alias), and the zero-tools refusal with its three groups (an omitted, empty or fully disallowed list never refuses) |
| `parseToolEntry(entry)`, `toolEntryMatches(entry, tool, behavior)` | done | one entry of the field and whether it names a tool (`tools` reads as an allow rule, `disallowedTools` as a deny rule) |
| `removedFromSubagent(tool, run)`, `BACKGROUND_BUILTIN_TOOLS` | done | the two filters as a predicate and the background list |

The host owns the pool (the main conversation's built-in and MCP tools); the kit never lists the
session's tools itself. `SubagentRun.handback` says the host gives the subagent `SubagentHandback`
(auto mode, a local subagent that is not a fork), which then beats `disallowedTools`.
Teammates' task and cron tools, and the Glob and Grep a subagent gets back without Bash, are the
host's to put in the pool.

### Sub-agents: the permission mode

```ts
import { baselineDecision, resolveSubagentPermissionMode } from '@rsaryev/claude-plugin-kit';

const { mode, denyInsteadOfAsk } = resolveSubagentPermissionMode({
  main: 'default',                              // the main conversation's mode
  set: agent.definition.permissionMode,         // the subagent's own, or undefined
  autoAvailable: true,                          // the host knows: disableAutoMode, the model
});
baselineDecision(mode, { category: 'edit', inScope: true }); // 'ask' | 'allow' | 'deny' | 'classify'
```

| Function                                   | Status | Does                                                                                   |
| ------------------------------------------ | ------ | -------------------------------------------------------------------------------------- |
| `resolveSubagentPermissionMode(input)`     | done   | the full "Permission modes" matrix of sub-agents.md: main `bypassPermissions`, `acceptEdits` or `auto` forces its mode; `plan` is held and a set `dontAsk` denies instead of asking; under `default` or `dontAsk` the set mode applies, except `bypassPermissions` (only when the main conversation does) and `auto` while auto mode is unavailable; `manual` is `default`; unset inherits. `basis` says `inherited`, `set` or `main` |
| `baselineDecision(mode, action)`           | done   | the "Available modes" table cell by cell for a category (`read`, `edit`, `filesystem-command`, `other`) and `inScope` (working directory or `additionalDirectories`, the host decides) |
| `PERMISSION_MODE_TRAITS`, `PERMISSION_MODE_INPUTS` | done | the registry over the official union (classifier, denies instead of asking, stance toward a subagent) and the accepted `permissionMode` values (six modes and `manual`) |

The classifier behind `auto` is a model call and the host's; the kit says only that the mode
routes an action to it. Rules, hooks, protected paths and critical-path removals layer on the
baseline and are not part of it. An agent team teammate follows the agent teams rules, not this
function.

### Sub-agents: frontmatter hooks

```ts
import { selectAgentHooks } from '@rsaryev/claude-plugin-kit';

const { groups, skipped } = selectAgentHooks(agent, {
  run: 'subagent',            // or 'main-session' for `--agent` and the `agent` setting
  event: 'PreToolUse',
  matcherValue: 'Bash',       // the event's matcher input; the tool name here
  active: true,               // only while this agent is running
  folderTrusted,              // the host's answer for the folder holding the agent file
});
// groups: the agent's own matcher groups to run; merge with the settings' groups for the event
```

| Function                                | Status | Does                                                                                   |
| --------------------------------------- | ------ | -------------------------------------------------------------------------------------- |
| `selectAgentHooks(agent, ctx)`          | done   | the agent's matcher groups that fire for one occurrence of an event: none while the agent is inactive (`skipped: 'inactive'`) or its project folder is untrusted (`'untrusted'`), none for a plugin agent, the matcher read with the hooks grammar (`Bash`, `Edit\|Write` exact; events without matcher support always fire) |
| `agentHookGroups(agent, run)`           | done   | the agent's hooks for a run: a subagent's `Stop` becomes `SubagentStop` (after the file's own `SubagentStop` groups; a `matcher` on `Stop` is dropped), a main-session run keeps `Stop`; a plugin agent has none |
| `hooksTrustGate(source, folderTrusted)` | done   | `skip-untrusted` for a project-level (and `--add-dir`) agent until its folder is trusted; user, `--agents`, managed and plugin agents need no trust |

The kit selects and the hooks engine runs. `folderTrusted` is one boolean the host computes: trust of
a parent folder or a `-p` session does not make it true. A main-session agent's groups run next to the
settings' hooks, so the host merges the two lists.

### Sub-agents: how it is launched

```ts
import {
  resolveSubagentModel, resolveSubagentEffort, effectiveAutoCompactWindow, turnLimitOutcome,
  runsInBackground, claudeMdScopes, worktreeDisposition,
} from '@rsaryev/claude-plugin-kit';

const { model } = resolveSubagentModel({
  invocation: toolCall.model, definition: agent.definition.model, // the file's `model`
  envModel: env.CLAUDE_CODE_SUBAGENT_MODEL, mainModel: 'claude-opus-5-5[1m]', mainFamily: 'opus',
});
const effort = resolveSubagentEffort({ field: agent.definition.effort, session, sameModelAsMain: true });
const window = effectiveAutoCompactWindow({ field: agent.definition.autoCompactWindow, inherited: 967_000, asMainSession: false });
```

| Function                                   | Status | Does                                                                                   |
| ------------------------------------------ | ------ | -------------------------------------------------------------------------------------- |
| `resolveSubagentModel(input)`              | done   | the "subagent model order": the invocation alias, the definition (`inherit` selects the main model), `CLAUDE_CODE_SUBAGENT_MODEL` (`inherit` is unset), the main model; a family alias of the main model's family becomes the main model's exact model (`[1m]` included), only `opus` when the family cannot be told (unless `ANTHROPIC_DEFAULT_OPUS_MODEL`); `force` skips the invocation and the definition. `from` says where it came from |
| `resolveSubagentEffort(input)`             | done   | `CLAUDE_CODE_EFFORT_LEVEL` (`auto`/`unset` send none), the invocation parameter, the `effort` field, then the session level only on the main conversation's model |
| `effectiveAutoCompactWindow(input)`        | done   | the variable (clamped to 100000..1000000) wins, the field only lowers the inherited window, none for a session run as the agent |
| `turnLimitOutcome(maxTurns, turns)`        | done   | `{ stop, partial }` once `maxTurns` is reached |
| `effectiveCacheTtl({ cacheTtl, usingUsageCredits })` | done | the frontmatter's step of the cache lifetime precedence; `1h` is ignored on usage credits |
| `runsInBackground(input)`                  | done   | background unless Claude waits, `background: true` keeps it there, none when background tasks are disabled |
| `claudeMdScopes(input)`                    | done   | `omitClaudeMd` drops the user, project and local files; managed policy stays except for a managed subagent; a subdirectory's CLAUDE.md and path-scoped rules (`nested`) always load; no effect for a main-session agent |
| `worktreeDisposition({ isolation, hasChanges })` | done | `none` without `isolation: worktree`; with it `cleanup` without changes, `keep` with (it stays until the periodic sweep) |
| `mainSessionFirstTurn(input)`              | done   | `initialPrompt` as the first turn of a main-session agent, prepended to the user's prompt; nothing for a subagent |

The kit reads no environment variable: the host passes each as a plain value. Turning an alias into
a version, the `availableModels` allowlist, the effort levels a model supports, a mod's `agent.spawn`
hook `model` (it replaces the per-invocation parameter, so pass it as `invocation`), the built-in
Explore and Plan subagents (`CLAUDE_CODE_SUBAGENT_MODEL` alone does not move them), parsing
`CLAUDE_CODE_AUTO_COMPACT_WINDOW` with its `k` and `M` suffixes, compaction, the turn loop, cache
requests and creating the worktree are the host's.

### Sub-agents: skills, MCP servers and memory

```ts
import { planPreloadedSkills, resolveAgentMcpServers, planAgentMemory } from '@rsaryev/claude-plugin-kit';

const skills = planPreloadedSkills(agent.definition.skills, { has, isModelInvocable });
// { load: ['api-conventions'], skipped: [{ name: 'verify', reason: 'not-model-invocable' }] }
const mcp = resolveAgentMcpServers(agent.definition.mcpServers, {
  source: agent.source, folderTrusted, policy: { allows, managedAllows },
});
const memory = await planAgentMemory(agent.definition.memory, agent.scopedName, {
  autoMemoryEnabled, locations, files,
});
```

| Function                                | Status | Does                                                                                   |
| --------------------------------------- | ------ | -------------------------------------------------------------------------------------- |
| `planPreloadedSkills(names, catalog)`   | done   | the first 32 distinct names of `skills` are preloaded; a missing or disabled skill, one with `disable-model-invocation: true` and a name past the 32 are `skipped` with a reason |
| `resolveAgentMcpServers(specs, ctx)`    | done   | strings are `references`, keyed entries `inline` definitions; none for a plugin agent; an inline server of a `project` agent (also `--add-dir`) waits for `folderTrusted`; `policy` blocks (`allows` for everything, `managedAllows` for the managed-only restrictions that also bind an `--agents` definition) become `skipped` |
| `planAgentMemory(scope, agentType, ctx)`| done   | the directory of `user`, `project` or `local`, the part of `MEMORY.md` for the prompt, `addTools` Read, Write and Edit; `undefined` without a scope or with auto memory off |
| `truncateMemoryIndex(text)`             | done   | the first 200 lines or 25KB (25600 bytes) of the index, whichever comes first; frontmatter and block comments do not load |

`SkillCatalog` and `McpPolicy` are narrow interfaces the host fills, so this module needs neither the
skills package nor a process: the host knows `--strict-mcp-config`, `--bare` and the managed lists, and
whether the folder is trusted (a parent folder's trust and a `-p` session do not count). Loading the
skill content, connecting servers, creating the memory directory, the memory instructions for the
system prompt and merging `addTools` into the tool pool are the host's.

## Testing kit (done: `testing`)

`@rsaryev/claude-plugin-kit/testing`: one in-memory fake per port, so a host tests its integration
without a disk, a shell or a network. The scripted ones answer in order, record every call and throw
when the script is spent, so a test never passes by accident.

```ts
import {
  fakeEnvironment, fakeMcp, fakeModel, fixedClock, locations,
  folderScan, memoryFiles, memoryScratch, recordingHttp, scriptedRunner,
} from '@rsaryev/claude-plugin-kit/testing';

const files = memoryFiles({ '.claude-plugin/plugin.json': '{"name":"demo"}' }); // PluginFiles
const runner = scriptedRunner({ stdout: 'ok' }, { exitCode: 2, stderr: 'no' }); // CommandRunner, `calls`
const web = recordingHttp({ status: 200, body: '{}' }); // HttpClient, `requests`
```

`folderScan(record, options)` is a `FolderScan` over an in-memory disk of absolute paths (links
follow wherever they lead; the record is read again at each `open`). `memoryFiles(record)` is the `PluginFiles` of a plugin folder, so a test loads a plugin with
`loadPlugin({ files })` and passes it to `createPluginHost`. `fakeModel(...)` answers `evaluate` and
`runAgent`, `fakeMcp({ connected, tools })` an `McpCaller`, `fixedClock(start)` a `Clock` that moves
only on `advance(ms)`, `locations(options)` fixed POSIX paths (`<plugins>/<id>`), `fakeEnvironment(record)`
an `Environment`, `memoryScratch()` the `ScratchFiles`. The mods test kit stays `modsTesting`.
