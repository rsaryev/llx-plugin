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

## Type dependencies

`@rsaryev/claude-plugin-kit/layout` exposes the same `STANDARD_LAYOUT`, `COMPONENT_KINDS`,
`declaredKey`, `componentsAt` and layout types as the root, through a dependency-free runtime entry.
Use it when a folder classifier needs only the standard paths, not the plugin engine.

The package declares `@anthropic-ai/claude-agent-sdk` and `@modelcontextprotocol/sdk` as peers:
its public declarations refer to their official shapes. They must be available when a consumer
type-checks the kit, not just when developing this repository. All SDK imports in the kit are
type-only; importing the package starts neither Claude Code nor an MCP client.

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
resolved[0]; // { invocable: SkillHead | CommandHead, readBody, scope, names: ['deploy', 'deploy-staging'] }
const body = await resolved[0].readBody(signal); // the Markdown now, or undefined when the file is gone
```

- **Metadata first.** A scanned entry holds the skill or command without its body (`SkillHead`,
  `CommandHead`, `InvocableHead`: a `Skill` or `Command` minus `body`; `scanSkillContainer(folders, dir, container, request)` reads any other skills folder the same way) and a `BodyReader`,
  `readBody(signal?)`, which reads the body through the same `FolderScan` port when the skill runs, so a
  catalog of hundreds of skills holds names, descriptions and settings and not their Markdown. Contract
  (judgment, `spec/judgments.md`): nothing is memoized (a host that wants a cache keeps its own, keyed by
  what its port tells it changed); the folder is opened again on each call, so a body edited since the scan
  is what runs while the frontmatter stays as the scan read it until the next scan; `undefined` means the
  file is gone or no longer loads as a skill; a port that refuses a read (a size limit, text that is not
  UTF-8) rejects, and at scan time the kit turns that rejection into a warning that carries the port's
  message and goes on with the other files, in the agents scan too (an aborted `signal` still rejects). The session expands a
  folder skill with the body read at that moment; a refused or missing file fails that expansion with an
  issue. `listingLine`, `modelListing`, `menuEntries`, `invocationPolicy`, `checkInvocation`, `stackSkills`
  and the mention readers accept heads.

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
| `substituteArgumentPieces(pieces, input)`   | `substituteArguments` over the pieces of one text cut at its injected commands: a placeholder in any piece receives the arguments, each piece is scanned alone, and the `ARGUMENTS:` line ends the last piece |
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
the settings, the usage counts and what it knows of the session. A host that works through a session
uses `session.expandSkill` and `session.expandMessage` instead, which pass the turn's limits as
`ExpandRequest.limits` and build the `stackable` of `readSkillMentions` with `stackableOf` (see "Host and
sessions").

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

### Skill expansion (done: `skills/shell-scan`, `shell-run`, `shell-result`, `shell-refusal`, `shell-ports`, `expand`, `expand-shell`, `expand-types`, `expand-policy`, `hook-limits`)

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
| `findInjections(text)`, `runInjections(...)` | the `` !`command` `` placeholders of a text, and their run (permission check, timeout, output limit) through the ports; the pieces `expandSkill` is made of, for a host that binds the arguments to its own environment |
| `expandSkill(skill, request, ports)`   | `text` with commands replaced by their output; `grants` (`allowed-tools`, Bash rules with `${CLAUDE_*}` substituted) and `disallowed` for this turn; `execution` and `turn` from `resolveExecution` and `resolveTurnOverrides` (the environment variables are read through `Environment`); `hooks` to register for the session, present only when the skill declares them; warnings in `issues`. A failed command, a refused permission check, a refused character or a missing shell returns `{ ok: false, issues }` and no text |
| `ExpandRequest`                        | the typed arguments, the session id and effort, `permissionMode` (auto mode turns an unapproved command into an instruction to run it first, except in a forked skill that sets `agent`), `disableShellExecution` (every command becomes `[shell command execution disabled by policy]`), the shell tools available, `cwd`, `limits` (model allowlist, effort cap), `session` (plugin id, `userConfig`, `isolatedSession`, `pluginSource` for a skills-directory or managed `@inline` plugin...) and `policy` (`hooksLockedToPlugins`, `managedPermissionRulesOnly`) |
| `ShellPermission`                      | the host's answer for one command, `(call: { tool, command, grants }) => 'allow' \| 'deny' \| 'ask'`: its rules (deny and ask beat the grants), then the skill's `grants`, then the mode. Tests build it from `matchRule`; the kit holds no rule engine here |
| `countSkillHooks`, `admitSkillHooks`, `hookSourceOf` | the hook limits per source and session (1,024 hooks, 16,384 matcher characters, a matcher counted once per hook); a skill past a limit registers none of its hooks |

Behaviour worth knowing: the inline form is recognized only at the start of a line or after
whitespace (`KEY=!`cmd`` stays literal); with bash a non-zero exit fails except exit 1 of `grep`,
`rg`, `egrep`, `fgrep`, `find`, `diff`, `test`, `[`, `git diff` and `git grep` (PowerShell: no `find`
or `diff`, plus `findstr`); each command runs under the `BASH_DEFAULT_TIMEOUT_MS` timeout (2 minutes by default) with stderr merged for bash;
a synced skill's commands are not run on the owner's machine (`isolatedSession` says otherwise).
The commands follow the Bash tool's rules: a command that reaches its timeout is moved to the
background when the runner reports it (`SkillCommandResult.background`; the kit asks for the move with
`moveToBackgroundOnTimeout` unless the line starts with `sleep`, background tasks are disabled or the
session is bare), and the skill renders with a note that names the task and its file, otherwise the
invocation aborts; a valid result past the inline ceiling is written through `ExpandPorts.scratch` and
injected as a path and a preview (`bashOutputMaxChars` sizes the ceiling); a failure past 10,000
characters is a head-and-tail excerpt. `disableSkillShellExecution` leaves a `managed` skill alone.
`Expansion.ignoredGrants` lists the `allowed-tools` the managed settings withheld. The host owns
registering and firing the hooks, the process, the working directory after a `cd`, starting the
background task, and keeping `EndConversation` out of `disallowed` while another tool remains.

### Skill visibility, access, stacking, lifecycle and forks (done: `skills/visibility`, `skill-rule`, `stack`, `lifecycle`, `fork`, `portable`)

```ts
import { stackSkills, skillNamesOf, invokeSkill, reattachAfterCompaction, launchFork } from '@rsaryev/claude-plugin-kit';
```

| Name                                          | Does                                                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `OVERRIDE_EXPOSURE`, `exposureOf(skill, overrides)` | the `skillOverrides` table as a registry over `on`, `name-only`, `user-invocable-only`, `off`: what Claude is told and whether the `/` menu lists the skill; the listing, the menu and `checkInvocation` all read it; `overrideMenuLabel` is the `/skills` label (`user-only`) |
| `skillNamesOf(skill, aliases?)`               | every name a skill goes by (command, nested unqualified name, synced forms, the host's aliases) for `PreparedCall.skillNames`, which a `Skill(...)` deny rule reads |
| `stackSkills(message, catalog, options?)`     | the first skill plus up to five stacked after it and the argument text they share; a fork, an open-ended command (`takesCommandArguments`), a hidden or unknown name ends the stack; non-interactive loads the first only |
| `invokeSkill`, `startTurn`, `reattachAfterCompaction` | the ledger of skill content in a conversation: a repeated identical rendering gets a note, a different one the full content again, grants clear at the next message, compaction keeps the latest invocation of each skill (5,000 tokens each, 25,000 in all, newest first) |
| `launchFork(execution, command, text, agents)` | what a `context: fork` skill starts: the agent type, the content as its task, its startup context (Explore and Plan load no CLAUDE.md), waiting or background, the tool set; an unknown agent is an error |
| `frontmatterIssues(text, path)`               | the hard error an upload, the Skills API or `package_skill.py` gives a field outside the Agent Skills spec; Claude Code accepts every field |

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

### Themes (done: `format/theme`, `theme-tokens`, `theme-write`)

```ts
import {
  readTheme, themeSlug, customThemeId, copyOfPluginTheme, themeColorToHex,
} from '@rsaryev/claude-plugin-kit';

const { theme, issues } = readTheme(themeSlug('themes/dracula.json'), text);
theme?.name; // `name`, else the slug
theme?.base; // one of THEME_BASES, `dark` by default
theme?.overrides; // token -> { form: 'rgb' | 'ansi256' | 'ansi', ... }, only valid colours
theme?.extraOverrides; // unlisted tokens as written, kept so a copy or a rewrite loses none
themeColorToHex(color, palette?); // '#rrggbb' for CSS; ansi colours from xterm's palette unless given
customThemeId('dracula'); // 'custom:dracula', what `/theme` stores
```

A theme file is `~/.claude/themes/<slug>.json`, or `themes/<slug>.json` in a plugin (`Plugin.themes`,
shown in `/theme` marked as from the plugin), with three optional fields: `name`, `base` (one of the six
presets `THEME_BASES`, asserted against the SDK's `theme` setting) and `overrides` (token to colour,
`THEME_TOKEN_NAMES`). Colours are `#rrggbb`, `#rgb`, `rgb(r,g,b)`, `ansi256(n)` or `ansi:<name>`; "Unknown
tokens and invalid color values are ignored", so each one is dropped with a warning and the theme still
loads, and `unknownTokens` lists the names of the tokens the reference omits ("a few single-purpose
accents such as onboarding screen colors": `/theme` sets them), whose raw values `extraOverrides` keeps.
`copyOfPluginTheme` is the copy a user's edit of a plugin theme is saved as, with those tokens written
back. A plugin theme is shown under `theme.name` with `plugin` as its origin; it has no `<plugin>:` name.
Colour forms are exact: `RGB(...)` and `ANSI256(...)` are not colours. The host applies the theme and watches the folder; the kit never renders.

### Workflows (done: `format/workflow-meta`, `workflow-script`, `agents/workflow`)

```ts
import { readWorkflowMeta, rewriteWorkflowMeta, inspectWorkflowScript } from '@rsaryev/claude-plugin-kit';

const { meta } = readWorkflowMeta(source); // name, description, phases, phaseEntries, whenToUse, extra
rewriteWorkflowMeta(source, { phases: ['Scan', 'Fix'] }).source; // every other byte kept
inspectWorkflowScript(source).issues; // Date.now(), Math.random(), new Date(), import(), unused phases
```

A saved workflow is a JavaScript script that begins with `export const meta = { name, description }` as
a literal; the kit reads and rewrites that literal without executing anything, and reports what workflows.md
says breaks a script: a `phases` entry no `phase()` call uses (and a `phase()` title with no entry, which
only gets its own group), `Date.now()`, `Math.random()` and a no-argument `new Date()` (they throw in the
script: pass a timestamp or a seed through `args`) and `import()` (the run fails before it starts). A script
without a readable `meta` is not listed: `Plugin.workflows` has `qualifiedName: undefined` for it.
A plugin's script runs as `/<plugin>:<meta.name>`. `phases` holds the titles and `phaseEntries` the entries as
written (an object entry keeps its other fields, and `MetaPatch.phases` takes them back); a lexical problem in
the body (an unterminated string, template or comment) leaves a valid `meta` readable, since the runtime reports
the body's errors when the workflow runs. A rewrite adds a field with the line ending of the block.

The runtime is the host's. The decisions its runs need are pure functions over facts the host holds:

| Function | Does |
| --- | --- |
| `admitAgent(started)`, `checkFanOut(call, items)`, `workflowConcurrency(env, cpus)`, `interruptRun(cause)` | 1,000 agents total per run, 4,096 items in one `parallel()` or `pipeline()`, 16 concurrent agents by default (`CLAUDE_CODE_WORKFLOW_MAX_CONCURRENT_AGENTS`, 1 to 256), and that a run pauses only for a permission prompt or a usage-limit wait, never for user input |
| `afterAttempt(endings)`, `attemptLabels`, `stallWindowMs`, `hasStalled`, `afterAgentFailure(site, failure)` | an agent whose output stops restarts at most five times, six attempts: `agent stalled on all 6 attempts`, `agent lost its reply on all 6 attempts`, or `agent abandoned after 6 attempts` listing the endings; `(retry n)` and `attempt n (stalled)` labels; `stallMs` over `CLAUDE_ASYNC_AGENT_STALL_TIMEOUT_MS` over the default (`defaultMs`: the host's risen default with `CLAUDE_STREAM_IDLE_TIMEOUT_MS`, which loses to both); inside `parallel()` or `pipeline()` the result is `null` and the run goes on, awaited directly the run ends with the error |
| `planReplay(saved, calls)`, `replayAgent(saved, state, call)` | which agents return their saved result on a relaunch: completed ones until the first call (prompt, and an options fingerprint when the host keeps one) that differs, failed ones and everything after them run again, a stopped-while-running one starts over (`RECORDED_WHEN_STOPPED`: stopping the whole run counts nobody as failed, stopping one agent counts as failing) |
| `relaunch(facts)`, `relaunchAfter(way, facts)`, `LEAVING` | leaving the session never continues the run; a relaunch replays the saved results, starts over when there is no earlier run, and fails with `nothing to resume` when the results cannot be found or a background session relaunches a script outside `~/.claude/projects/` |
| `checkAgentSchema(schema)`, `afterInvalidOutput(failures, env)`, `structuredOutputAttempts(env)` | a `schema` that provably contradicts itself (a `required` key that `additionalProperties: false` rules out) fails the call before the subagent starts, naming the key; output that fails validation five times (`MAX_STRUCTURED_OUTPUT_RETRIES` changes the count) fails it with the last failure |
| `usageLimitDecision(facts)` | the run pauses (no new agents start) only in an interactive subscription session with `autoContinueAtUsageLimit` on, a reset within 24 hours, fewer than two waits so far and a release with the wait (v2.1.271); otherwise the agent fails, with every cause listed |
| `workflowArgs(passed)` | the `args` global: structured data as given, `undefined` when omitted |
| `planWorkflowSave(request)`, `refuseLinks(plan, linked)`, `resolveSavedWorkflows`, `scanSavedWorkflows(folders, request)` | where a script is saved (`.claude/workflows/` of the closest existing folder up to the repository root, or `~/.claude/workflows/`, or `workflows/` under `CLAUDE_CONFIG_DIR`), the paths that must not be symlinks, and which `/<name>` runs (the closest project folder, then the personal one); the scan reads through `FolderScan` |

The size guideline and the off switches are in "Settings" (`createWorkflowSettingsPolicy`). The host
runs the scripts, measures time, writes the files and checks the links; the kit holds no run state.

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
| `Sha256`, `ArchiveReader`, `GitTags`, `SourceFetcher`, `StagedDirectory` | done | ports only marketplaces use (`src/ports/marketplace.ts`, `src/marketplace/ports.ts`), exported by the marketplace barrel. `ArchiveReader.scan(bytes, signal)` lists a zip's entries (`ArchiveScan`: path, size, `isSymlink`, `linkTarget`) without extracting; the kit derives the totals (`archiveStats`) and checks paths and links itself. `SourceFetcher.fetchPlugin` returns `{ files }`, or `{ stagedPath, files? }` for a directory the host staged, or a `PluginIssue`. `StagedDirectory` opens, atomically `commit`s (moves into the cache version folder, the earlier copy set aside and put back) and removes a staged directory; a failed `commit` is a `CommitFailure` (`busy`, `held`, `permission`, `aborted`, the file-system `code`, what became of the `previous` copy, the `leftOnDisk` folders) |
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
| `fetchArchive(plan, ports, signal)` | done | downloads an archive through `HttpClient` (256 MiB, 120 s, five redirects judged hop by hop, https and no blocked host, no headers after a cross-origin hop), checks the `sha256` through `Sha256` (a mismatch is the documented `Plugin archive integrity check failed for <url>: ...` message), the extraction limits (the 50-times ratio against the zip's own length) and the plugin root (top or one directory down) from the entries `ArchiveReader.scan` lists, and refuses an entry that would be written outside the plugin directory or a link that leaves it; returns the bytes, stats and root or a `PluginIssue` |
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
| `rangesOverlap(ranges)` | done | whether some version satisfies every range (`true`), none does (`false`) or there are too many `\|\|` alternatives to decide (`undefined`): the question `combineRanges` asks first, exported so a host that fetches a dependency at the combined range can skip the fetch for ranges no version meets and let `combineRanges` report `has conflicting version requirements` |
| `autoUpdateDecision({ dep, ranges, tags, currentCopyVersion? })` | done | what auto-update does with a constrained dependency: update to the highest tag in every range, skip when the ranges conflict, else update to the current copy unless its version is outside any range |
| `resolveDependencyVersion({ dep, ranges?, source, tags, currentCopyVersion? })`, `resolvedVersionLabel(resolved, commit?)` | done | what a constraint is checked against by source kind: a tag of its own repository (`github`, `url`, `git-subdir`; none in range is `has no git tag satisfying <range>`), a tag or else the current copy (`relative`), the plugin.json version (`npm`, `archive`, `command`); the tag version beats plugin.json; with `ranges` (every installed plugin's range on the dependency) several ranges resolve together (`combineRanges`); the label is the version `claude plugin list` shows, a tag's with its 12-character commit suffix (`2.1.0-8713c5b11005`) |
| `checkInstalledDependency(dep, installed)`, `checkDependency(dep, copies, loadsFromClaudeAi)`, `InstalledDependency`, `DependencyIssue` | done | a `PluginIssue` with the `errorType` of `claude plugin list --json` (`dependency-unsatisfied`, `dependency-version-unsatisfied`): `Dependency "<dep>" is not installed`, `... is disabled`, `Requires "<dep>" <range>, installed <version>`; a `--plugin-dir` copy skips the range; a claude.ai plugin meets a marketplace dependency only for a plugin loaded from claude.ai (no version passes), and the `@synced` note names it only while it is enabled |
| `crossMarketplaceDecision({ dep, requiredBy, root, declaringMarketplace?, enabledAtScope, declaredIn })` | done | `allowCrossMarketplaceDependenciesOn` of the root marketplace only, an already enabled dependency bypasses it; the refusal message and whether it refuses the install (`entry`) or installs without the dependency (`plugin.json`) |
| `installClosure({ root, scope, operation }, facts)`, `InstallPlan`, `InstallStep`, `DEPENDENCY_INSTALL_OPERATIONS` | done | the transitive install plan of a plugin's dependencies over plain `GraphFacts` (installed records with scope and `autoInstalled`, `enabledPlugins` per scope, the catalog, each marketplace's allowlist, `--plugin-dir` copies): dependencies first, each step an `install`, `enable` or `update` with who asked (`requiredBy`), every range on it, what they resolve against and the shown version; cycles end (each plugin once), a diamond combines both branches' ranges; a conflict, `has no git tag satisfying`, an entry-declared dependency outside the allowlist or one its marketplace does not list refuses the whole plan (`steps` empty, nothing changes); a `command` source, a `headersHelper` entry and a `plugin.json` dependency outside the allowlist are `leftOut` (the dependent then fails to load); the five operations that install missing dependencies are `install`, `reload-plugins`, `auto-update`, `reinstall`, `marketplace-add` (the docs give them one behaviour, so the plan is the same; it names the operation); a dependency already installed and enabled at the scope (by its own scope's `enabledPlugins`) gets no step but its declared dependencies are still planned; a plugin read from the catalog, the root above all, replaces the ranges its installed record put on a dependency; `hostVersion` (optional) emulates a Claude Code version: before 2.1.242 a `--plugin-dir` copy does not meet an entry that names a marketplace (`DeclaredDependency.namesMarketplace`), so it is installed |
| `checkDeclaredDependency(dep, facts, lookup?)`, `findDependencyCopy`, `namesMarketplace(item)`, `CopyLookup` | done | the load-time check of a declared dependency against what is installed or loaded with `--plugin-dir` (`<name>@inline`, no range check; an entry that names a marketplace matches it from Claude Code 2.1.242; a disabled copy is `is disabled — enable it or remove the dependency`) |
| `pluginDirFolders(path, listing, hostVersion?)` | done | which folders one `--plugin-dir` loads: itself when it is a plugin, else each child folder with a `plugin.json` (from 2.1.265) |
| `enablePlan(id, scope, facts)`, `EnableIssue` | done | what enabling a plugin does to its dependencies, transitively: installed-but-disabled ones are enabled (dependencies first); a missing one (with its `claude plugin install` command), one the plugin policy blocks, or one set to `false` at a higher-precedence scope (named) fails the enable and enables nothing |
| `disableDecision(id, facts)`, `dependentsOf(id, facts)`, `constraintsOn(dependency, facts)` | done | an enabled plugin that depends on the one named refuses the disable, naming the dependents and the chained command that disables them in order |
| `orphanedAutoInstalled(facts, scope)`, `planPrune(facts, scope, run)`, `planUninstall(id, scope, facts, prune)` | done | the auto-installed plugins no remaining plugin needs (transitive orphans included; a plugin the user installed is a root and never removed); the prune outcome by `--dry-run`, `-y` and the terminal with the docs' texts; uninstall with `--prune`, and the dependencies whose last constraining plugin left (`released`: they resume tracking their marketplace entry) |
| `computePluginVersion({ manifestVersion?, entryVersion?, source })`, `UNKNOWN_VERSION`, `SourceFacts` | done | the version Claude Code computes for a plugin (loading.md, "How Claude Code computes the version"): the manifest's `version`, then the entry's, then the source type's default, from facts the host gathers per source type: a commit shortened to 12 characters for `github` and `url`, `<commit>-<pathHash>` for `git-subdir`, the entry's `sha256` pin or else the downloaded file's digest for `archive`, the commit of the installed directory for a `relative` path (only a repository of the plugin's own directory or its marketplace counts, never an enclosing one; none is `unknown`), `unknown` for `npm`, and for a `command` source `<hash>` or `<manifest version>-<hash>` with the entry's version ignored. The facts are a registry typed over the plugin source kinds; hashing, git and the manifest are the host's |
| `sourceFactsOf(source)`, `archiveFacts(source, bytes, sha256)`, `versionCacheSegment(version)` | done | the helpers a host needs around `computePluginVersion`: the facts an entry alone gives (kind, a pinned `sha` as the commit, the `sha256` pin of an archive) so the host adds only what it learns; the facts of an `archive` after the download, hashed through the `Sha256` port; and the version as one safe cache directory name (percent-encoded; the docs name the directory but not how an unsafe version is spelled) |
| `isUpdate(installed, computed)`, `checkForUpdate(subject, installed)`, `loadsInPlace(source, origin)`, `upToDateMessage(name, version)` | done | when a new copy is made: only when the computed version differs, as a string, from what `installed_plugins.json` records (a pinned version keeps the cached copy while commits move, an omitted one tracks the commit, the same version on two refs does not update, no record installs); a marketplace subject is `{ source, origin, version }` and a plugin that `loadsInPlace(source, origin)` (a relative path of a marketplace added from a local path, a `command` source in `link` mode) is `loaded in place`, never compared; `upToDateMessage` is `<name> is already at the latest version (<version>).`; a claude.ai plugin's version is the one claude.ai records, its manifest `version` is no input |
| `checkReleaseChannels(first, second, manifests?)` | done | a release-channel pair (host-marketplace.md, "Run release channels") as a hosting author's check on two `marketplace.json` values: the same `name` is an error, a plugin both list with the same declared `version` (the `plugin.json` of each ref first, from `manifests`) or the same repository, `ref` and `sha` is a warning; an omitted version is fine, the commit SHA tells the refs apart |

`SourceFetcher` is for what only a host can do (a git clone with sparse checkout, an `npm pack`):
it takes the git and npm plans and returns the fetched files, the directory the host staged them in
(`{ stagedPath }`, installed by `StagedDirectory.commit`) or a `PluginIssue`. A missing port is
a `PluginIssue` for that source only.

### Install (done: install records, the troubleshooting texts, scopes, plans and `/reload-plugins`)

What Claude Code keeps on disk about what is installed, and what it says and does around an
install (plugins/loading.md, "Check which stage a plugin reached", "Find plugins on disk";
plugins/troubleshooting.md; plugins/install.md; plugins/cli-reference.md, "/reload-plugins"). All
of it is pure, in `src/marketplace/`; the only effect is the `PluginStateStore` port, and no `node:path`
is used: a path is built with the host's `join` (`Locations.joinPath`).

```ts
import { createStoreLayout, loadInstalledPlugins, stageReport } from '@rsaryev/claude-plugin-kit';

const layout = createStoreLayout(root, (base, relative) => locations.joinPath(base, relative));
const { read } = await loadInstalledPlugins({ store, sha256, clock }, signal); // rebuilds or sets aside on the way
const report = stageReport({ id, enabled, records: read.records[id] ?? [], existing, loaded });
```

| Name                                            | Status  | Does                                                                              |
| ----------------------------------------------- | ------- | --------------------------------------------------------------------------------- |
| `resolvePluginsRoot({ home, override?, configDir?, join })`, `createStoreLayout(root, join)`, `classifyStoreEntry(name)`, `STORE_NAMES` | done | the plugins root (`CLAUDE_CODE_PLUGIN_CACHE_DIR`, else `plugins` under `CLAUDE_CONFIG_DIR`, else `~/.claude/plugins`) and every path under it: `cache/<marketplace>/<plugin>/<version>`, `data/<id>`, `marketplaces/<name>`, `synced/`, `.trash/`, `installed_plugins.json`, `known_marketplaces.json`, `known_marketplaces_claudeai.json`, `flagged-plugins.json` and the dated `.set-aside` and `.unreadable` copies |
| `parseInstalledPlugins(text)`, `serializeInstalledPlugins(records)`, `InstallRecord`, `InstalledRecords` | done | `installed_plugins.json` (version 2: per id a list of `{ scope, installPath, version, ... }`): a file that is not a list of plugins is `rebuilt` (old text kept), a key that is not a plugin id (a key named `__proto__` too) is `setAside`, a record that does not parse is `unreadable` and `writable` is `false` until it is gone, a format this version does not know is `unknownFormat`; unknown fields are kept |
| `loadInstalledPlugins({ store, sha256, clock }, signal)` | done | reads the file through `PluginStateStore` and carries out the recovery: the dated `.kept` copy then a fresh file, the dated `.set-aside` copy then the file without those records, nothing written while a record cannot be read |
| `PluginStateStore`, `StateStoreFailure` | done | the port: `read(name)`, atomic `write(name, text)`, `names()`, `modifiedAt(name)` and `remove(name)` of the files under the plugins root (`src/ports/marketplace.ts`); the kit takes no lock, so a host with more than one session over a root serialises the calls that rewrite `installed_plugins.json`; the fake is `tests/support/plugin-state.ts` |
| `sweepAgedCopies({ store, clock }, { cleanupPeriodDays? }, signal)`, `agedCopies({ entries, nowMs, cleanupPeriodDays? })`, `DEFAULT_CLEANUP_PERIOD_DAYS` | done | the dated `.set-aside` and `.kept` copies age out on the `cleanupPeriodDays` schedule (default 30, minimum 1): the planner picks the copies older than the period, the sweep removes them through the port |
| `parseKnownMarketplaces(text)`, `serializeKnownMarketplaces(map)`, `KnownMarketplace` | done | `known_marketplaces.json`: per name `{ source, installLocation, lastUpdated, autoUpdate? }`; `failure` is `unreadable` (`Failed to load marketplace configuration`, with `JSON Parse error: Unexpected EOF` for an empty file) or `corrupted` (`Marketplace configuration file is corrupted`) |
| `installLocationFor(source, name, layout)`, `sameMarketplaceSource(a, b)` | done | `marketplaces/<name>` for a clone, the path you gave for a local `file` or `directory`; "same type and the same value in every field" |
| `stageReport(facts)`, `planMarketplaceStartup(declared, known)`, `unresolvedAfterStart(plugins, fetched)` | done | declared, fetched and loaded, with the layers a plugin lacks (settings, disk, session); what happens after the start to a declared marketplace `known_marketplaces.json` lacks (clone) or whose source changed (re-fetch and `Plugins changed. Run /reload-plugins to activate.`); the enabled plugins left `not cached` |
| `decideEnabledFetch(facts)`, `overriddenUserDisable({ user, decidedBy, on })` | done | "enabled in project settings but not installed" (fetch only when user, an untracked local file, `--settings` or managed set `true`; a relative path or a seed needs none; else the Errors tab entry) and "disabled in user settings but still loads" (the row's text and the opt-out) |
| `pluginNotFound`, `pluginNotFoundAnywhere`, `alreadyInstalledGlobally`, `alreadyAddedFromDifferentSource`, `noMarketplaces`, `failedToInstall`, `notCached`, `enabledNotInstalled`, `pluginDirectoryNotFound`, `pluginDirectoryMissingAtRun`, `installActivation(facts)`, `failureOnce` | done | the texts of "Install a plugin" and "Plugin installed but not working" that the docs quote, verbatim; an Errors tab entry is `{ message, guidance }` |
| `unreadableRecordsMessage(ids)`, `unknownFormatMessage(version)`, `refuseForUnreadableRecords(command, name, reason)`, `refusalResultLine(command, refusal)`, `recoveryNotes(names, layout)` | done | the `installed_plugins.json` messages: one record or several, a format this version does not know, the refusal of `install`, `uninstall` and `update` with `failureCode: "install_records_unreadable"`, the notes `claude plugin list` prints while a dated copy sits beside the file |
| `ignoredReason(name, entry, checks)`, `ignoredLine(name, reason, surface)`, `untrustedSource(name, entry)`, `untrustedSourceMessage(name)` | done | `Marketplace "<name>" is added but ignored`: the first failing check (location, git URL, URL, settings declaration, name from `loadNameIssues` with the entry's source) and its line for `claude plugin list` or the Errors tab; a reserved name registered from a source that is not an `anthropics` GitHub repository is `untrustedSource`, with the untrusted-source message |
| `scopeReach(scope)`, `mostSpecificScope`, `defaultScope(command, listedIn)`, `collaboratorInstallCommand(id)` | done | the user, project and local scopes: file, audience, reach; local beats project beats user; the scope a command acts on without `--scope` |
| `pluginActions`, `closePanel`, `uninstallChoice`, `marketplaceCommand`, `planMarketplaceUpdate`, `marketplaceTabUpdate`, `planMarketplaceRemoval` | done | the `/plugin` panel and the marketplace commands as plans: the details menu, closing with pending changes (run, queue while a response streams, or warn), `y`/`u` for a project-enabled plugin, list/update/remove from a shell or a session (the update line is `Successfully updated ...` in a shell and `✔ Updated N marketplace(s)` in a session) |
| `planInstall(id, scope, graph)`, `planEnable(id, scope, graph)`, `planDisable`, `planInstalledUninstall`, `planInstalledPrune` | done | what each does to declared dependencies over a graph of `PluginNode` (`installedScopes`, `enabledIn` per scope): install and enable bring them in at the target scope (dependencies first; a plugin already installed there says so), enable fails for a dependency that is not installed, blocked by policy or set to `false` above the target scope, disable is refused with a chained command, uninstall leaves auto-installed ones for `prune` |
| `reloadSummary(counts, { interactive })`, `reloadGate(change, { force, interactive })`, `parseReloadArguments`, `reloadAllowed`, `skillCount` | done | the `Reloaded: ...` line, the refusal `This reload changes MCP tools (...)` unless `--force`, no MCP connect in a session without an interactive terminal, the remote-connection reply |
| `orphanSweep({ remaining, orphans, nowMs, layout })`, `dirsToOrphan(removed, remaining, layout)`, `orphanMarkerPath`, `ORPHAN_GRACE_MS` | done | the `.orphaned_at` marker and the sweep 14 days later, only while an install is recorded; only version folders inside the plugin cache are marked or swept, so the source directory of a plugin loaded in place is never deleted |
| `resolvePluginVersion(input, sha256)`, `isVersionSegment`, `PluginVersion`, `VersionInput`, `VersionSource`, `VersionOrigin`, `UNKNOWN_VERSION` | done | the version of an installed plugin as loading.md computes it: manifest `version`, then the entry's, then what the source gives (12-character commit for `github`/`url`, and `<12-character commit>-<8-hex path hash>` for `git-subdir`, whose input always carries its `subdir`; the `sha256` pin or download digest for `archive`, the commit of a relative path only when its directory or marketplace is a Git repository (`inGitRepository`) and outside an enclosing repository, `unknown` for `npm` and a local directory); a `command` source is always `<manifest version>-<12-hex hash>` or the bare hash, the entry's `version` ignored; a marketplace hosted on claude.ai gives the version the host reports as recorded (`origin: 'claude-ai'`). A version that is not one folder name (`../x`, `a/b`) is skipped, since it names the cache folder (`isVersionSegment`). The host reads the facts; the kit decides |
| `copyModeHash(files, sha256)`, `linkModeHash(realPath, files, sha256)`, `subdirectoryPathHash(path, sha256)`, `shortHash12(hex)` | done | what a `command` version is hashed from: the copied files in path order, or a linked directory's real path and top-level names; the 8-digit hash of a `git-subdir` path; listing order never depends on the port |
| `unknownVersionSteps(plugin, unknownScopes)`, `PluginRef` | done | the four steps out of `Version: unknown` for a git-sourced plugin (given as `{ name, marketplace }`) and one rerun per writable scope still showing it, each scope once |
| `pluginNames(merge, marketplace)`, `lookupPlugin(entries, name, marketplace, refresh)` | done | the entry name is the install id, `enabledPlugins` key and cache folder; the manifest name is the namespace; installing by the manifest name is `Plugin "<name>" not found in marketplace "<marketplace>"` |
| `folderOf(id, platform)`, `folderCollisions({ incoming, installed, platform, surface })` | done | ids that are the same once `.` and `@` are `-` (and capitals on macOS and Windows) share a folder: the later one is refused with `"<plugin>" was not installed: it would share its folder with "<other>"` |
| `listingFields(entry, manifest, stage)`, `DisplayFields` | done | the display fields users see: the entry's value when it sets one, else `plugin.json`'s; before install `plugin.json` is read only for a relative-path entry |
| `decideInstallMode({ origin, platform, printed? })`, `InstallDecision`, `InstallOrigin`, `linkedPluginLoads(decision, printed, platform)` | done | how a plugin is installed: a `--plugin-dir` directory, a skills-directory plugin and a relative path of a marketplace added from a local path load `in-place`; a `.zip` or `--plugin-url` archive is extracted into a session temp directory first; a `command` source in `link` mode is `link-in-cache` (no dependency install, refused on Windows); everything else is a `copy` into the cache (the only mode that installs Node.js packages and needs an update to show an edit). A printed directory that is a UNC path on Windows, or the session's directory or a parent of it, fails; a session started in a link-mode directory or below it does not load the plugin |
| `planTreeCopy(entries, { pluginRoot, marketplaceRoot?, copying? }, limits?)`, `pluginRootIssue`, `isWithin`, `linkReach`, `relativeFrom` | done | what copying a plugin tree does with each entry, over the real paths a host resolved: a symlink within the plugin is kept as a relative link (`relinks`), one elsewhere in the marketplace is dereferenced (`dereferences`; the host lists the directory and plans it again with its real path added to `copying`), one outside it is skipped; a link to a directory that is, or contains, one being copied (the marketplace root, the plugin's parent) is skipped as a `cycle`; without a marketplace only links within the plugin survive; `limits` refuse a tree over 256 MiB or 20,000 entries (the message names the limit given). `escapedPathIssue({ component, written, platform, resolvesTo?, roots? })` (`format/path-escape`): a component path with `..`, an absolute path, a backslash on macOS and Linux, or a symlink out of the plugin (links within one marketplace are allowed) is `<component> path escapes plugin directory: <path>`; the loader's `locate` decides every declared path through it |
| `planInstallStart({ source, fetch })`, `planInstallFinish(input)` | done | an install in two pure steps: the fetch plan and the install mode (a refusal once; a source kind this build cannot fetch is `This plugin uses a source type your Claude Code version does not support...`), then, with the version known and the platform, the cache folder `cache/<marketplace>/<plugin>/<version>/` (none for a plugin loaded in place, which needs no folder-safe version), whether the host `copy`s into it, the links of a link-mode entry with `mustStayAt` (the printed directory, which must stay where it is; a link-mode install without the directory or its entries, or with an entry name that is empty, `.`, `..` or has a `/`, plans nothing), the new `installed_plugins.json` records (a project folder spelled two ways on Windows is one install) and the version folders an update leaves to orphan (only inside the cache, never a folder in use). The host creates a link-mode entry from `links` and writes the `.orphaned_at` markers |
| `archiveIntegrityMessage`, `npmRefusalMessage`, `UNSUPPORTED_SOURCE_TYPE`, `manifestFailureMessage`, `failedToInstallPlugin`, `moveFailureMessage(path, failure)`, `settingsIgnoredWarning(path, problem)`, `commitStagedPlugin(...)` | done | the troubleshooting messages of a failed install: the integrity check, an npm `package` that is not a registry package, an unsupported source type, a corrupt or invalid manifest, the failed move into the cache with the fate of the earlier copy, and a settings file that does not load; `commitStagedPlugin({ staged, stagedPath, destination, plan?, signal })` installs a staged directory and returns the move message as an issue; a plain move is right only when the tree holds no links, so a tree with links is committed with the `TreePlan` of `planTreeCopy`, which `StagedDirectory.commit` applies (relink, dereference, skip). The host also creates a link-mode entry from `InstallFinished.links` and writes the `.orphaned_at` markers itself |
| `archiveStats(scan, zipBytes)`, `unsafeEntryIssue(scan, root)` | done | the totals the extraction limits judge (entries, largest file, total, ratio against the zip's own length) and the first entry that leaves the plugin directory, over a scan |
| `selectUninstall(records, { plugin, layout, scope, projectPath?, platform })` | done | the records one uninstall removes: at project and local scope the record under the command's own spelling of the folder, else (on Windows) the one under another spelling of it; with no folder named, or no record, nothing is removed and the issue says `Plugin "<name>" is not installed in <scope> scope` (or that the scope needs a folder); `orphaned` lists the version folders it leaves inside the cache |
| `readLfsPointer(text)`, `lfsPointerIssue(path)`, `lfsPointerIssues(files, signal?)`; `lfs: 'pointer-files'` on a git `FetchPlan` | done | a git clone never downloads LFS content, so an LFS-tracked file arrives as a pointer file: the plans say so, a pointer (LF or CRLF line ends) is recognised, and `lfsPointerIssues` warns for each pointer file of a cloned plugin |
| `pluginDirArgument`, `pluginUrls`, `readPluginDirectory(files)`, `folderChanges(...)`, `fetchSessionArchives(urls, ports, signal)` | done | `--plugin-dir` (a directory or a `.zip`), `--plugin-url` (several, space-separated), a folder of plugins (no `.claude-plugin/` and no components, or a catalog beside the plugin folders: each subfolder with a manifest loads), a plugin added or removed mid-session (held when it would invalidate the prompt cache), and archives fetched at startup with load errors instead of a failed start |
| `inlinePluginId`, `skillsDirPluginId`, `sessionOnlyRow`, `copyThatLoads`, `stopLoadingSkillsDirPlugin` | done | `<name>@inline` session-only plugins (listed only when the flag precedes the subcommand, scope `session`), which copy of a name loads, and how to stop a skills-directory plugin |
| `planInstallCommand(command)`, `shellInstallLines`, `shellInstallPrelude`, `installSummary(facts)`, `planPluginCommand({ host, plugin? })`, `planPluginApply(host, origin)`, `scopeChoices(host)`, `installWith(host)`, `loadsInstalledPlugins(host)`, `marketplacesAddedAtStart(...)` | done | what `/plugin install` (opens the details, installs nothing) and `claude plugin install` (installs, user scope by default) do, `--marketplace` (confirmed in a session, added without a prompt from a shell and declared in user settings), the official marketplace added first on a new machine and at the first interactive terminal start, the install summary's last line, and what each host (terminal, JetBrains, desktop app, VS Code, `claude -p`, Agent SDK, cloud) offers: what `/plugin` opens (Discover with no name), the scopes the surface offers, when an install takes effect (VS Code: open sessions without a restart; a shell: next start or `/reload-plugins`) |
| `planNodeDepsInstall(input)`, `nodeDepsRun(plan, env, signal)`, `NodeDepsInput`, `NodeDepsPlan` (`NodeDepsInstall` or `NodeDepsSkip`), `DEPS_ORIGIN_OF_MODE`, `INSTALL_TIMEOUT_MS`, `readLockfile(name, text)`, `readPackageJson(value)` (a value that is not an object is `'unreadable'`, a skip of its own), `LOCKFILE_NAMES`, `UNSUPPORTED_LOCKFILES`, `NodeDepsSkipOf<reason>` | done | the Node.js package dependencies of a plugin (loading.md): `{ plan, issues }` from the origin (`copied`, `in-place`, `inline`, `linked`; only a copy installs, a plugin loaded in place resolves against its source directory), the root `package.json` and the lockfiles found (`bun.lock` > `npm-shrinkwrap.json` > `package-lock.json`, the first match; `bun.lockb`, `yarn.lock`, `pnpm-lock.yaml` and a `lockfileVersion` outside npm 2 or 3 and Bun at most 2 skip the install; a missing package manager skips it without trying the other). It skips for npm `overrides` with an npm lockfile, Bun `patchedDependencies` with `bun.lock`, a dependency that is not a registry package, a lockfile package not pinned to an exact version, a download link that is not `https` (unless under the user's own default registry) and a `package.json` that does not list what the lockfile lists. A skip is a union over its reason, each member carrying typed fields (the lockfiles, the package manager, the links) rather than a list of strings. An install is `npm ci --ignore-scripts` or `bun install --frozen-lockfile --ignore-scripts`, in a separate install folder that receives only `package.json` and the lockfile and gives `node_modules` back, under a 60-second timeout: no new port, `nodeDepsRun` makes the `CommandRun` for `CommandRunner`; `stage.moveBack.replaceExisting` says the plugin's own `node_modules`, if any, is replaced. When to plan (an install, an update to a new version, a session start for an uncached enabled plugin) is the host's decision: the plan takes no trigger |
| `nodeDepsNote(copy, plan, id)`, `skipReasonText(skip)` (the clause after `because`, for a host that words its own message, such as `Node.js packages were not installed: <clause>`), `updateRetriesInstall(note, trafficDisabled)`, `installOutcome(result)`, `NodeDepsNote`, `CachedCopy` | done | what the user sees: on an enabled plugin whose cached copy has a lockfile, runtime dependencies and no `node_modules`, `The packages it lists are not installed` with the `claude plugin update` command (the install can run, and the update retries it unless `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` is set) or `were not installed, because ...` (it cannot run, updating does not help, a hook into `${CLAUDE_PLUGIN_DATA}` does); the note is a warning, the plugin loads. `installOutcome` turns a finished run into installed or failed (timed out, aborted, did not start, exit code) with the end of the output |
| `classifySpecifier(text)`, `dependencyRefusal(specifier)`, `specifierRefusals(packageJson)`, `downloadLinkRefusal(link, defaultRegistry)`, `SpecifierKind` | done | the registry-only rule shared by an npm source's `package` value and the dependencies of `package.json`: git and GitHub, folder, workspace, linked and tarball specifiers are not registry packages (an `npm:` alias is, as a dependency), and a download link of any other scheme, or with none, is refused too: it must use `https` unless it lies under the user's own default npm registry |

Names: the kit's `MarketplaceSource` is a union on `kind` (`github`, `git`, `url`, `npm`, `file`,
`directory`, `settings`, ...), and `known_marketplaces.json` writes that kind under `source` as the
settings key does. A host that stores a local marketplace as `source: 'local'` (Localix) migrates it
once to `directory` (a folder) or `file` (a `.json` path); the kit never reads or writes `local`.
`parseMarketplaceInput(text)` is the one function that reads what is typed after `marketplace add`;
the source object of a file or a settings key is `parseMarketplaceSource(raw, { policy })`. A host
function of the same name as either keeps its own name or imports the kit's under an alias; the kit
does not rename a public export for another host.

## Updates (done: `updates`)

```ts
import { refreshBeforeInstall, marketplaceAutoUpdate, autoUpdatePassAllowed } from '@rsaryev/claude-plugin-kit';

const decision = refreshBeforeInstall({ ref: 'formatter@acme', command: 'claude plugin install', marketplaces, lookupMissed: false, env, clock });
// { outcome: 'refresh', marketplaces: ['acme'] } | { outcome: 'skip', reason } | { outcome: 'refuse', issue }
```

Every function is pure over data and two ports (`Environment`, `Clock`); the host fetches, clones,
runs commands and writes files. Pages: plugins/loading.md ("Versions and updates"), install.md
("Keep plugins updated"), host-marketplace.md ("Keep users up to date", "Change the command of a
command source"), org.md ("Set update policy") and settings-reference.md ("Updates and versioning").

| API | Status | What it does |
| --- | --- | --- |
| `refreshBeforeInstall({ ref, command, marketplaces, lookupMissed, env, clock })`, `refreshFailed(command)`, `KnownMarketplace` | done | what an install refreshes before the lookup: `name@marketplace` refreshes the named marketplace through `/plugin install` and `claude plugin install`, whatever its `autoUpdate` and `DISABLE_AUTOUPDATER`; a bare `name` refreshes only the auto-update marketplaces and only after a miss through `/plugin install`, and nothing through the CLI; skipped for a local `file` or `directory` source, an inline `settings` source, a seed marketplace, a refresh within 30 seconds (`Clock`) and `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`; a marketplace managed settings block is refused (the install too); `refreshFailed` installs from the cached catalog and `claude plugin install` reports `marketplace not refreshed` |
| `marketplaceAutoUpdate(facts)`, `autoUpdatePassAllowed(env)` | done | the settings entry's `autoUpdate`, then `known_marketplaces.json`'s, then the default (on for the official names but `knowledge-work-plugins` and `first-party-plugins`, on for claude.ai marketplaces, off otherwise), a seed marketplace off; `DISABLE_UPDATES`, `DISABLE_AUTOUPDATER` and the traffic variable turn the whole pass off unless `FORCE_AUTOUPDATE_PLUGINS` |
| `toggleDecision({ name, enable, env, declared? })`, `toggleLabel(facts)` | done | the **Enable auto-update** toggle: hidden when the pass is off, refused with `Auto-update for '<name>' is set by` when a managed entry sets the field, otherwise the files to write (`known_marketplaces.json`, and the settings entry that declares the marketplace) |
| `pluginSkippedByAutoUpdate(candidate)`, `planAutoUpdatePass(marketplaces, env)`, `armFirstPass({ clock, env, random, run })`, `firstPassDelayMs(random)`, `pluginUpdatedNotice(name)` | done | the plugins a pass leaves (a `headersHelper` entry, a `command` source) and the Errors tab; one pass's refreshes and updates; the first pass after a random delay of up to ten minutes on the `Clock`; the `Plugin updated: <name> · Run /reload-plugins to apply` notice. The hourly repeat of a host is its own choice |
| `backgroundCheckAuthenticates(credentials)`, `backgroundCheckResult(credentials, remote)`, `afterBackgroundCheck(result, env)`, `afterReclone(ok)` | done | the unattended check of a private marketplace: an SSH key in the agent or a stored HTTPS credential authenticates, a helper that must prompt does not; leave an up-to-date checkout, re-clone on new commits or a failed check, keep the checkout when the clone fails or `CLAUDE_CODE_PLUGIN_KEEP_MARKETPLACE_ON_FAILURE` is on |
| `commandSourceRuns(event, plugin, env)`, `runsAfterAnswer(plan, accepted)`, `afterCommandRun(result)` | done | the runs of a `command` source (every install and update; once per session and at startup or `/reload-plugins` for a version missing from the cache, both skipped by the traffic variable only), a changed or switched command stops the background runs and gives an Errors-tab entry with the new command and `claude plugin update <id>`; an install, or an update of a changed command, runs only once the user accepts it; a changed hash installs and reloads (with the reload notice), or asks for `/reload-plugins` when the prompt cache would be invalidated |
| `planUpdate(request, installed, registered)` | done | `Update plugins now`: one plugin; **Update marketplace** (listing, then the plugins installed from it, and the `command` and `headersHelper` ones left to the user); `claude plugin marketplace update [name]` refreshes listings and updates no plugin |
| `readVersionPolicy(layers)`, `pickAllowedVersion(policy, versions)`, `startGate(policy, { command, current })`, `channelSwitch({ from, to, currentVersion, answer? })` | done | `autoUpdatesChannel`, `minimumVersion` (never blocks a start), `requiredMinimumVersion` and `requiredMaximumVersion` (managed only): what an update may install, the refusal to start outside the range (`claude update`, `claude install` and `claude doctor` stay available), and what the `/config` channel switch writes (only `latest` to `stable` asks; the same channel is a no-op) |

## CLI (in progress: `cli`)

```ts
import { startMarketplaceAdd, concludeMarketplaceAdd, startUninstall, concludeUninstall, planSessionFlags, renderCommand } from '@rsaryev/claude-plugin-kit';

const start = startMarketplaceAdd({ source: 'your-org/your-marketplace', scope: 'project', json: true });
// { kind: 'fetch', source, scope: 'project', json: true } | { kind: 'claudeai', name, json: false } | { kind: 'done', output }
const done = concludeMarketplaceAdd(start, { name: 'your-marketplace', alreadyOnDisk: false, registered });
renderCommand(done.output, { json: true }); // { stdout: ['{"command":"marketplace-add","outcome":"ok",...}'], stderr: [], exitCode: 0 }

const begun = startUninstall({ plugin: 'formatter@my-marketplace', scope: 'project' }, { graph, tty });
// { kind: 'remove', id, scope, keepData, prune } | { kind: 'done', output }
if (begun.kind === 'remove') {
  const ended = concludeUninstall(begun, { remaining: [] }); // what the host read back after removing the record
  // ended.cleanup: [{ id, deleteSaved: true, deleteDataFolder: 'formatter-my-marketplace' }] (G8)
}

const plan = planSessionFlags({ '--plugin-dir': ['./my-plugin'], '--bare': true }, facts);
// plan.sessionPlugins, plan.skipped, plan.env, plan.refusals ...
```

The kit has no CLI of its own: each documented command is a pure plan or decision whose outcome a host
carries out (print the lines, exit with the code, write the settings file, delete the cache). Pages:
cli-reference.md ("CLI commands", "CLI flags"), plugins/cli-reference.md ("claude plugin commands",
"JSON result format", "JSON result for marketplace commands", "plugin marketplace add", "list",
"remove", "update", "Flags that load a plugin for one session"), plugins/org.md (`disableSideloadFlags`)
and errors.md (the startup refusals). `claude agents`, `claude mcp`, `claude mcp login` and
`claude mcp logout` are host-delegated rows of the command table, not proven behaviour.

| API | Status | What it does |
| --- | --- | --- |
| `commandSucceeded`, `commandFailed`, `marketplaceSuccess`, `marketplaceFailure`, `usageError`, `noResultLine`, `unexpectedError`, `renderCommand(output, { json, before? })`, `PluginCommandResult` | done | the result of a command: `command`, `outcome` `ok`/`failed`, `message` always, `failureCode` and other fields when they apply; with `--json` the last stdout line is that object, a usage error prints no result line and exits `1` with the reason on stderr, a name that can print no result line (`anthropic-plugin-directory`) exits `1`, an unexpected error exits `2` |
| `chooseScope(command, given)`, `detectScope(command, declaredAt)`, `writeScope(plugin, requested, declaredAt)`, `scopeFlagSpelling(command)` | done | the scope grammar: `user`, `project`, `local` (`managed` for `update`), the default per command (user; auto-detect; every scope for `marketplace remove`), auto-detect local then project then user (then managed), an override at a scope that takes precedence and the `Plugin "<name>" is installed at <scope> scope, not <scope>` refusal elsewhere, `-s` only on plugin commands |
| `resolveCommand(words)`, `COMMAND_TABLE`, `PLUGIN_SUBCOMMANDS`, `MARKETPLACE_SUBCOMMANDS` | done | the words a host routes: `plugins`, `i`, `remove`, `rm`, `autoremove`, `new`, `marketplace rm`; an unlisted word under `plugin` is unknown, under `mcp` and `agents` an argument |
| `startMarketplaceAdd(args)`, `concludeMarketplaceAdd(start, fetched)` | done | `claude plugin marketplace add`: the source forms (`parseMarketplaceInput`), `--scope`, `--sparse` for `github` and `git` only, `--claudeai` (refuses `--scope` and `--sparse`, `--json` has no effect), the name checks, the `Successfully added marketplace: <name> (declared in <scope> settings)` and `already on disk` lines, the declaration to write and the dependency installs of installed plugins that lacked them |
| `planMarketplaceList(request)` | done | `Configured marketplaces:` and one `Source:` line each, `No marketplaces configured`, the `From claude.ai:` section, and the `--json` array whose fields (`name`, `source`, `repo`, `url`, `path`, `ref`, `installLocation`, or `marketplaceId` and `organizationUuid` for claude.ai) depend on the source type |
| `planMarketplaceRemove(args, facts)` | done | the declarations to remove (every scope, or `--scope`), and from the last scope the cache and every plugin installed from it with its options, secrets and data |
| `planMarketplaceUpdate(args, facts)` | done | the listings to refresh (a pinned `ref` stays pinned), never a plugin; `Successfully updated marketplace: <name>` or a count; no name refuses `--json`; a seed-managed marketplace is skipped in bulk |
| `planSessionFlags(given, facts)`, `startupRefusal(plan)` | done | the 20 session flags of `claude` summed into a `SessionPlan` (session-only plugins of the `inline` origin, the customizations skipped, the variables set, the settings scopes and `--settings` layer, the working directories, the agents, the channel entries, the MCP sources, the permission mode, the tools) and the refusals that exit `1` without starting (`disableSideloadFlags`, the 2 MiB settings file, an invalid `--agents`, both subagent-prompt flags) |
| `skippedBy(mode)`, `managedPolicyUnderSafeMode(kind)`, `mcpSourcesRead(plan)`, `pluginFoldersOf(request, listing, hostVersion?)`, `sessionAgent(flag, setting)`, `addDirLoads(facts)` | done | the exact set each mode skips, what safe mode keeps of managed policy, where MCP servers are read from under `--strict-mcp-config` and `--bare`, the plugins a `--plugin-dir` folder holds, the flag over the `agent` setting and what an `--add-dir` directory loads given the modes and setting sources (`addDirLoads({ bare, claudeMdEnabled, skipped, settingScopes? })`; `planSessionFlags` fills `plan.addDirLoads`, `plan.agent` and `plan.readsStoredCredentials`) |
| `startInstall(args, context)`, `planInstall(pending, found, sha256)` | done | `claude plugin install`: `startInstall` reads `-s`, `--config`, `-y`, `--accept-command`, `--marketplace` and `--json` and says which marketplace to add first (declared in the user settings) and refresh (`refreshBeforeInstall`); `planInstall` is the ladder: the plugin looked up, `Plugin "<id>" is already installed (scope: <scope>)` with exit `0`, the `--config` values checked, the dependency closure (`installClosure`), a command-source or `headersHelper` entry printed and accepted by `-y`, the `--accept-command` sha256 or the answer to `Run this command now? [y/N]` (`Aborted.`, `Aborted — the command was not run.`, `-y` ignored inside a session), and the `shownCommand` of a refused `--json` run; the effects to carry out are `InstallEffects` |
| `decideAcceptance(request, sha256)`, `digestOf`, `exclusiveAcceptFlags` | done | a displayed command accepted or not: the digest covers exactly the command, the plugin and the catalog the run read after its own refresh, a digest that no longer matches is shown again with `acceptCommandMatched: false` |
| `planPluginUpdate(args, facts, sha256)`, `concludeRetry(request, outcome)` | done | `claude plugin update`: the scope auto-detected local, project, user, managed, a bare name matched against the installed plugins (an ambiguous one lists the qualified commands), `<name> is already at the latest version (<version>).`, a changed command source or `headersHelper` accepted as in install, and the retry of an unfinished dependency install in the cached copy that fails the command only when the retry fails |
| `planEnable(args, facts)`, `planDisable(args, facts)` | done | `claude plugin enable` and `disable`: the scope detected local, project, user (the first that mentions the plugin) or an override at a scope that wins, `is installed at <scope> scope, not <scope>` elsewhere, `already enabled`/`already disabled` with exit `1` (`already_in_goal_state`, `alreadyInGoalState`), the dependency cascade and its three refusals, dependents and an organization-required synced plugin refusing a disable, `--all` and the `Please specify a plugin name or use --all` line; the `enabledPlugins` entries to write are `writes` |
| `planPruneCommand(args, facts)`, `answerPrune(plan, yes)` | done | `claude plugin prune`: `--dry-run`, `Nothing to prune`, `Remove? [y/N]`, `-y` and `Removed N auto-installed plugins: <names>`, no terminal without `-y` lists and removes nothing, exit `0` whatever is answered, scope `user` by default, never a plugin the user installed |
| `startUninstall(args, facts)`, `concludeUninstall(start, after)`, `uninstallRetention(facts)` | done | `claude plugin uninstall`: `Successfully uninstalled plugin: <name> (scope: <scope>)`, `Failed to uninstall plugin "<plugin>":`, `settings_still_on`, `--prune` (orphans, `-y`, refused with `--json`) and G8: from the last scope the plugin's options, secrets and data directory go, except `--keep-data`, another plugin on the same folder (an id differing only in case) and records that cannot be read back (`savedKept: "install_records_unreadable"`); `keptData` in `--json` and `· data preserved` in `/plugin` |
| `planConfigure(args, facts)`, `checkGiven`, `unsetKeys` | done | `claude plugin configure`: the options with `required`/`optional`, `sensitive`, `set`/`not set` and never a saved value, the `--json` object (`schema`, `choices`, `inputs`, `configured`, `unconfigured`, never a sensitive value), `--values-stdin` validated and saved or refused whole with `Failed to save configuration:`, only the full `name@marketplace` id (`No installed plugin has the id "<plugin>".`) |

Where the docs name no wording or effect (the stream of a human line, the usage error of a refused
flag combination, the text of a refused flag value) the choice is in `spec/judgments.md`.

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
validation, no manifest and no `fallbackName`, a guard hook that cannot be read, or an inline
`mcpServers` entry of the manifest that cannot be read: spec/judgments.md, "oracle 2.1.319 overrides
docs"); any other problem is an issue and skips that component while the rest loads.

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
  readonly workflows: readonly PluginWorkflow[]; // path, file name, `<plugin>:<meta.name>`, the read `meta`
  readonly themes: readonly PluginTheme[]; // path, slug, the plugin it is marked as from, the read `Theme` (shown under `theme.name`, no `<plugin>:` prefix)
  readonly settings: PluginSettings; // official `Pick<Settings, 'agent' | 'subagentStatusLine'>`
  readonly userConfig: Readonly<Record<string, UserConfigOption>>;
  readonly bin: readonly string[]; // the files directly in bin/
  readonly hasBin: boolean; // bin/ exists, empty or not
}
```

| API | What it does |
| --- | --- |
| `loadPlugin({ files, fallbackName?, bundles?, bundleSettings?, platform?, roots?, signal? })` | the optional manifest, discovery, every reader; all issues collected |
| `classifyPluginFolder({ files, signal? })` | `'plugin'` or `'folder-of-plugins'` for a folder a host was given as a whole (`--plugin-dir`): a folder of plugins loads none of itself, only its children with a `.claude-plugin/plugin.json` (plugins/create.md, "Load a folder of plugins") |
| `discoverComponents(files, manifest, pluginName, options?)` | paths and names only (no file parsed): the default location and the manifest's paths per kind, containment (`..`, an absolute or drive-letter path, a backslash on macOS and Linux, a symlink that leaves the plugin and is not a link to another plugin of its marketplace) and existence (`<component> path escapes plugin directory: <path>`, `<component> path not found: <path>`) checked; `options` are `signal`, `platform` (default `posix`) and `roots` (`{ pluginRoot, marketplaceRoot? }`) |
| `STANDARD_LAYOUT`, `COMPONENT_KINDS`, `declaredKey(manifest, kind)` | the registry typed over the component kinds: default location, manifest keys, combine rule, extension; the first manifest key set wins (`experimental.themes` over `themes`) |
| `COMBINE` | `replace` (`commands`, `agents`, `outputStyles`, `workflows`, `experimental.themes`, `experimental.monitors`: the default is not scanned, with the warning `Default <folder>/ folder is ignored because the manifest sets "<key>"` unless a declared path is inside the folder), `add` (`skills`), `merge` (`hooks`, `mcpServers`, `lspServers`: the default first) |
| `COMPONENT_READERS` | the seam: one reader per kind over what discovery found. Skills, commands, agents and output styles keep path, name and text until the streams that own those formats plug in a parser |
| `mergeHooks(sources)` | the hooks of several sources joined per event, in loading order |
| `readPluginSettings(raw, origin)`, `hasAppliedSettings(read)` | `settings.json` or the inline `settings`: only `agent` and `subagentStatusLine` take effect, the rest is dropped with a warning; `settings.json` wins when it sets one |
| `binPathEntries(plugin, pluginId, locations)`, `pathWithPluginBins(userEntries, bins)` | the absolute `bin/` directory when the plugin has one, and its place after the user's own `PATH` entries; the host changes the `PATH` |
| `distribution(plugin, target)`, `DISTRIBUTION_TARGETS` | `claude.ai` and Cowork do not install a plugin that has `bin/`; the host refuses the install |
| `resolveProcesses(plugin, scope)` | every MCP server, language server and monitor of a plugin resolved for this host; an entry that must not start is left out with its issue |

Loading never calls the resolvers: the host loads, then resolves with its scope.

### Repository plugins and workspace trust (done: `loading/repository-*`, `trust-gates`, `workspace-trust`, `local-settings-trust`, `folder-plugin`, `plugin-scaffold`, `plugin-debug`)

What a repository may bring (plugins/loading.md, "Trust check and component limits for repository
plugins", "Check why a repository plugin didn't load"; permissions.md, "What runs before you trust a
folder"; hooks.md, "Workspace trust"). All pure: the host answers the facts, the kit decides.

```ts
import { decideRepositoryPlugin, loadRepositoryPlugin } from '@rsaryev/claude-plugin-kit';

const verdict = decideRepositoryPlugin({ origin: 'skills-dir', folderTrusted, parentTrusted: false,
  nonInteractive: false, primaryDirIsRoot: true, worktree: false });          // { load, reason, from }
const loaded = await loadRepositoryPlugin({ files }, 'skills-dir');            // limits applied
```

| API | What it does |
| --- | --- |
| `decideRepositoryPlugin(facts)`, `repositoryCauses(facts)`, `REPOSITORY_ORIGINS` | whether a project `@skills-dir` plugin, a project-scope marketplace plugin or a plugin of `~/.claude/skills/` loads: the folder itself must be trusted (a parent's trust and `-p` never suffice; your own skills folder is exempt), the plugin sits in the session's primary directory (parents are not searched), a managed block (`SkillsDirBlock`) stops both skills folders; in a worktree it is read from the main checkout |
| `explainRepositoryPlugin(facts)` | the decision with each cause in words (`/cd`, the trust dialog, `/status` and `Enterprise managed settings`) |
| `loadRepositoryPlugin(input, origin)`, `repositoryLoadInput`, `limitRepositoryPlugin`, `COMPONENT_LIMITS` | `loadPlugin` for a repository-supplied plugin: MCP servers wait for the per-server approval of a project `.mcp.json` (`approvals`), a bundle (`.mcpb`, `.dxt`, a URL) is skipped with an issue, a server file outside the directory is refused, monitors do not load; one limit per component kind, none for `~/.claude/skills/` |
| `WorkspaceTrust` (port) | `isFolderTrusted(path, signal?)`: whether the dialog was accepted for the key; the host stores it |
| `workspaceTrustKey(facts)`, `workspaceTrustState(trust, facts, signal?)`, `manualTrustEntry(key)` | the key (repository root, the main checkout in a worktree, the start directory outside a repository; the home directory is not persisted), `folder` / `parent` / `none`, and the `~/.claude.json` entry that trusts by hand |
| `settingsHooksMayRun(nonInteractive, state)` | interactive sessions hold hooks of every settings file until the dialog; `-p` and the SDK treat the folder as trusted |
| `projectEntryApplies(entry, folderTrusted)`, `trustDialogListing(permissions)` | `allow` and `additionalDirectories` of a project file apply only once trusted; `deny` and `ask` always |
| `trustSituation(facts)`, `contentGate(content, situation)`, `CONTENT_GATES` | the docs' table, one row per kind of repository content: used, held for the dialog, asks per server, never; the stderr line and the static-`headers` fallback; a nested repository follows the dialog (or the `-p` column) |
| `localSettingsVerdict(facts)` | when `.claude/settings.local.json` needs trust: tracked in git or a `.claude` symlink; git runs only once trusted; the configuration home applies it at once |
| `probeFolder(files, folderName, origin)`, `skillsDirPluginEnabled`, `skillsDirCommands(plugin, folder)` | whether a folder is a `@skills-dir` or `@inline` plugin (a manifest is required in a skills directory, optional for `--plugin-dir`), its id, `defaultEnabled`, root skill and components, and the commands (`/my-tool`, `/my-tool:example`) |
| `planPluginScaffold({ name, scope, withSkills? })` | the files `claude plugin init` writes under `~/.claude/skills/<name>/` (or the same layout under `.claude/skills/<name>/` to share through a repository) and the two lines it prints; the host writes |
| `pluginDebugSteps(facts)`, `COMPONENT_CHECKS` | the ordered "Test and debug" checks |

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
| `prepareContentSubstitution(scope)`     | `substituteContent` made synchronous: the three path variables are asked for once (the data folder is created then), and the returned function substitutes a body with the same rules |
| `locationsWithoutPlugin(locations)`     | the `Locations` of a hook of no plugin (a settings file's): `${CLAUDE_PLUGIN_ROOT}` and `${CLAUDE_PLUGIN_DATA}` stay as written, the rest delegates |

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
| `McpBundleReader` (port, optional) | the host opens a `.mcpb` or `.dxt` (extract into `.mcpb-cache`, or download) and returns `{ name, server, userConfig? }`; the kit never unzips or downloads, and does not unzip: it reads the MCPB manifest (`readMcpbManifest`, see "MCP contracts") the host extracted |
| `resolveMcpServer(name, server, scope)` | stdio: `command`, `args`, `env` substituted, the three path variables in `environment`; http, sse and ws: `url`, `headers`, `headersHelper` substituted, credential variables read as empty in `url` and `headers`; a `headersHelper` that references `${user_config.*}` keeps the server from starting |
| `resolveChannel(channel, servers, scope)` | a `channels` entry against the plugin's servers: `server` must be a key of `mcpServers` (else an issue and no `resolved`), `displayName` defaults to the server name, and the channel's `userConfig` options join the plugin's so `${user_config.KEY}` in that server's `env` takes the saved value; `loadPlugin` reports a `channels[i].server` that names no server as an error issue (the plugin still loads) |
| `validateUserConfigValues(config)` | one error per declared option whose value (saved, else `default`) would not be accepted: `required` and empty, a value of the wrong `type`, `multiple` not an array of strings, outside `options`, below `min` or above `max`; the dialog is the host's |
| `rejectUserConfigInShell(guard, template, context, path)`, `HEADERS_HELPER_GUARD` | the shell-field check on the template, with the message errors.md quotes; monitors and shell-form hooks pass a guard of their own |

#### Servers of the settings scopes (done: `format/mcp-env`, `credential-env`, `mcp-endpoint`)

Pure over a lookup function (`(name) => string | undefined`, for example `(n) => env.get(n)`), so they
need no plugin and no `SubstitutionScope`. Plugin servers resolve through `resolveMcpServer`, which
shares the per-reference rule (`resolveEnvReference`) with this expander, so the two cannot drift.

| API | What it does |
| --- | --- |
| `expandMcpServer(name, server, lookup)` | `${VAR}` and `${VAR:-default}` in `command`, `args` and `env` (stdio) or `url` and `headers` (remote; `headersHelper` is left as written). Returns `{ server, issues, missing, debug }`: an empty string counts as set so its default is ignored; an unset variable with no default keeps the `${VAR}` text and is a warning (`missing` is the `claude mcp list` warning's data); a covered credential variable reads as empty in `url` and `headers` only, with no warning; `server` is `undefined` with an error `'url' is not a valid URL` when the expanded `url` does not parse; `debug` has one line per covered variable the user has set, containing `never expanded toward a remote server` and never a value |
| `expandEnvText(text, lookup, readsAsEmpty?)` | the same rule for one string: `{ text, missing, credentials }` |
| `displayReference(server, scope)` | the URL or command line `/mcp`, `claude mcp list` and `claude mcp get` show: the `${VAR}` reference by name for `local`, `project` and `user`; `https://host/…` for `managed` |
| `displayHeaders(server, scope)` | the headers `claude mcp get` shows, as `{ name, value? }`: names without values for `managed`; as written for `local`, `project` and `user` (a judgment); none for a stdio server. Like `displayReference`, give it the entry as written, not the result of `expandMcpServer` |
| `mcpEndpointKey(server)` | equal for two servers exactly when they are one endpoint: URLs that differ only in the case of scheme or host, the scheme's default port or a trailing slash; a different path, query, userinfo or non-default port is two; a stdio server is its `command` and `args`. Plugins and connectors are matched with the servers above them by this key |
| `CREDENTIAL_ENV_NAMES`, `readsAsEmptyTowardRemote(name)`, `credentialDebugLine(name)` | the five names mcp.md writes (`ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `AWS_BEARER_TOKEN_BEDROCK`, `HTTPS_PROXY`, `NPM_TOKEN`), matched exactly; `ANTHROPIC_BASE_URL` and `API_KEY` expand |

| `isCredentialVariable(name)`, `withoutCredentials(env)`, `FIXED_CREDENTIAL_NAMES` | the one credential classifier of every command the kit runs without the user's credentials: a name with `TOKEN`, `SECRET`, `PASSWORD`, `KEY` or `AUTH` in either letter case, less Git's `GIT_CONFIG_KEY_<n>`, plus a fixed list (`ANTHROPIC_CUSTOM_HEADERS`, the docs' one name; the OpenTelemetry exporter headers, a judgment); marketplace and MCP helpers both use it |
| `scrubAction(name, value)`, `hasUrlPassword(value)`, `withoutUserinfo(value)` | the table of env-vars.md "What the subprocess environment scrub removes" as data: `remove`, `keep` or `cut-userinfo` per variable (a credential name or a URL with a password removed; the GitHub tokens, `HTTP(S)_PROXY` and `GIT_CONFIG_*` kept whatever they hold; `CLAUDE_CONFIG_DIR` removed; registry URLs lose their userinfo) |

#### Subprocess environment scrub (done: `loading/resolve/subprocess-scrub`)

| API | What it does |
| --- | --- |
| `scrubEnvironment(snapshot, { version })` | pure: the environment a subprocess gets when `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` is on in the snapshot (`1`, `true`, `yes` or `on`, any casing); the snapshot copied unchanged when it is not. `version` below `2.1.251` removes only `ANTHROPIC_API_KEY` and `AWS_SECRET_ACCESS_KEY`; an unreadable version is the current table |
| `subprocessScrubEnabled(snapshot)` | whether the switch is on |

The Linux PID namespace the scrub gives Bash subprocesses (`ps`, `pgrep` and `kill` cannot see host
processes) is a process option, not an environment edit: it stays the host's, as does setting the
variable for `claude-code-action`.

#### MCP `headersHelper` (done: `loading/resolve/headers-helper*`)

```ts
import { persistedTrust, planHeadersHelper, runMcpHeadersHelper, connectionHeaders } from '@rsaryev/claude-plugin-kit';

const trust = { source: persistedTrust(claudeJson, projectDir), key: projectDir, interactive: false };
// `expandedVariables`: the environment variables the expansion of `url` substituted
// (the `environment` entries of `substituteSurface(...).referenced`); only those are redacted
const server = { name, url, expandedVariables, headersHelper };
const plan = planHeadersHelper(server, 'project', trust, context);
if (!plan.loaded) return skipServer(); // an agent file's server in an untrusted folder
if (!plan.run) return connectWith(staticHeaders, plan.notice); // helper skipped: static headers alone
const output = await runMcpHeadersHelper(plan, runner, signal); // { headers } | PluginIssue
if ('severity' in output) return reportIssue(output); // the helper failed
const { headers, oauthFallback } = connectionHeaders(staticHeaders, output.headers);
```

| API | What it does |
| --- | --- |
| `planHeadersHelper(server, origin, trust, context)` | pure, made again on every connection: where to run (`cwd`: plugin root; project directory for `project` and `local`; primary working directory for `agent-project`, `sdk`, `mcp-config`; configuration directory, `CLAUDE_CONFIG_DIR` or `~/.claude`, for `user`, `managed`, `connector`, `agent-user`, `agent-managed`, `agent-flag`, `agent-add-dir`), the environment (credentials removed for `project`, `plugin`, `agent-project`, `agent-add-dir`; `CLAUDE_CODE_MCP_SERVER_NAME`, `CLAUDE_CODE_MCP_SERVER_URL` with the live value of each removed variable the URL expanded (`server.expandedVariables`) replaced by `REDACTED`, and `CLAUDE_PLUGIN_ROOT` for a plugin only), the 10 second limit; or `{ run: false, loaded: true, headersOnly: true, notice }` for a project or local server with a helper in a folder without persisted trust (a server with no helper gets no notice), or `{ run: false, loaded: false }` for an agent file's server in an untrusted project or `--add-dir` directory |
| `persistedTrust(claudeJson, key)`, `TrustSource` | `projects["<key>"].hasTrustDialogAccepted === true` is `persisted`; only that counts: `parent-folder` and `automatic-session` (the `-p` and SDK trust for settings hooks) never do |
| `runMcpHeadersHelper(plan, runner, signal)` | runs the command through `CommandRunner` (shell form, `bash`; the host maps the shell on Windows), no cache; a failure, a timeout or output that is not a JSON object of strings is a `PluginIssue` |
| `connectionHeaders(static, dynamic)` | dynamic headers override static ones of the same name (any letter case); `oauthFallback` is `false` once either holds an `Authorization` header |
| `attemptWithHeadersHelper(phase, produce, send, server)` | `produce` runs the helper (plan and run, made again each time) and gives its headers; `send` merges the static ones. A call answering 401 or 403 re-runs the helper once and retries once (`needs-authentication` only if that fails too); a rejection while connecting is `failed`, with no re-run, and carries errors.md's `Server rejected the Authorization header minted by the configured headersHelper (HTTP <status>)` issue when the helper supplied `Authorization` |

The origins are the settings scopes plus the places the three tables of mcp.md name; a ranked
candidate's `scope` is one of them. Where the notice goes (`stderr` in `-p` and SDK sessions, the debug
log in an interactive one) is in the plan.

A bundle whose own `user_config` has a required setting with no saved value is not started and
reports `Bundled MCP server "<name>" was not started: it needs configuration`; the rest of the
plugin loads. Without a `McpBundleReader` a bundle is a warning. Paths given to the reader are
relative to the plugin root, like every `PluginFiles` path. The server's tool prefix is `rules`'
`pluginMcpServerName`; `mcpServerKey` is the `plugin:<plugin>:<server>` name `/mcp` shows.

### MCP contracts (done: `format/mcp-contract`)

Everything is pure data over an `EnvLookup` function `(name) => string | undefined`; connecting, the
OAuth browser flow, the keychain, the prompt, the dialog and the stored configuration are the host's.
The knob readers (`mcpTimeouts`, `mcpConnectTimeoutMs`, `mcpDescriptionLimits` and the startup readers
of `mcp-startup`) are the one place the `MCP_*` variables are read.

```ts
import { readMcpAdd, readMcpAddJson, prepareMcpTool, limitMcpResult, mcpOutputLimits, answerElicitation } from '@rsaryev/claude-plugin-kit';

const added = readMcpAdd(['--transport', 'http', 'api', 'https://x.example/mcp', '--client-id', 'abc'], lookup);
// added.server, added.oauth (callbackPort filled from MCP_OAUTH_CALLBACK_PORT), added.secret, added.issues
const prepared = prepareMcpTool(tool, { rewriteRootCombinators: true, excludeInvalid: true });
const verdict = limitMcpResult(result, mcpOutputLimits(lookup, hints, countTokens)); // inline | persist | error
```

| API | What it does |
| --- | --- |
| `readMcpOAuth(name, raw, origin)`, `mcpOAuthRedirectUri(port)`, `mcpOAuthDiscovery(...)`, `requestedOAuthScopes(...)`, `planMcpOAuth(...)`, `mcpAuthRejection(...)`, `storedTokenRecovery(...)` | the `oauth` block (`clientId`, `callbackPort`, `authServerMetadataUrl`, `scopes`), the `http://localhost:<port>/callback` redirect, the two discovery paths or the configured metadata URL, the scope the request asks for (a configured `scopes` restricts, `offline_access` handling), the plan for a server (none for stdio and ws), the state after a 401, and what to do with a stored token |
| `readMcpAdd(argv, lookup, existing?)`, `readMcpAddJson(name, json, options, lookup)` | `claude mcp add` and `add-json` as data: `{ name, scope, server, oauth, secret, issues }`; `MCP_ADD_SCOPES`, `mcpServerExistsMessage`; a name in `existing` (`mcpAddKey(scope, name)`, or `options.existing`) is refused with that message; `--client-secret` asks for a secret (prompt, or `MCP_CLIENT_SECRET`), the flags and the variable never reach `server` |
| `mcpToolName`, `pluginMcpServerName`, `normalizeMcpServerName` | the `mcp__<server>__<tool>` name (moved from `rules`, which re-exports them) |
| `mcpToolSendCheck(fullName)`, `MCP_TOOL_NAME_LIMIT` | a full name over 128 characters is left out, with the debug line |
| `readMcpToolHints(entry)`, `requiringInteraction(server, tools)`, `MCP_RESULT_SIZE_CEILING` | `anthropic/maxResultSizeChars` and `requiresUserInteraction` (only the JSON `true` counts); the second feeds `DecideContext.requiresUserInteraction` so approval holds in every mode |
| `modelVisibleMcpTool(entry)` | whether a server lists a tool for Claude: `_meta.ui.visibility` without `model` hides it, absent or malformed leaves it visible (a judgment) |
| `boundedMcpErrorText(text)` | the text of an error Claude receives: over about 11,000 characters only the first and last 5,000 stay, for a failed call as for an error result |
| `readMcpbManifest(manifest, platform)`, `bundleServerOf(manifest, variables)`, `fillBundleSettings(value, saved)`, `requiredBundleSettings(manifest)`, `missingBundleSettings(required, saved)`, `bundleSettingKey(server, key)` | an MCPB bundle's own `manifest.json` (a judgment: the format is not in the docs): the `name`, the `server.mcp_config` or `entry_point` for the platform with its `platform_overrides`, the `user_config` options; `${__dirname}`, `${HOME}`, `${/}`, `${pathSeparator}` substituted and `${user_config.<key>}` rewritten to `${user_config.<server>.<key>}`, which `fillBundleSettings` fills from the plugin's saved values; a required option with no default and no saved value keeps the server from starting. A host's `McpBundleReader.open` passes `bundleServerOf(...)` as `server` |
| `prepareMcpTool(tool, policy)` (a `McpListedTool`: the SDK's `Tool` name and description, an input schema of any type), `excludedToolsNotice`, `refusedSchemaFallback` | a root-level combinator rewritten to an object schema, an invalid input schema excluded with a notice, a schema the API refused sent without parameters |
| `mcpOutputLimits`, `limitMcpResult`, `persistedResultMessage`, `imageResultNote`, `mcpImageFiles`, `oversizedMcpMessage` | `MAX_MCP_OUTPUT_TOKENS` (default 25,000, warning at 10,000), the 50,000-character persistence, error results cut in the middle, images saved, the 16 MiB WebSocket message and HTTP/SSE response size |
| `listablePrompts`, `mcpPromptListing`, `mcpPromptCommand`, `readMcpPromptInvocation` | MCP prompts as `/server:prompt (MCP)` commands and the arguments they take |
| `declaredElicitation`, `elicitationModes`, `elicitationUrlChoices`, `urlArgumentLength`, `answerElicitation`, `elicitationFormFields`, `elicitationHookFacts`, `autoRespondElicitation`, `overrideElicitationResult` | the modes a client declares, the form fields a schema defines and the answer to a form or link, the 8,000-character URL argument cap, the `Elicitation` and `ElicitationResult` hook input and output |
| `mcpTimeouts` (with `idleMs`), `mcpConnectTimeoutMs`, `mcpDescriptionLimits`, `cutMcpDescription`, `MCP_ENV_BASELINE`, `mcpStdioEnvironment`, `claudeAiConnectorsFetched` | `MCP_TIMEOUT`, `MCP_TOOL_TIMEOUT`, `CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT`, `MCP_CONNECT_TIMEOUT_MS`, `CLAUDE_CODE_MAX_MCP_DESCRIPTION_LENGTH`, `CLAUDE_CODE_MCP_ALLOWLIST_ENV`, `ENABLE_CLAUDEAI_MCP_SERVERS` |
| `mcpConnectionBatches`, `mcpBackgrounding`, `mcpStartupWaitsFor`, `mcpFirstTurnWaitMs`, `mcpDiscoveryCache`, `mcpCacheEntryUse`, `mcpCacheDiscardedAfterFailures`, `mcpClientSettings` | `MCP_SERVER_CONNECTION_BATCH_SIZE`, `MCP_REMOTE_SERVER_CONNECTION_BATCH_SIZE`, `CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS`, `CLAUDE_CODE_DISABLE_MCP_TASK_BACKGROUND`, `MCP_CONNECTION_NONBLOCKING`, `CLAUDE_CODE_MCP_STARTUP_WAIT_MS`, `MCP_DISCOVERY_CACHE` with `_TTL_S`, `_MAX_STALE_S` and `_STRIKES`, `MCP_SDK_GENERATION`, `MCP_PROTOCOL_NEGOTIATION` |
| `planMcpReload`, `skipsStdioConnection`, `MCP_FAILURE_SKIP_MS`, `SKIPPING_CONNECTION` | which servers a `/reload-plugins` stops, starts and keeps; the 15-minute skip of a stdio server that failed |
| `redactPluginServer(server)` | what `claude mcp get` and `list` show for a plugin's stdio or ws server |

A plugin server that uses an unset `${VAR}` is now the error `Invalid MCP server config for
"<name>": Missing environment variables: ...` and is not started (it was a warning that kept the
text); a `url` that uses an unset option reports `URL is unset or invalid`, any other bad one
`has an invalid MCP url`. `readConfigFlag` reads `plugin install --config <server>.<key>=<value>`;
the CLI itself is the host's.

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
| `resolveMonitor(monitor, scope)` | `command` gets the three path variables and `${ENV_VAR}`; `${user_config.*}` in it is the errors.md message and `resolved` is `undefined`, with no value needed; `environment` is empty (nothing exported, no `CLAUDE_PLUGIN_OPTION_<KEY>`) unless the scope opts in with `monitorPaths: 'environment-reference'`: then `command` holds `${CLAUDE_PLUGIN_ROOT}` (braced, as the template wrote it) instead of the path and `environment` carries the path variables the command references, so a path with shell metacharacters is never parsed as shell and the command line is the same when run with `environment` |
| `monitorsToStart(monitors, event, started, mode)` | pure: `always` starts on `session-start` and `plugin-reload`; `on-skill-invoke:<skill>` starts on `skill-invoked` for that skill, the first time only; nothing starts when `mode.interactive` is false (`-p`). With `featureFlagsAvailable: false`, a supplied host `version` must be at least `2.1.310` |
| `monitorsToStop(started, event)` | no running monitor is stopped by `plugin-disabled`; `session-ended` returns all the started names for the host to stop |
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
| `mergeWatchPaths(current, effect)`         | done    | the dynamic watch list after one output: its `watchPaths` replace the list (each once), `[]` clears it, an output without the field leaves it |
| `hasRunnableHandler(entries, session, event)` | done | whether a registered handler of the event passes the gates and has a type the event supports (matchers and `if` are not read) |
| `settleDeliveries(background)`, `groupDeliveries(deliveries)` | done | `HookOutcome.background` as `{ additionalContext[], systemMessages[], wake? }`: the first awaits the promises (a rejected one delivers nothing), the second groups deliveries already in hand |
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
| `createHookEngine(ports, options)`         | done    | `dispatch(registry, { event, facts, session, signal })`: select, build the input, run every handler (at most 12 prompt or agent hooks at once), read each run, merge; returns a `HookOutcome`. Option `shellPaths: 'environment-reference'` keeps a bash hook's path variables for the shell to read from its environment |
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
`permissionDecision` with `permissionDecisionReason` and `updatedInput` (`resolveDefer` says whether
a `defer` applies: `-p` and a single tool call); `permissionRequest` (the `decision`
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

Outcomes that need the host's facts:

- **Background hooks.** `HookOutcome.background` holds one promise per `async` or `asyncRewake` hook
  that settles when its process ends, with a `BackgroundDelivery`: `outcome` (`completed`,
  `cancelled` for a process the session killed at teardown, `timed-out`, `failed`),
  `additionalContext` and `systemMessage` of the JSON response (the response is alone on stdout or on
  a line of its own; a field of the wrong type is dropped) and `wake` (an `asyncRewake` hook that
  exited 2: its stderr, or stdout when stderr is empty). The host delivers `additionalContext` and
  `systemMessage` to Claude on the next turn, never to the user, and wakes Claude at once on `wake`
  even when the session is idle. `async` is only a field of command hooks, and its `timeout` is not
  enforced (it is on `asyncRewake`).
- **A runner that tells a capture is held open.** The answer of a `CommandRunner` may carry
  `outputHeldOpen: true` (declare the answer as `HeldOpenResult`, exported from `hooks`, so the
  compiler checks the name; the `CommandRunner` port itself does not type it) when the hook's own process ended while a process it started still held its
  stdout or stderr. The run is then refused with `refusing to honor the suspect capture`, as a block
  where exit 2 blocks and a non-blocking error elsewhere; an exit 2 stays an exit 2. Output printed
  after the hook's own process exited is never part of the run: the runner returns at that exit.
- **An interrupt.** `DispatchRequest.interrupt` is the key the user pressed while a tool ran
  (`{ key: 'esc' | 'enter' | 'ctrl-enter', queuedShellCommand? }`), read for `PostToolUse`:
  `ctrl-enter` caps every command hook that has a limit at 10 seconds whatever its `timeout`, `enter` changes
  nothing, `esc` cancels the hooks at once (none runs) and `ctrl-enter` acts as `esc` with a queued
  `!` command or `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1`. An aborted `signal` that cancelled a
  `UserPromptSubmit` hook makes `HookOutcome.interrupted`: the prompt did not go ahead
  (`proceed: false`) and `restoreInput` says whether its text returns to the input (it does not when
  a hook blocked the prompt at the same moment).
- **The observer.** `HookObserver.finished` reports each run's `status` and, for a command hook whose
  process ran to the end, its `exitCode` (the debug log's "hook ran with its exit code").
- **A blocked prompt.** The block message of `UserPromptSubmit` ends with `Original prompt:` and the
  submitted text unless a hook printed `suppressOriginalPrompt: true` (a decision block and an exit 2
  alike). The host still writes the text wherever it keeps its transcript.
- **The Stop cap.** The engine counts consecutive holds of a `Stop` (and each subagent's
  `SubagentStop`): an exit 2, a `decision: "block"` or an `additionalContext` that keeps Claude
  working. After `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` of them (default 8, `0` for none) the next hold is
  lifted: `proceed` is `true`, `effects.continuesTurn` is dropped and a warning issue says so. A Stop
  that holds nothing, and any `PreToolUse`, `PostToolUse` or `PostToolUseFailure` dispatched for the
  session (or the subagent, by `agent_id`), start the count again ("resets each time Claude calls a
  tool"), also when no hook is registered. The counter is `HookEngineOptions.stopCap`
  (`createStopBlockCap()`); an engine built per run passes one that outlives it, owns its lifetime
  and calls `reset(sessionId, agentId?)` when the session ends.
- **A plugin that blocks.** An exit-2 block of a plugin's hook ends with `This hook comes from the
  <plugin> plugin.`; a plugin command hook whose directory is gone does not run (on unless the engine
  gets `checkPluginDirectories: false`) and reports `Failed to run: Plugin directory does not exist: <path> (<plugin> — run /plugin
  to reinstall)`.

- **A worktree path.** A `WorktreeCreate` command hook cannot return JSON: its stdout is the path, and
  `HookOutcome.stdout` holds it raw. `resolveWorktreePath(outcome, { ranIn, repositoryRoot?, isSymlink? })`
  reads it as the docs do (the last non-empty line, ANSI escapes stripped by `stripAnsi`; an HTTP hook's
  `effects.worktreePath` wins when both answer) and returns `{ path }` or `{ failure }`: a hook that
  failed or printed no path, an absolute path with a `.` or `..` segment and a path through a symlink
  below `repositoryRoot` (the host's `isSymlink` probe; the kit reads no file system) fail, naming the
  component; a relative path is resolved against `ranIn` with its `.` and `..` collapsed. That the
  result is a directory the session can enter is the host's to check.
- **A deferred tool call.** `resolveDefer(effects, { interactive, toolCalls })` says whether a
  `PreToolUse` `defer` pauses the turn (`deferred`: `-p` and a single tool call), is `ignored` with a
  warning issue (interactive session, or several tool calls: the normal permission flow runs) or is not
  a defer (`none`).
- **The permission check.** `preToolUseHookOutcome(outcome)` turns a `PreToolUse` outcome into the
  `DecideContext.hook` the rules read (`decision`, `blocked` for an exit 2, `hasUpdatedInput`), which is
  how `AskUserQuestion` and `ExitPlanMode` stay unapproved by an `allow` without `updatedInput`.
- **A task completed.** `DispatchRequest.taskCompletedBy` (`task-update` or `teammate-turn`) says what
  fired `TaskCompleted`: a `TaskUpdate` call ignores `continue: false`, a teammate's finished turn is
  stopped by it and an `ok: false` prompt hook then behaves as on `TeammateIdle`. Without it
  `effects.stopCondition` (`teammate-finished-its-turn`) tells the host where `continue: false` holds.
- **Terminal sequences.** A `terminalSequence` is handed on only when `HookSession.interactive` is true
  ("in non-interactive mode with the `-p` flag and in the Agent SDK, it ignores the field"); whether the
  interface is on screen is the host's. A `PermissionDenied` `retry: true` is dropped, with a warning,
  when the denial `reason` starts with `Auto mode could not evaluate this action` (no verdict).

`buildHookInput` puts `session_id`, `prompt_id` (absent until the first prompt), `transcript_path`,
`cwd`, `scratchpad_dir` (absent without a scratchpad), `permission_mode` and `effort` (on the events
that have them), `hook_event_name`, and `agent_id` and `agent_type` (inside an agent, or `agent_type`
under `--agent`) from the session, so a host passes only the event's own facts. A fact with the wrong
type or an unlisted value makes an error issue and no input; a field that belongs to other cases (the
cost fields of `SessionStart` outside resume and fork, `globs` of `InstructionsLoaded` outside
`path_glob_match`, a task field of another task type) or to no field of the event is dropped with a
warning. The free text of `Stop` and `SubagentStop` tasks and crons is capped at 1000 characters with
the `… [+N chars]` marker.

### Hook environment and `CLAUDE_ENV_FILE` (done: `hooks/handlers/command/env`, `scrub`, `powershell`, `hooks/env-file`)

A command hook's process gets the host's environment with the settings files' `env` written over it
(`RunContext.settingsEnv`, from `resolveSettingsEnv`), with its credentials removed when
`CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` is `1` (`scrubEnvironment`: the docs' table, a name or value that
"looks like a credential" being a judgment) and without the `OTEL_*` variables; then the variables
Claude Code exports: `CLAUDE_PROJECT_DIR`, `CLAUDE_PLUGIN_ROOT`, `CLAUDE_PLUGIN_DATA`,
`CLAUDE_PLUGIN_OPTION_<KEY>`, `CLAUDECODE` and `CLAUDE_CODE_CHILD_SESSION` (`1`),
`CLAUDE_CODE_SESSION_ID` (the input's `session_id`, so it follows a `/clear`), `CLAUDE_PID`
(`options.processId` of the engine or host; unset when the host gives none) and `CLAUDE_ENV_FILE`.

`CLAUDE_ENV_FILE` is the `EnvFileStore` port (`path`, `read`, `clear`) of the `hooks/env-file` module:
`createEnvFiles(store, { launchScript })` hands the engine (`options.envFiles`) the file of each event
and gives the host the rest.

| Function                              | Does                                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------- |
| `envFileKindOf(event)`                | `session` for `SessionStart` and `Setup`, `cwd` for `CwdChanged` and `FileChanged`, none for any other event |
| `createEnvFiles(store, options)`      | `pathFor(event, shell)` (none for PowerShell hooks; exec form is not PowerShell), `beforeEvent` (a `CwdChanged` clears the `cwd` file, even when no hook handles it), `scripts` (what a Bash command runs first: the launch script, the session file, the `cwd` file) and `powershellVariables` |
| `readPowershellVariables(text, { windows })` | the assignments PowerShell commands receive: only when every line is blank, a `#` comment or a plain `export`/`declare -x`/`NAME=value`; otherwise none and the `Session environment is not all plain assignments` issue; on Windows a value with `/` or `\` is left out |

`powershellVariables({ windows, sandboxed })` reads the launch script and both files and returns none for
a sandboxed command. A host session passes `processId` and `envFiles` in `PluginHostOptions` and reads
`session.hookEnvironment` (`settings`: the `env` that applies and what was ignored; `files`).

`subprocessEnvironment({ kind, environment, settingsEnv, windows, sessionId, processId })` is the same
environment for any process Claude Code starts, `kind` being `hook`, `bash`, `powershell`, `mcp` or
`monitor` (`SUBPROCESS_KINDS`): the environment with the settings `env` over it, the scrub, the `OTEL_*`
removal, `CLAUDECODE` for every kind, `CLAUDE_CODE_CHILD_SESSION` for all but `mcp`,
`CLAUDE_CODE_SESSION_ID` for all but `monitor` and `CLAUDE_PID` for `hook`, `bash` and `powershell`.
`session.subprocessEnvironment(kind)` calls it with the session's settings `env`, session id, process id
and environment, so a host builds its own Bash, PowerShell, stdio MCP and Monitor environments without
copying the logic. It never holds `CLAUDE_ENV_FILE` or the plugin path variables, and the kit starts none
of those processes itself (what is left out is in `spec/judgments.md`). `scrubEnvironment(env, windows)`
and `scrubRequested(env)` are the scrub on its own.

A shell-form hook that PowerShell runs by the host's default (no `shell` field) and whose command is only
quoted strings starts nothing: the run is `not-started` with a message that begins `PowerShell started no
program` and lists the fixes, and the Windows-without-Git-Bash error of a blocked call carries both texts.
With `"shell": "powershell"` the command runs as written.

## Host and sessions (done: `host`)

`createPluginHost` composes what the modules below already do; it adds no behaviour of its own. The
host takes plugins loaded once with `loadPlugin`, the ports, the settings and the saved options, and
reads the Markdown components of the enabled plugins once per `Plugin` object. A session reads nothing from
disk; `host.update` replaces the plugins and settings, and open sessions follow (see "Updating").

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
host.plugins: readonly { id; name; enabled }[]   // every plugin given, with whether it runs; live
host.issues: readonly PluginIssue[]              // what the format readers found in enabled plugins; live
host.generation: number                          // how many times `update` ran
host.update(update: HostUpdate): { plugins; issues };  // see "Updating"
// HostUpdate: { plugins?: HostPlugin[]; settings?: PolicyView; parentSettings?: ParentSettingsContext;
//   userConfig?: Record<pluginId, OptionValues> }
host.openSession(options: SessionOptions): PluginSession;
// SessionOptions: { sessionId; cwd; permissionMode; transcriptPath; effort?: { level };
//   interactive? (true); trusted? (true); additionalDirectories?; addedDirectories?;
//   permissions?: ShellPermission; agents? (the parsed `--agents` value);
//   permissionRules?: PermissionRule[] (`Agent(name)` deny rules switch subagents off) }
// HostPorts adds `folders?: FolderScan` (docs/API.md, "Skills and commands of the folders")

//   interactive? (true); trusted? (true); additionalDirectories?; permissions?: ShellPermission;
//   promptId?; scratchpadDir?; agent?: { id?; type? }; folderTrustAccepted?;
//   limits?: SessionLimits }
session.withTurn(turn: TurnOptions): PluginSession;
// TurnOptions: Partial<Pick<SessionOptions, 'permissionMode' | 'effort' | 'cwd' |
//   'additionalDirectories' | 'permissions' | 'promptId' | 'scratchpadDir' | 'agent' |
//   'folderTrustAccepted' | 'interactive' | 'limits' | 'hookPorts'>>
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
| `SessionOptions.hookPorts` | Ports of the hook engine this session binds itself (`models`, `mcp`, `observer`, ...): each given port replaces the host's for this session's dispatches, so one host can serve many sessions. A port left out stays the host's; an `mcp` given here makes `mcp_tool` hooks available even when the host has none. |
| `expandSkill(name, { arguments?, signal, invoker? })` | The `Expansion` of `expandSkill`: text with `$ARGUMENTS`, `${CLAUDE_PLUGIN_ROOT}` and the plugin's options substituted, shell placeholders run through the runner. `invoker` is `user` (default) or `model`. An unknown name, a skill of a disabled plugin or a refused invoker is `{ ok: false, issues }`. `disableSkillShellExecution` of the settings replaces the placeholders. Without `SessionOptions.permissions` a shell placeholder asks, which aborts the expansion. |

| `expandSkill(name, { arguments?, signal, invoker?, permittedByMention? })` | The `Expansion` of `expandSkill`: text with `$ARGUMENTS`, `${CLAUDE_PLUGIN_ROOT}` and the plugin's options substituted, shell placeholders run through the runner. `invoker` is `user` (default) or `model`. An unknown name, a skill of a disabled plugin or a refused invoker is `{ ok: false, issues }`. `disableSkillShellExecution` of the settings replaces the placeholders. Without `SessionOptions.permissions` a shell placeholder asks, which aborts the expansion. `SessionOptions.limits` (`SessionLimits`: `models` allowlist, `maxEffort`, `supportedEfforts`) is passed as `ExpandRequest.limits`, so `Expansion.turn` carries the allowlisted model (`modelKept: 'excluded'` and no `model` when the skill's model is not allowed) and the capped effort, which `${CLAUDE_EFFORT}` in the text follows; `CLAUDE_CODE_EFFORT_LEVEL` is read from the `Environment` port. `permittedByMention: true` lets the model run a `disable-model-invocation` skill the user named in that message (never a `user-invocable: false` one for the user). |
| `expandMessage(message, { signal, invoker? })` | `{ mentions, expansions, permitted }` for one typed message (skills.md, "Stack several skills in one message"). `readSkillMentions` runs with the turn's `interactive` and a `stackable` made from the catalog (`stackableOf`: inline, user-invocable, after `skillOverrides`); each direct or stacked mention that names a skill of the catalog is expanded in order by `expandSkill` with the shared trailing arguments, as `{ mention, expansion }` (a direct skill the user may not run is a failed expansion). A forked skill, an unknown name or the sixth stacked skill ends the stack; a non-interactive turn expands only the first. A `named` mention is not expanded: `permitted` is the set of such names, and the host passes `permittedByMention: permitted.has(name)` when the model calls that skill in this message. |
| `dispatch(event, facts, { signal })` | The `HookOutcome<E>` of the engine. `facts` is the event's own fields (`EventFactsOf<E>`); the common fields come from the session. Handlers of every enabled plugin, then of the settings files, run with `if` read by the rules module and the policy of the settings: `disableAllHooks`, `allowManagedHooksOnly` (plugins force-enabled in managed `enabledPlugins` exempt), the `hooks` lock of `strictPluginOnlyCustomization`, `allowedHttpHookUrls`, `httpHookAllowedEnvVars`. A skill's `once` hook that ran is dropped after the dispatch. |
| `agents(options?)` | `Resolved<SessionAgent>`: every subagent of the session (docs/API.md, "Sub-agents: the catalog") as the official `AgentDefinition` under the name a call uses (`<plugin>:<name>` for a plugin agent), `extras` (`color`, `isolation`, `cacheTtl`) and its `source`. A plugin agent's prompt has the plugin variables substituted; any other prompt is as written. `builtin: false` leaves the built-ins out (their prompt is empty, so an SDK with its own built-ins gets only the rest). |
| `reloadAgents({ signal })`, `agentCatalog()` | Reads the managed, project, personal and added `.claude/agents/` folders through `HostPorts.folders` (the first call lists them at all) and returns `{ issues, watch }`; `agentCatalog()` is the `AgentCatalog` of the last read: built-ins, the `--agents` flag (`SessionOptions.agents`, already parsed), the folders and the enabled plugins, minus what `SessionOptions.permissionRules` deny with `Agent(name)` or `Agent` (`Task(...)` reads as `Agent(...)`). A host that rebuilds its run state per run passes `AgentOverrides` (`permissionRules`, `flag`, `interactive`) to `agentCatalog(overrides)` or `reloadAgents({ signal, overrides })`: they replace the session's values for that call only. `selectAgent({ flag, setting }, overrides?)` is `selectSessionAgent` over that catalog. |
| `mcpServers(options?)`, `lspServers(options?)`, `monitors(options?)` | `Resolved<ResolvedMcpServer>`, `Resolved<ResolvedLspServer>`, `Resolved<ResolvedMonitor>`: the substituted configs, with `${CLAUDE_PLUGIN_ROOT}`, `${CLAUDE_PLUGIN_DATA}` and `${user_config.*}` resolved. A server that cannot start is left out and its issue is in `issues`. |
| `outputStyles()` | The `OutputStyle` of each enabled plugin, `id` `<plugin>:<name>`. |
| `withTurn(turn)` | The same session for one turn: a `PluginSession` that shares the session's state and replaces only the fields `turn` names (see "Turns"). |
| `runScoped(turn, run)` | `withTurn` for one run: `run` gets the view of the turn, and the hooks added with `lifetime: 'turn'` through it are dropped when `run` settles (see "Scoped hooks"). |
| `addHooks(prefix, hooks, source, options?)`, `removeHooks(prefix)` | Hooks of a run, an agent or a skill added to and removed from the session; `addHooks` returns `{ remove() }` (see "Scoped hooks"). |
| `hasHooks(event)` | Whether a handler that passes this turn's gates would run for the event. |
| `hookEntries()` | The `RegisteredHandler`s that would run in this turn, in registry order (plugins, settings files, then what `addHooks` and skills added): `id`, `event`, `matcher`, the official `handler`, `source` (`kind`, `label`, `scope`, `pluginName`, `managed`) and `pluginId`. For a read-only `/hooks` view (hooks.md, "The `/hooks` menu"); a handler the gates silence, of a type its event does not support, or a consumed `once` one is not listed, and a handler written in several settings files is listed once. Also `runnableHandlers(entries, session)` over any registry. |
| `fileChangedWatchList()` | The literal names of the `FileChanged` matchers, then the dynamic `watchPaths` of the last SessionStart, CwdChanged or FileChanged output that returned the field. |
| `takeBackground()` | The background deliveries that settled since the last call, as `{ additionalContext[], systemMessages[], wake? }` (see "Background hooks"). |
| `onBackground(listener)` | Calls `listener` with each background delivery as it settles (a `wake` included) and returns the function that stops it; it takes nothing from the queue. |

`SessionOptions.promptId`, `scratchpadDir`, `agent` and `folderTrustAccepted` are the common fields
`prompt_id`, `scratchpad_dir`, `agent_id` and `agent_type` of every hook input, and the workspace trust
the frontmatter hooks of a project subagent need (hooks.md, "Common input fields", "Hooks in skills
and agents"). A field left out is left out of the input.

### Turns

A host that serves many turns opens the session once and calls `session.withTurn(turn)` for each
one: the mode, effort, folders, shell answer, model limits, prompt and agent of a turn are the turn's, and what
must outlive a turn is the session's. The view `withTurn` returns shares the hooks registered so far
(a skill's hooks keep running "on turns after the skill's own turn"), the `once` keys already
consumed and what skill hooks have used of their limits; it never reopens the session, so none of
that is lost. The hook input (`permission_mode`, `effort`, `cwd`), the base of an `if` path rule,
`${CLAUDE_EFFORT}`, the working directory of a shell placeholder and its `permissions` answer all
read the turn, as do `scratchpad_dir` and `interactive` (a `-p` turn makes a forked skill wait for
its result). An `if` path rule is anchored to the turn's `cwd`; additional directories do not widen it.

```ts
const session = host.openSession({ sessionId, cwd, permissionMode: 'default', transcriptPath });
const turn = session.withTurn({
  permissionMode: 'plan',
  cwd: '/work/app/src',
  permissions: (call) => rules.decide(call), // `ask` in the session, answered in this turn
  promptId,
});
await turn.expandSkill('formatter:status', { signal });
await turn.dispatch('PreToolUse', facts, { signal });
```

A turn replaces the fields it names and keeps the others; `agent` and `hookPorts` replace whole (a host
that serves one run per turn binds that run's model evaluators, MCP caller and observer with
`withTurn({ hookPorts })`; a port the turn leaves out is the host's). It may not change
`sessionId`, `transcriptPath` or `trusted`, which belong to the session (spec/judgments.md), and a
field given as `undefined` is ignored: a turn replaces a field but cannot unset it. The session
`withTurn` is called on does not change, and `withTurn` on a view builds on that view's fields. Views
of one session are one session for hooks: a skill expanded through one view fires through any other.

### Scoped hooks

An agent's frontmatter hooks or a host's own run need hooks that are neither a plugin's nor a skill's.
`addHooks(prefix, hooks, source, options?)` registers a `hooks` object (the shape of the `hooks` key
of settings) under `prefix`; the ids of its entries begin with it, and a prefix names one
registration: adding it again replaces what it registered ("replaces, never stacks", as a skill
invoked again does) and the handle of the replaced registration no longer removes anything.
`removeHooks(prefix)` removes by prefix; an unknown prefix does nothing. `source` is
`{ kind: 'agent' | 'session' | 'skill'; label; scope?; pluginName?; managed? }`: it decides the gates,
as in hooks.md, "Hooks in skills and agents" (a project agent's hooks wait for `folderTrustAccepted`,
a project skill's for workspace trust). `options.pluginId` names the plugin a skill or agent belongs to.

```ts
const handle = session.addHooks(
  `agent:${agent.id}`,
  { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: './guard.sh' }] }] },
  { kind: 'agent', label: '[agent]', scope: 'user' },
);
await session.dispatch('PreToolUse', facts, { signal }); // runs ./guard.sh
handle.remove();

await session.runScoped({ promptId, agent: { id: agent.id, type: agent.type } }, async (turn) => {
  turn.addHooks(`run:${promptId}`, hooks, { kind: 'session', label: '[run]' }, { lifetime: 'turn' });
  return runAgent(turn); // the hooks are gone when this settles, even when it throws
});
```

Lifetime: `session` (the default) lasts until removed, like a skill's hooks. `turn` ends with
`runScoped`: the one end signal is that callback settling, whether it returns or throws; there is no
separate `end()`. `lifetime: 'turn'` on a view that did not come from `runScoped` throws, since
nothing would end it; the views `withTurn` makes from a scoped view stay scoped. Registrations belong
to the session, not to a view: every view of the session fires them while they last, so concurrent
turns use distinct prefixes. `hasHooks(event)` is true when a registered handler of the event passes
the gates of the turn and has a type the event supports; the matcher and `if` are not read, since
they need the occurrence. `fileChangedWatchList()` lists the static names first, then the dynamic
paths, each once; the dynamic slot is the session's and each SessionStart, CwdChanged or FileChanged
output that returns `watchPaths` replaces it (`[]` clears it; an output without the field leaves it).

### Background hooks

`session.dispatch` is unchanged: an `async` or `asyncRewake` hook returns at once and its promise is
in `outcome.background`. A host takes the deliveries one of two ways:

```ts
// 1. wait for the promises of one dispatch
const outcome = await session.dispatch('PostToolUse', facts, { signal });
const late = await settleDeliveries(outcome.background); // { additionalContext, systemMessages, wake? }

// 2. ask the session at a turn boundary, whatever dispatch started the hook
const { additionalContext, systemMessages, wake } = session.takeBackground();
```

A background delivery includes the command's `exitCode` when it exited. A host uses
`consumedByRun(entry, delivery.exitCode === 0)` to consume a skill's `once` hook only after success.

`additionalContext` and `systemMessages` are for Claude on the next turn (hooks.md, "How async hooks
execute"). `wake` is the stderr (stdout when empty) of an `asyncRewake` hook that exited 2: the host
opens a turn with it, which is why it is apart from the context; several wakes join with a newline.
`takeBackground()` returns what settled since its last call, in the order it settled, and forgets
it; it never waits, and a hook that has not ended appears in a later call. A background process the
runner lost delivers nothing.

`session.onBackground(listener)` is the push side, for a host that is idle: it calls `listener` with
the `SettledDeliveries` of each hook that delivered something, as it settles (an `asyncRewake` exit 2
arrives with its `wake`), and returns the function that stops it. It takes nothing: `takeBackground()`
still returns the delivery, and a listener that throws hides nothing. Two things stay the host's: the
queue holds every delivery until `takeBackground()` drains it, and it hands over repeats, so the
check Claude Code makes for an async `SessionStart` hook (skip text equal to what Claude last
received, deliver again after a compaction or `/clear`) is made by the host.

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

### Updating

The host owns the disk: it reads plugin folders, caches the `Plugin` objects (by mtime, by version,
however it likes) and feeds the ones that changed to `host.update`. One call replaces the plugins and
the settings view, and every session already open stays consistent without being reopened.

```ts
const result = host.update({ plugins: [...kept, { id: 'review@acme', plugin: reloaded }] });
result.plugins; // the new `host.plugins`: every plugin given, with whether it runs
result.issues; // the new `host.issues`
host.generation; // one more than before: a caller that kept the number sees that an update happened
host.update({ settings: createPolicyView(layers) }); // settings only; the plugins stay
```

`update` takes `plugins`, `settings`, `parentSettings` and `userConfig`. Each part given replaces the
host's whole (`userConfig` replaces the saved values of every plugin); a part left out, or given as
`undefined`, stays, so to clear the settings give `createPolicyView([])`. The ports, `windows` and
`shells` are fixed for the life of the host. `createHostState` is pure: `update` merges the options
and builds the state again, and `host.plugins` and `host.issues` read the current one. The Markdown
of a plugin is read once per `Plugin` object (`readCatalog` caches by identity), so an update that
keeps a plugin does not read it again; a new object for the same id is read.

A session, and each `withTurn` and `runScoped` view of it, holds no state: it reads the host's at each
use, so the next call after an update sees the new one. What it does:

| Part of the session | After an update |
| --- | --- |
| Hooks of the plugins and of the settings files | Rebuilt from the new state, plugins first. |
| Hooks the session registered (a skill's, an agent's, `addHooks`) | Kept, unless their `pluginId` no longer runs or the new plugin-only lock (`strictPluginOnlyCustomization` on `hooks`) silences their source; they do not return when the plugin runs again or the lock is lifted. |
| `once` keys | A `once` hook that ran stays consumed: only skill hooks honor `once`, and an update never rebuilds them. |
| Skill-hook limits (1,024 hooks, 16,384 matcher characters) | Summed again from the skills whose plugin still runs; a plugin dropped and added back starts from zero. |
| Gates: `disableAllHooks`, `allowManagedHooksOnly`, the plugin-only lock, the HTTP policy, force-enabled plugins | Read from the current settings at each dispatch, so a policy switched on mid-session applies at the next one. |
| Skills, `skillOverrides`, `disableSkillShellExecution`, `allowManagedPermissionRulesOnly` | Read at each `skills()`, `expandSkill` and `expandMessage`. |
| Agents, MCP and LSP servers, monitors, output styles | Resolved at each call over the current plugins and `userConfig`. |
| The dynamic watch list, the background queue, the turn view's options | Kept. |

A session takes an update up at its next use, so two updates before that count as one: a plugin
removed and added back in between never left it. A host that needs each step uses the session between
the calls. What the host held for a run (the hooks of `addHooks` with `lifetime: 'turn'`) is the
run's: it ends with `runScoped` as before. A host no longer rebuilds the hooks of each run or hands
the latest run's hooks to its sessions: it calls `update` when the plugins or settings change.

Not in the host: reading plugin folders from disk and caching them (the host owns that and feeds new `Plugin` objects
through `update`), starting servers and monitors, the permission decision of a tool call (`decide` in the rules
module), and mods, which stay their own entry (`MODS_API`, `modsTesting`).

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
| `parseRule(text, { behavior, source })` | done | `Tool` / `Tool(specifier)` to a `PermissionRule`; a skipped rule is `rule: undefined` plus issues; `Task(...)` is read as `Agent(...)` (sub-agents.md: the renamed tool "still work[s] as alias"), `rule.text` as written |
| `bashFileTargets(command, paths)` | done | `{ reads, writes }`: the absolute POSIX paths a Bash line names for `Read` and `Edit` rules (permissions.md, "What `Read` and `Edit` rules cover"): redirection targets, `tee`, and the file commands `cat`, `head`, `tail`, `sed` (`-i` writes), `grep`, `cp`/`mv` (last operand written) and the like; a command that reads files without naming them gives none. `cd` is not followed (judgment). `decide` does not use it: a host matches the paths with `evaluateRules` |
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
| `structuredPatchOf(diff)` | done | the hunks of a unified diff as the `structuredPatch` of an `Edit` or `Write` result (`{ oldStart, oldLines, newStart, newLines, lines }`, SDK `FileEditOutput`); file headers are skipped, a no-newline marker stays with its line (judgment: the docs type the field and not how a host derives it) |
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
| `toolReadOnlyReport(call, checks)`, `inputChangedDenial(call)`, `withheldResultText(call)`, `promptDroppedText(reason)`, `unansweredCommandReply(plugin, command)` | done | `e.isReadOnly` of `tool.check` as `true` or `undefined` (never `false`: Read, Grep, Glob, WebSearch, WebFetch and Agent report it, Bash through the host's read-only command check, an MCP tool by its `readOnlyHint`); the auto-mode denial of a call whose input a hook changed after the review (`a hook changed this call's input after the model wrote it`, or `after auto mode reviewed it`); what Claude reads when a hook withholds the result of a call that ran (`Bash ran, and a plugin withheld its result: <reason>`); the line the user sees of a dropped prompt (`Prompt dropped by a hook: <reason>`); the reply for a command a mod registered that no `command.run` hook answered |
| `createModsApi(options, plugin)`      | done    | the `$` of one mod: every namespace of the reference, each call an event through the chain and then a port; `engine.create` fires once and may add or withhold a namespace; `dispose()` stops its timers and forgets its registrations |
| `settleModApi(built, answer, options)` | done    | the same engine-create settlement for a host-backed API: preserve built namespaces, apply changes, lend added methods through `{ plugin, scope, scopes, canWithhold }` |
| `runScopedModCall(scope, method, run)` | done    | the same API-call admission for host-backed methods: reject `prompt.submit` while the scope is lent to a waiting hook; otherwise preserve the method's synchronous or asynchronous result |
| `createRegistries()`, `createStateStore()`, `readEngineSettings(options)`, `withApiRules(rules)`, `isValidModName`, `atom`, `read`, `update` | done | what mods registered (commands, tools as `mcp__<plugin>__<name>`, subagent types), `$.state`, Claude Code's own `settings.read`, the shape rule for API calls, the 64-character name rule, the state helpers |
| `STATE_LIBRARY_SOURCE`, `contextUsage({ tokens, window })` | done | the JavaScript text of `atom`, `read` and `update` for a host that bundles them behind `import … from 'claude-code'` into an isolate that never loads the kit (a test runs it beside the kit's own helpers); the `{ window, tokens, percent }` of `$.session.usage()` and `session.measure`, with `tokens` and `percent` left out while the window is not measured (judgment: whole percent) |
| `createModsUi(options)`, `withUiRules(rules)`, `uiApi(deps, parts)` | done | the interface part: the `$.ui` of a mod (`ModsApiOptions.ui = ui.api`), `draw` a render site (fires `ui.render`, folds the answer), `loadMod` (fires `ui.resolve`), `fault(plugin, report)` and `message(plugin, data)` (each reaches only that mod's hooks), `change` (focus and scroll), the panes, the toast board and the redraw throttle; the chain takes `withUiRules(withApiRules(createEventRules()))` |
| `defaultElementTable(surface)`, `treeProblem`, `sizeProblem`, `foldRender`, `renderEvent`, `decideSite` | done | the 12 elements an app draws, why a tree is not valid for a site and app, which size limit refuses it, what a site shows once the chain settled (tree, Claude Code's own drawing, refused), and the `ui.render` event for a site |
| `routeControl`, `hotkeyTable`, `digitButton`, `actionButtons`, `collectControls` | done | a press, typing or a pick routed to a control by its key through `ui.press`, `ui.input`, `ui.select` before its callback; hotkeys (later duplicate wins, none in VS Code or a collapsed band), the band's digit hotkey, `action` bindings |
| `placePane`, `createPaneRegistry`, `parseOpen`, `createRedrawGate`, `createToastBoard` | done | where a pane appears (any width for the user, 144 or 110 columns for a mod), `ui.close` origins, the `ui.open` fields, redraws throttled and coalesced, toasts by renderer |
| `createModsHost(options)`             | done    | the mods runtime of one session: `load(plugins)` decides which hooks modules load and in which tier (policy), runs each through manifest, `hooks.json`, compile, scan, options, `plugin.register` and `runtime.load`, and returns every refusal as a line (`hooks module <id> not loaded: <reason>`, `<mod>: refused by <mod>: <reason>`); `session.start` fires for each loaded mod after `load` and `reload`; `reload()` for `/reload-plugins` (mods the host registered with `registerBuiltIn` stay); a mod is keyed by its name, so `load` of a plugin already loaded replaces it and never adds a second copy; `loadMod(plugin)` loads one plugin among the loaded ones (tier from policy, last in its tier, the built-in guard first when policy needs it) and `unloadMod(name)` turns one off (idempotent; `reload` does not bring it back; the guard stays); `hotReload` is a getter read on every line, so the answer to the hot-reloading question reaches `notices` at once; the report also carries `notices`, the lines a person reads, each with where it is read (`transcript`, `stderr` or `debug-log`); `reloadMod(name)` for a save in a `--plugin-dir` directory (a broken save keeps the version loaded before); `pluginDirs()`, `watchesPluginDirs(isInteractive)`; `fire`, `fireStream`, `registerBuiltIn`, `active()` |
| `ModCompiler`, `CompileResult`, `ESM_FORMAT`, `scanSourceOf(result, file)` | done | the host's compiler returns `{ scan?, run?, issues }`: `scan` is the ES module the static scan and `claude plugin validate` read, `run` is `{ code, format }` in the format the host chose (the kit never reads `format`; `ModRuntime.load` receives it beside `code`); a compiler whose run output is `esm` may return it alone, and a CommonJS `scan` is refused with a message that names the two outputs. A compiler or a runtime that throws is a `hooks module did not load` line, never a throw |
| `MatcherEngine`, `MatcherPattern`, `MATCHER_MS`; `createModChain({ matcherEngine, matcherMs })`, `ModsHostOptions.matcherEngine`, `.matcherMs` | done | where the regular expressions of hook matchers run: `compile(source, flags)` (synchronous, throws a `SyntaxError`) and `test(value, { ms, signal })` (may answer later). The kit gives each test 100 ms by default and stops waiting then, aborting the signal: a test the engine refuses or does not answer is no match, and the hook is skipped with `<mod>: <event> hook skipped: the matcher for "<field>" ran over its <ms> ms limit` or `... was refused by the engine: <message>`. Without an engine the pattern runs in the host thread, which a pattern such as `/^(a+)+$/` can hold for ever |
| `engineStackIssue(phase, file, message)`, `StackPhase` | done | the documented reasons a host's runtime returns when its engine runs out of stack: `the engine ran out of stack linking the file and its imports` (`link`) and `the engine ran out of stack loading the file (code nested too deep): <message>` (`load`, which the loader also uses for a runtime that throws a stack overflow) |
| `HookReport.kind`, `SkipKind`, `DispatchOptions.before` | done | a skipped hook's report carries `throw`, `timeout` or `wrong-shape`; `createModsHost` gives `report` the first line of each mod, event and kind until the mod reloads and the debug log every occurrence (the chain itself reports each one). `before(e)` runs ahead of the first mod's hook (a host's `fire` and `fireStream` take it in their options beside `core`): managed `PreToolUse` hooks go there, a result other than `undefined` answers the event with no hook run, and the other settings hooks are the `core` at the end |
| `decideModLoad`, `orderMods`, `hooksModulesOff`, `parsePluginDirs`, `sideloadRefusal`, `modOptions` | done | policy over plain settings data: `disableAllHooks`, `allowManagedHooksOnly`, `disableSideloadFlags`, `prependPlugins`, `appendPlugins`, `pluginConfigs`, `CLAUDE_CODE_PLUGIN_DIRS` and `_DIR_WATCH`, the built-in guard `sec-default@builtin` and its two options |
| `scanHooksModule(source, file, options)`, `validateMod(input, options)`, `activeModsLine(mods)` | done | the static scan (events handled, `$` calls, env and state use, the 2,000-scope limit) behind `plugin.register`'s `e.uses` and `claude plugin validate`; the `/plugin` line `1 mod active · first-mod` |
| `whereModsRun(where)`, `modsVersionProblem(app, version)`, `versionAtLeast`, `ModsPolicyInput.where`, `ModCandidate.reachesCloudSession` | done | overview.md's table of where mods run: for the terminal, the Desktop app, a WSL session, the VS Code chat panel (2.1.299, or 2.1.304 without feature-flag fetching), `claude -p`, Remote Control and a cloud session, whether hooks run and whether the drawing appears; `decideModLoad` refuses an installed plugin in a WSL session and, in the cloud, one that does not reach the session; the first versions that load mods (terminal 2.1.287, Desktop 2.1.286) |
| `modLineChannel(session, kind)`, `changeNotice(name, outcome)`, `writtenModRefusal(policy, session)`, `createHotReloadGate(state)` | done | where the one line about a mod that did not load is read (transcript, stderr of `claude -p --plugin-dir`, debug log; a refusal by another mod is the debug log of a `claude -p` run, and the transcript of an interactive session that loads a plugin directory or hot-reloads); the transcript line of a mod Claude wrote whose change did not load (`This mod's change didn't load, so the earlier version is still running: <reason>.` or `This mod didn't load, and the earlier version is no longer running: <reason>.`); why a mod Claude wrote cannot load (no one to approve, untrusted workspace, mods disabled); the question of enabling hot reloading, off for good after three questions that end unanswered |
| `readHooksJsonModules(raw)`, `isHooksModuleName`, `isModTestFile`, `resolveTypesPath` | done | `hooks/hooks.json` `modules`, the hooks module and `.test.ts` file names, the `types/index.d.ts` path |
| `ModRuntime.onCrash(listener)`, `WorkerCrash { reason, culprit? }`, `createWorkerHealth()`, `WORKER_STOP_LIMIT`, `unloadedLine`, `offLine`, `ModsHostOptions.onNotice` | done | the hooks worker's stops (troubleshoot.md): a runtime that shares one worker among mods calls its listeners when the worker stopped and was replaced, with the mod it traced the stop to, if any; the host awaits the listener, so the runtime holds its events until the mods have their fresh copy. A stop traced to a loaded mod unloads it and says `<mod> was unloaded: it crashed the hooks worker`, and every other mod that is not built in gets a fresh copy of its module (`restartMod`, the files are not read again) whose `session.start` fires; the third stop that cannot be traced unloads every mod that is not built in with `hooks: mods that run in the hooks worker are off for this session: it crashed 3 times`; `reload()` loads them again and starts the count over. The lines go to the debug log and to `onNotice` (the transcript in an interactive session; `modLineChannel` kinds `worker-crash`, `fresh-copy`) |
| `createReplayLedger(replayed)`, `ReplayLedger`, `replayedLine`, `REPLAYED_CALLS` | done | `$.prompt.submit`, `$.command.run` and `$.agent.spawn` made in the `session.start` of a fresh copy (after a crash) resolve with the result of the first copy's call at the same place and are not made again (they are not fired through the chain either); one line for each kind of call: `<mod>: its session.start ran again in a fresh copy; the $.<call> call it had already made was not made again`. A call is told from another by the mod, its kind and its ordinal among the calls of that kind in the `session.start` hook (spec/judgments.md) |
| `createRunGate(session, limits)`, `RunGate`, `RunLimits`, `REFUSAL_REASONS`, `QUEUE_DROPS`, `unsentReason`, `HELD_AT_TIMEOUT`, `ModsHostOptions.limits`, `ModsHost.input` (`interrupt`, `userInput`, `endInput`, `setLimits`) | done | what the session says about new work: the host tells it `interrupt()`, `userInput()` and `endInput()` and gives `--max-turns` / `--max-budget-usd` as `limits` (the turns and the spend come from `ModSession.turns` and `usage().cost`). While it refuses, `$.prompt.submit` resolves with `{ drop: <reason> }`, `$.command.run` rejects with an error that ends with the reason, `$.agent.spawn` resolves with `{ deny: <reason> }`, and a `$.tool.call` of Bash with `run_in_background: true`, Monitor or CronCreate resolves with `{ deny: '<tool> was not run: it starts background work, a schedule or a goal, and <reason>' }`. A prompt or a command still waiting in the host's queue when the user stops the turn is dropped (`the prompt was removed from the queue before it ran`, `the command was removed from the queue before it ran`) and the host's `queue` signal aborts. `$.session.send` is the host's to refuse: its port gets the reason as a fourth argument and words `{ isDelivered: false, reason }` with `unsentReason.subagent(id, reason)` for a subagent that finished or `unsentReason.teammate(name, reason)` for a teammate, and delivers to a running subagent. `ModTools.call` gets `held()`: a foreground Bash or PowerShell command that reaches its timeout while input is held is ended by the host with `isError` and `HELD_AT_TIMEOUT` in its output. `input.setLimits(limits)` replaces `--max-turns` and `--max-budget-usd` for the next call of a host that outlives a run. A `$.agent.register`, `$.command.register` or `$.tool.register` from a module that is unloaded rejects with `<mod>: $.agent.register refused: the hooks module that made the call is no longer loaded (it was reloaded or removed)` |
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

`settings.read` is answered like a call: a hook returns `next(e)`, `{ value }` or `{ deny }`, any other
result fails it. `settingsLayersForMods(layers, pluginSettings)` builds `e.layers` from the settings
stream's layers (`plugin` first, then `user`, `project`, `local`, `flag`, `policy`; a source with no
settings is left out); `readEngineSettings` fires Claude Code's own read and forwards the debug lines of
the chain (`<mod> (<tier>) answered settings.read without next()`). `ModsHost.runCommand(command, args,
{ core })` fires `command.run` for a command the user types: one a mod registered that no hook answers
gets `<mod> registered /<command> but no command.run hook answered it...`, any other ends in `core`. A call
a stopped session refuses (`$.prompt.submit`, `$.command.run`, `$.agent.spawn`, a background `$.tool.call`)
raises the toast `Stopped: type a message to continue; a mod cannot resume work after Stop`
(`STOPPED_TOAST`). The built-in guard says `<mod> tried to lift a deny rule in your settings` once for each
mod to the debug log and, in an interactive session, the transcript (`ModNotice` through `onNotice`).

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
`describeApi(api)` gives the shape of a mod's `$` as plain data, for a host that runs mods in another realm
and rebuilds `$` there: each namespace in the order of the reference, each member as `{ name, kind, async, event? }`
with `kind` one of `value`, `call`, `sync` (`$.ui.resolve`), `timer` (`$.clock.after`, `$.clock.every`) and
`stream` (`$.process.spawn`), and `event` the `ApiEventName` a call fires; it reads the live `$`, so a namespace
another mod added is described and one it withheld is not. A `value` member carries no value: the host copies it by reading the live `$` itself (a value can be lazy, so the description stays plain data), and a call reports no arity or argument shape. `ModsHost.resetState()` is what the host calls for
`/clear`, `/resume` and `/branch` (every `$.state` value back to its default; the host then fires
`classic.SessionStart`), and `ModsHost.input.notice(kind, deliver)` raises a notice for the conversation that a
stopped session holds or drops as api.md says. Changes to one plugin's `$.store` run one at a time.
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
| `readSettingsLayer(scope, raw, source?)` | done    | one source's JSON to a `PolicyLayer`: aliases, scope filter, repairs, and the value check of each general key (a wrong type is dropped with a warning, a malformed permission rule skipped, an `env` variable a repository cannot set dropped); issues, never a throw |
| `SettingsSources`, `loadSettingsLayers` | done    | the host's optional port for its sources (an object or JSON text per scope, and `label(scope)` naming each for a report) and the helper that reads them all; the result is `{ layers, issues, fatal }`: a managed document that does not parse is `fatal` (Claude Code exits with code 1) and no layer is returned |
| `createPolicyView(layers)`              | done    | `get`, `winner`, `eachFromHighest` over the layers, one merge rule per key               |
| `KEY_SPECS`, `admits`                   | done    | per key: its scope rule, merge kind and repair kind, from the key's entry in settings-reference.md |
| `mergeSettingsHooks(layers)`                    | done    | the `hooks` key: groups concatenated per event, the same handler under the same matcher in two files once |
| `enabledPlugin(view, id, default?)`, `forceEnabledByManaged(view, id)` | done | `enabledPlugins`: the highest file with an entry for the id decides (managed beats local beats project beats user); a managed `false` blocks and hides, a managed `true` cannot be turned off; no entry follows `defaultEnabled` |
| `pluginConfig(view, id)`                | done    | `pluginConfigs`: the options and per-server values of one plugin, from user or managed settings only, a built-in plugin read under either id; a value of another shape is dropped with a warning |
| `modOrder(view, context, orgMods)`      | done    | `prependPlugins` and `appendPlugins`: the ids that take effect in the listed order, the organization's mods no list names (`unlisted`), the skipped ones with the debug-log line, and where the built-in guard loads |
| `syncDecision(view)`                    | done    | `syncClaudeAiPlugins`: only `false` counts, from user, local, managed and `--settings`, also over a managed `true`; the move to the trash for user and managed |
| `trustWarning(view, standard?)`          | done    | the verbatim warning from plugins/security.md by default; `pluginTrustMessage` appends managed text. A host may supply its own standard warning, which stays whole |
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
| `createPermissionsPolicy(view, context)` | done | `permissions`, `allowManagedPermissionRulesOnly`, `autoMode`, `disableAutoMode`, `skipAutoPermissionPrompt`, `skipDangerousModePermissionPrompt` and `useAutoModeDuringPlan` as one `PermissionsPolicy`: `rules` (`SettingsRule`: `behavior`, `text`, `scope`; the lock, the parent settings and workspace trust applied), `additionalDirectories` (`SettingsDirectory`, with `repositoryOnly`), `managedRulesOnly`, the two block flags, the two locks, `skipDangerousModePermissionPrompt`, `autoMode` (`AutoModeSettings`) and `startingMode(input)` |
| `settingsLocations(input)` | done | where Claude Code reads `~/.claude/settings.json` (or `$CLAUDE_CONFIG_DIR`), the project file (the primary working directory's, no parent fallback), the local file (the repository root unless outside git, home as root, Windows or a root another user owns) and which folders hold output styles (the working directory and its parents, then the user's) |
| `PolicyContext` | done | the facts a host copies in: account, plan, managed-settings presence, `parentSettingsBehavior`, folder trust, environment values, the default channel allowlist, the official marketplace names, the organization's workflow toggle, safe mode, the `/config` workflow size and the ultracode state; each field names its docs page |
| `resolvePolicy({ layers, context, issues? })` | done | every area behind one `ResolvedPolicy`: `plugins`, `marketplaces` (`gate`, `registry`, `commandSources`), `hooks`, `skills`, `workflows`, `channels`, `customization`, the `view`, and `issues` (the reader's, then the registry's); parent settings are dropped where an administrator deploys managed settings without opting in, and the `hooks` lock comes from the customization policy |
| `createGeneralView(layers)` | done | the policy view plus `merged()`: every setting as Claude Code applies it. `get`, `winner` and `eachFromHighest` answer for the general keys too (`GENERAL_KEYS`: `model`, `fallbackModel`, `modelPicker`, `availableModels`, `permissions`, `env`, `sandbox`, `permissions.defaultMode`, the 12 managed-exception keys...); a key with no row is merged by the general rule (blocks key by key, lists combined without duplicates, the rest from the highest file) |
| `SPECS`, `ValueSpec`, `ManagedException` | done | one row per key with its scope rule, merge, and the `exception` of the keys whose managed value is not an override (settings.md, "Exceptions to managed settings precedence"): a ladder from least to most restrictive and the scopes whose stricter value stays |
| `permissionRuleLists(view, trusted, local)` | done | allow, ask, deny and `additionalDirectories` of every scope, each rule with its scope: a deny at any scope blocks, `allowManagedPermissionRulesOnly` leaves managed rules (a host's parent settings keep deny and ask, never a `Read(!...)` or `Edit(!...)` carve-out), the shared project file's allow rules and directories wait for `trusted(scope)`, and the local file's only when `local` says it is tracked in git or under a symlinked `.claude` |
| `permissionRulesOf(view, { trusted, local, flagSettings })` | done | the same lists parsed with `parseRule`: `{ rules, directories, issues }`, each rule tagged with the `RuleSource` of its file (the scope-to-source table is the kit's, `src/host/permission-rules.ts`), deny first; a host rebuilds its permissions for a run by calling it again |
| `effortLevelFor(layers, { model, userLevelApplies })` | done | `modelSettings` and `effortLevel`: one model at a time, the highest file that saves a level (low, medium, high, xhigh; never `max`) for the model or has a top-level one that applies |
| `effectiveCap(layers, model)`, `capEffort(level, cap)`, `EFFORT_LEVELS` | done | `maxEffortLevel`: the lowest cap of the files for a model, a model entry replacing its own file's cap and `max` exempting the model from that file's cap only; `capEffort` runs a level at the cap when it is higher (the host takes the lower of this and an organization's limit); `EFFORT_LEVELS` is the ladder, lowest first |
| `resolveSessionValue(key, input)`, `SESSION_OVERRIDES` | done | the flag, the paired variable and the settings value of `model`, `effortLevel`, `modelSettings`, `permissions.defaultMode` and `autoConnectIde`, highest first (`--model` over `ANTHROPIC_MODEL` over the key over `ANTHROPIC_DEFAULT_MODEL`, the flag and the key gated by `availableModels`; `CLAUDE_CODE_EFFORT_LEVEL` over `--effort` over the key; `--permission-mode` over the key) |
| `managedChangeAdvice(facts)` | done | a managed change that has not reached a person: restart first, then a `/status` that names another source means a higher-priority source applies |
| `editEffect(edit)`, `loadsFileCreatedMidSession(scope, folderExisted)` | done | when an edit reaches a running session: `now` for a watched file (with the `ConfigChange` hook), `on-schedule` for MDM and server-managed, `next-session` for the keys read once, `after-restart` for lifting a read block; a file created mid-session loads if its folder existed (always for the project file) |
| `reachOf(scope, facts)`, `FILE_ORIGINS`, `WRITE_TARGET` | done | whose sessions a file reaches (your machine, a teammate's clone, a cloud session), who makes each file, and which file each Claude Code write goes to |
| `userSettingsFile`, `projectSettingsFile`, `localSettingsFiles`, `localSettingsRoot`, `configDirOf` | done | the file paths through the host's `joinPath`: `CLAUDE_CONFIG_DIR`, the local file at the repository root (main checkout in a worktree; beside the project file outside a repository, at home, on Windows, or when not owned by you) and the earlier file read after it |
| `globalGitExcludesFile`, `LOCAL_FILE_IGNORE_ENTRY`, `shouldAddGitExclude` | done | where and when Claude Code adds `**/.claude/settings.local.json` to the global git excludes |
| `readClaudeJson(facts)` | done | `~/.claude.json`: usable, starts with defaults (blank, no backup), or a configuration error with the errors.md output, the copy to make and whether a `-p` run exits or an interactive session asks |
| `problemKind(scope, issue)` | done | `Settings Error`, `Settings Warning` or `Managed settings`: how the start-up dialog names a problem |
| `composeManaged(documents, { parentRestrictive? })`, `readAdminDocument(source, read, label?)`, `MANAGED_SOURCES`, `SOURCE_TRAITS` | done | the managed tier from the documents a host read at remote settings, the MDM policy, the managed files and HKCU (`ManagedReads`, or one `SourceRead` each): `layer`, `behavior` (`managedSourcesBehavior`), `used` and `skipped` with the `/status` lines, `parentMerge`, `helper` plan, `fatal` (a present admin document that is no JSON object, or unreadable for a cause other than a denial) and `issues`; the cross-source keys, locks, allowlists and login keys follow managed-settings.md. A source that exists and cannot be read is `{ unreadable: 'denied' \| 'failed', reason }` (`UnreadableRead`); `label` names the source in the `Detail:` line of the exit (the path, `per-user managed preferences`, `Registry: HKLM\...`) |
| `readFileDocument({ base, dropIns?, label? })`, `dropInOrder`, `isDropInName` | done | `managed-settings.json` first, then every `*.json` of `managed-settings.d/` in alphabetical order, merged as the page says (single values replaced, lists combined, nested blocks key by key, `fallbackModel`, `modelPicker`, marketplaces and managed MCP servers replaced whole); `label` is `{ base?, directory?, dropIn?(name) }`, and an unlistable `managed-settings.d/` is `{ unreadable, reason }`, a warning when denied and an error otherwise |
| `wslChain(documents)` | done | the documents a WSL session composes under `wslInheritsWindowsSettings` (HKLM and the Windows file above `/etc/claude-code`, HKCU only when it also sets the key) |
| `parentSettingsOf(composition, parent)` | done | the host's parent settings dropped when an admin source is present and `parentSettingsBehavior` is not `"merge"`, else cut down by the managed values that block them |
| `readPolicyHelper(value)`, `helperPathFault(path, flavor)`, `readHelperOutput(stdout, stderr)`, `runPolicyHelper(input)`, `withHelperSettings(composition, emitted)` | done | `policyHelper`: the key's rules, the envelope (1 MiB cap, `managedSettings`), one run over `HelperHost` (`CommandRunner`, `HelperFileProbe`, `Clock`) with its failures and their cost at startup, after a fetch removed server-managed settings, and on refresh |
| `managedFilePaths(platform)`, `MECHANISM_TRAITS`, `registryPath`, `PLIST_DOMAIN`, `symlinkVerdict`, `cacheAfterFetch`, `editOfManagedSource`, `rereadDue` | done | the delivery mechanisms as data: paths per OS, the plist domain and registry value, when each is read again, a symlinked file, the server-managed cache and what a developer's edit does |
| `sourcesLoadedBy(surface, settingSources?)`, `reachOfPlace(place, facts)`, `reachesRunningSession(mechanism, key?)`, `serverChangeTiming(change)`, `startupFetchOf(facts)`, `minimumVersionEffect(facts)`, `fetchesRemoteSettings(facts)`, `helperRunsNow(plan, fetch)` | done | where and when a policy applies: surfaces, cloud, Claude Tag and Cowork sessions, running sessions, changes that need approval, the startup fetch |
| `SettingsSources.managed(signal)`, `composeManagedReads(reads, options)` | done | a host that says what every managed source holds gets the managed tier composed by `loadSettingsLayers`; `resolvePolicy({ managed })` reads `hasManagedSettings` and `parentMerge` from the composition |
| `readSettingsLayer(scope, raw)` for a managed source, `PolicyLayer.invalid`, `gatewaySignInRefused(layer)` | done | the managed-only and fail-closed keys (managed-settings.md): the 16 keys beyond the plugin areas have rows (`allowAllClaudeAiMcps`, `allowManagedMcpServersOnly`, `allowedMcpServers`, `allowedProviders`, `availableModelsMatch`, `deniedMcpServers`, `deniedModels`, `disableSideloadFlags`, `forceLoginOrgUUID`, `forceRemoteSettingsRefresh`, `gatewayInternalNetworks`, `managedMcpServers`, `managedSourcesBehavior`, `parentSettingsBehavior`, `policyHelper`, `wslInheritsWindowsSettings`); a managed-only key in a user, project, local or `--settings` file is dropped with a warning; in the policy tier an unreadable value reads as the table's fallback (an empty allowlist, `exact`, `refuse`, `true`) with `"<key>" was present but invalid; it is treated as ...`; a fallback no value expresses (`gatewayInternalNetworks`, an unrecognized `crossSessionInbound` in a file) is recorded in `PolicyLayer.invalid`, and `gatewaySignInRefused` says `/login` refuses every new gateway sign-in; the `sandbox`, `permissions` and `autoMode` blocks are repaired per field, `sandbox.credentials` entry by entry |
| `sideloadVerdict(view, facts)`, `midSessionMcpUpdates(view, { cloud }, servers)`, `addPluginsRefusal(view)`, `SIDELOAD_FLAGS` | done | `disableSideloadFlags`: the errors startup exits with for `--plugin-dir`, `--plugin-url`, `--agents`, `--mcp-config` (not when all its servers are `type: "sdk"`) and `CLAUDE_CODE_PLUGIN_DIRS`, the servers a cloud session starts without, and the `addPlugins` refusal |

The policy helper is not run by `loadSettingsLayers`: the host wires it, in this order. Compose the
sources with `composeManagedReads(reads, { parentRestrictive })` and read `composition.helper` (the
plan: the helper the highest source carrying a policy key names, `runsAtLaunch`,
`shadowedByRemote`). If `helperRunsNow(plan, { remoteStillDelivers })`, run it with
`runPolicyHelper` over the host's `HelperHost`; on `ok` with `settings`, replace the managed layer
with `withHelperSettings(composition, settings).layer`. A failed run follows `PHASE_OUTCOMES` for its
phase (`startup`, `fetchRemoved`, `refresh`). A host that re-reads settings on every run repeats
the whole sequence, since `SettingsSources.managed` is read per call and the helper's output is not
cached by the kit.

### MCP settings (done: `settings/mcp`)

Pure functions over data the host already read: `~/.claude.json` and `.mcp.json` parsed, the settings
layers, and facts about the folder. The kit runs no git, reads no file and connects to nothing.
Expand `${VAR}` references first (`expandMcpServer`), so the endpoint identity compares the servers
as they will run.

```ts
import { claudeJsonServers, projectFileServers, projectServerApproval, rankMcpServers,
  readProjectToggles, applyToggles } from '@rsaryev/claude-plugin-kit';

const user = claudeJsonServers(claudeJson, '/work/app');          // user + local scope
const file = projectFileServers(mcpJson);                          // project scope
const approval = projectServerApproval(file.candidates.map((c) => c.name), layers, { folderTrusted });
const approved = new Set(approval.filter((a) => a.status === 'approved').map((a) => a.name));
const toggles = readProjectToggles(claudeJson, '/work/app');
const { loaded, hidden } = rankMcpServers(applyToggles(
  [...user.candidates, ...file.candidates.filter((c) => approved.has(c.name))], toggles));
```

| API | What it does |
| --- | --- |
| `MCP_SCOPES`, `rankMcpServers(candidates, { desktopCodeTab? })` | managed, local, project, user, plugin, connector. One server per identity: local, project, user and managed match by name, plugins and connectors by endpoint (`mcpEndpointKey`) against an enabled server above; the winner's entry is used whole, never merged. Returns `{ loaded, hidden }`; `hidden` pairs each displaced candidate with the one it duplicates. A candidate with `enabled: false` stays in `loaded` (hosts skip it) and holds no endpoint |
| `claudeJsonServers(state, projectPath)`, `claudeJsonProject`, `projectFileServers(mcpJson)` | candidates of user scope (top-level `mcpServers`), local scope (`projects[path].mcpServers`) and project scope (`.mcp.json`); an entry Claude Code drops is an issue and the rest load |
| `managedServerEntries(layers, { desktopManaged? })` | `managedMcpServers` of the managed layers only (several sources: names union, the higher source's entry whole); the key in user, project, local, `--settings`, parent or `--add-dir` settings is dropped with a warning, and so is every managed one in a Claude Desktop session that supplies its own servers (`desktopManaged`: `'third-party'` Code tab, `'cowork'`). What an entry may contain is not read here |
| `readProjectToggles(state, projectPath)`, `serverEnabled(toggles, subject, name)`, `applyToggles(candidates, toggles)`, `connectorDisplayName(name)` | `disabledMcpServers` (opt-out: configured, plugin, managed, connector under its `claude.ai <name>` display name, default-on built-ins) and `enabledMcpServers` (opt-in: default-off built-ins such as `computer-use`); exactly one list is consulted per kind, an entry in the other is ignored |
| `projectServerApproval(servers, layers, trust, session?)`, `McpTrust`, `PROJECT_SERVER_STATUSES` | per `.mcp.json` server `approved`, `pending approval` or `rejected` (with `via`): approved by `enableAllProjectMcpServers` or `enabledMcpjsonServers`; in an untrusted folder the shared project file and a tracked or untrusted `settings.local.json` are ignored while user, managed and `--settings` count (an untracked local file also counts in the configuration home); a `disabledMcpjsonServers` entry in any file rejects and wins. A session that cannot prompt (`{ prompts: false }`) loads pending servers without asking, rejected ones still blocked |
| `canPromptForProjectServers({ interactive, bypassPermissions }, layers)` | interactive sessions prompt, except `bypassPermissions` with `skipDangerousModePermissionPrompt` in user or managed settings |
| `createMcpSettingsPolicy(view, context)` | `projectServerApproval(servers, trust?, session?)` over the view's layers, folder trust from `context.isFolderTrusted('project')`; `serverPolicy(live?)` is `createMcpServerPolicy` over the view with `context.env`; `resolvePolicy(...).mcp` |
| `createMcpServerPolicy(view, { startup, live })`, `MCP_SERVER_ORIGINS` | `policy.check({ name, server, origin? })` for `allowedMcpServers`, `deniedMcpServers` and `allowManagedMcpServersOnly`: the denylist of every file blocks first and always; the allowlist of every file (only the highest managed one under the lock; a `true` in any managed layer locks) admits a remote server by a `serverUrl` entry, a stdio server by a `serverCommand` entry, and by `serverName` only when the list has no entry of that kind; unset allows all, `[]` allows none. `origin` says where the server comes from: `configured` (default: user, plugin, claude.ai, `--mcp-config`), `managedSettings`, `managedFile` (checked only when `${VAR}` appears in its command, arguments, URL or headers), `builtIn`, `claudeTagSlack` skip the allowlist but not the denylist; `inProcess` skips both. Entries expand `${VAR}` in a pinned environment (`startup` plus managed `env`; the denylist also fills unset variables from user and other non-repository settings), the server's own value in `live`; an allowlist URL entry with a variable in its scheme, host or path is ignored. Returns `{ allowed: true }` or `{ allowed: false, blockedBy, status, addError, reconnectError }` with the docs' messages. The lists are read once, when the policy is created: a host rebuilds the policy (`serverPolicy()` does) when settings change before a user reconnects a server |
| `MANAGED_MCP_PLATFORMS`, `managedMcpFilePath(platform)`, `readManagedMcpFile(text)`, `loadManagedMcpFile(reader, platform, signal?)` | where `managed-mcp.json` lives (`macos`, `linux` and `wsl` `/etc/claude-code/managed-mcp.json`, `windows`), and its text read like a project `.mcp.json`: `{ file, issues }`. `file` is undefined when there is none or it "can't be read or parsed" (an error issue); only a readable file takes exclusive control. The host reads the text through a `TextFileReader`; the kit touches no disk |
| `readManagedMcpServers(layers, { desktopManaged? })`, `describeManagedServer(server)`, `managedServerRemoval(name)`, `MANAGED_MCP_GROUP` | `managedMcpServers` as managed-scope candidates, remote only (v2.1.259): an entry is kept only when `type` is `http`/`sse`, `url` is `https://`, it has no `command`, `args`, `env` or `headersHelper`, no value holds a `${VAR}` reference, the name is letters, numbers, hyphens and underscores, and no key or value has control or invisible formatting characters; a failing entry is dropped with a notice (warning) and the others load; the array form of Claude Desktop is a notice too. `describeManagedServer` is what `claude mcp get` and `/mcp` show (URL host only, header names without values, group **Managed MCPs**); `managedServerRemoval` is what `claude mcp remove` reports |
| `providedServersTiming({ delivery, interactive, cached, confirmationFailed })`, `reconcileManagedServers(previous, next, { interactive })` | when the provided servers connect (server-managed: wait for the server's confirmation with a cached copy, a withheld status when it fails, connect on arrival on an interactive first launch, a `-p` run may finish without; gateway and device: at start) and what a running interactive session does when the key changes: `{ add, change, remove }` by list diff, so a host needs no events; a `-p` run applies none |
| `mcpLoadPlan(input)`, `readMcpLoadSettings(view, facts)`, `resolvePolicy(...).mcp.loadPlan(facts)`, `.loadSettings()`, `.providedServers()` | which servers load. With a readable `managed-mcp.json` only its servers and the provided ones load (an empty map blocks every other; plugin servers and `~/.claude.json`, `.mcp.json` servers stay out; connectors Claude Code fetches stay out unless `allowAllClaudeAiMcps`, never in a cloud session); `addError` is the enterprise-policy error of `claude mcp add`; `exit` is the startup exit: `--mcp-config` on a workstation, `--strict-mcp-config` anywhere, `claude --chrome` unless `allowClaudeInChromeWithManagedMcp` (device sources only, passed as `deviceManaged` layers to `resolvePolicy`); in a cloud session `skipped` and `warnings` name the delivered servers left out. Without the file the scopes rank as usual and `strictPluginOnlyCustomization` with `mcp` closes the user files but not the provided servers, `disableClaudeAiConnectors` (or `ENABLE_CLAUDEAI_MCP_SERVERS=false`) drops the fetched connectors, a `--mcp-config` server replaces a provided one of its name and meets the allowlist, `--strict-mcp-config` leaves only the flag servers. `deniedMcpServers` and `allowedMcpServers` filter the result (`blocked`); `toggles` marks a server the user turned off in `/mcp`. In-process servers of the app that started the session are the host's and never pass through the plan |

A `serverUrl` pattern (`url-pattern.ts`): `*` wildcards in scheme, host, port and path; scheme and host
case-insensitive, a trailing host dot ignored, paths case-sensitive; no port means the default port
(443 `https`, 80 `http`) for a host written out in full and every port for a host with a `*` in it;
`:*` is every port; no path matches any path. A bad entry is stripped with a warning and the valid
subset enforced; an unreadable managed `allowedMcpServers` is an empty allowlist, an unreadable
`denied` value is dropped.

| `resolvePolicy({ layers, context, issues? })` | done | every area behind one `ResolvedPolicy`: `plugins`, `marketplaces` (`gate`, `registry`, `commandSources`), `hooks`, `skills`, `workflows`, `channels`, `permissions`, `customization`, the `view`, and `issues` (the reader's, then the registry's); parent settings are dropped where an administrator deploys managed settings without opting in, and the `hooks` lock comes from the customization policy |

Scopes, highest first: `managed`, `parent` (the SDK `managedSettings`), `flag` (`--settings`),
`local`, `project`, `addDir`, `user`. A key a scope may not carry is dropped with a warning (its
**Scope** line); a `--add-dir` directory's settings carry `enabledPlugins` and
`extraKnownMarketplaces` only. In the policy tier (`managed`, `parent`) an unreadable allowlist is
an empty one, an unreadable lock reads as `true`, and `strictPluginOnlyCustomization` as `true`;
elsewhere the value or entry is dropped. The aliases `allowedMarketplaces` and
`additionalMarketplaces` are rewritten to their canonical keys, so a resolver sees only those.

### Permission settings (done: `settings/permissions`, `settings/locations`, `host/permission-session`)

```ts
import { resolvePolicy, startPermissions } from '@rsaryev/claude-plugin-kit';
import { decide } from '@rsaryev/claude-plugin-kit';

const { permissions } = resolvePolicy({ layers, context });
permissions.rules; // [{ behavior: 'deny', text: 'Read(./.env)', scope: 'managed' }, ...]
const started = startPermissions({
  policy: permissions,
  start: { surface: 'terminal', autoAvailable: true, permissionMode: undefined },
  paths, // the PathContext of the session
  commandLine: { allowed: ['Bash(npm test)'] }, // --allowedTools; --disallowedTools is `disallowed`
});
if (started.outcome === 'started') decide(call, started.context); // started.mode, started.issues
```

`permissions` is read per field in every file. In the policy tier (`managed`, `parent`) a lock reads as
its restrictive value, an invalid `defaultMode` as `default`, an unreadable `permissions` object turns the
write block on, and while a `deny` or `ask` list cannot be read `allow` and `additionalDirectories` are
withheld (the report names each grant); the same holds for the `soft_deny` and `hard_deny` lists of
`autoMode`. Lists unite across files; a `true` of `blockReadsOutsideWorkingDirectories`,
`blockWritesOutsideWorkingDirectories` or `autoMode.classifyAllShell` and a `"disable"` lock hold from any
file; a `false` of `useAutoModeDuringPlan` from managed settings, `--settings`, user or local settings turns
it off; a `true` of a `skip*Prompt` key from any file that carries it applies.

`allowManagedPermissionRulesOnly` drops the `allow`, `ask` and `deny` rules of user, project, local and
`--settings` files and the command line's `--allowedTools` (`--disallowedTools` stays); the parent
settings lose their `allow` rules and directories, and a `Read` or `Edit` rule of a host that starts with
`!` is never kept. A project file's `allow` rules and `additionalDirectories` wait for workspace trust
(`PolicyContext.isFolderTrusted`), the local file's only when git tracks it
(`PolicyContext.localSettingsTracked`); `deny` and `ask` rules never wait.

`startingMode(input)` answers "Which mode a session starts in": the flag (`permissionMode`,
`dangerouslySkipPermissions`), then `permissions.defaultMode` (an `auto` or `bypassPermissions` from a
project or local file is no value; the VS Code surface reads user, managed and `--settings` files only), then
the built-in default (`auto` in a terminal, `default` under `-p`, the SDK, the HIPAA configuration or
`disableAutoMode`). `auto` becomes `default` when `autoAvailable` is false or `disableAutoMode` is set;
`disableBypassPermissionsMode` refuses the flag; `--restricted` and root outside a sandbox refuse
`bypassPermissions`; a background session honors a bypass request only with `skipDangerousModePermissionPrompt`
in user or managed settings (a `local` or `--settings` acceptance ignores the request with the documented
notice, none refuses it). The result carries `bypassAvailable`, `autoAvailable` and `bypassWarning`.
`startPermissions` turns the policy and the start into the `DecideContext` `decide` takes: the parsed rules
with their sources, the mode, the facts the settings decide, `cannotPrompt` for a `-p` or SDK run with no
callback (an `ask` is then denied with the reason `prompt-unavailable`) and `repositoryDirectories`
(directories only repository settings add, which the read and write blocks do not count).

`decide` also takes `connectorToolsSetToAsk` (never approved by a mode, rule, hook or mod; reason
`organization-ask`) and `preapprovedFetchDomain` (WebFetch's built-in set of documentation domains, which
the host knows), and `approvalMemory(tool, { rulesLocked })` says what "Yes, and don't ask again" remembers per tool type.
The cross-session messaging safeguards of the bypass section are not modelled: the kit sends no message.
The read of another organization's public `Artifact`, which `bypassPermissions` does not approve ("Claude can't
read one"), is not modelled either: the artifact's organization is not in the call, so `decide` allows it in that mode.

`startPermissions` also takes `interactive` (default: a `terminal` surface) for a host with its own approval
interface, which is not a terminal and must not claim to be one; it fills `classifyAllShell` (in auto mode every
Bash and PowerShell allow rule is suspended, `Bash(npm test)` included, and a `false` leaves the narrow rules in
force) and returns `notices`, the text a session shows at its start (the HIPAA terminal notice, verbatim; the
first-time `auto` notice is the host's). `savedApproval(tool, policy, locations)` says what "Yes, and don't ask
again" does for a tool and, for an approval that lasts, the file it saves the rule to (`settingsLocations().local`);
under `allowManagedPermissionRulesOnly` nothing is offered or saved.

### The `env` block (done: `settings/env`)

```ts
import { applySettingsEnv, resolveSettingsEnv } from '@rsaryev/claude-plugin-kit';

const { values, ignored, issues } = resolveSettingsEnv(view.layers, {
  isFolderTrusted: (scope) => trust[scope], // the project and local files wait for trust
  environment: process.env, // the launch environment (an off value never replaces it)
  windows: false,
});
const environment = applySettingsEnv(process.env, values, false); // a settings value replaces the shell's
```

Files combine per variable, the highest precedence winning; a value is copied as written (an empty string is
a value; nothing is ever removed). Project and local files cannot set what a checked-out repository must not
control (`CLAUDE_CONFIG_DIR`, the operating-system directories, the Windows program variables, the
OpenTelemetry exporter variables except their off values, how Claude Code starts and signs in), and no file
sets the identity variables the hosting environments own. `ignored` names the variable, the scope and the
reason (`repository`, `host-owned`, `untrusted`, `launch`, `not-text`), never a value.

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
| `resolveSubagentModel(input)`              | done   | the "subagent model order": the invocation alias, the definition (`inherit` selects the main model), `CLAUDE_CODE_SUBAGENT_MODEL` (`inherit` is unset), the built-in rule (`builtin: { name: 'Explore', connection }`: on a Fable main model Explore runs on the `opus` alias over a `subscription`, `console` or `llm-gateway` connection and stays on the main model on `bedrock`, `vertex`, `foundry`, `claude-platform-on-aws` or `claude-apps-gateway`), the main model; a family alias of the main model's family becomes the main model's exact model (`[1m]` included), only `opus` when the family cannot be told (unless `ANTHROPIC_DEFAULT_OPUS_MODEL`); `force` skips the invocation and the definition. `from` says where it came from |
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

## Sub-agents: the catalog (done: `agents/catalog`, `format/agent-flag`)

Where a subagent comes from and which definition a name means (sub-agents.md, "Choose the subagent
scope", "Built-in subagents", "Invoke subagents explicitly"). All pure over the folders a host lets the
kit read and over facts it passes; the session wires them (`reloadAgents`, `agentCatalog`).

```ts
import { scanAgents, resolveAgents, builtinAgents, readFlagAgents, resolveSubagentType,
  catalogAgentOf, agentMentions, selectSessionAgent, spawnableAgents } from '@rsaryev/claude-plugin-kit';

const scanned = await scanAgents({ folders, request: { home, cwd, addedDirectories } });
const catalog = resolveAgents({
  builtin: builtinAgents({ interactive: true, disableExplorePlan: false, disableAll: false }),
  flag: readFlagAgents(JSON.parse(agentsFlag)).agents.map(catalogAgentOf),
  scanned: scanned.entries,
  plugin: pluginRecords.map(catalogAgentOf),
  denied: permissionRules, // `Agent(Explore)` deny rules disable that subagent, `Agent` all of them
});
const run = resolveSubagentType(catalog, call.subagent_type); // { ok, agent } or { ok: false, message }
```

| Function | What it does |
| --- | --- |
| `readFlagAgents(value)` | The parsed `--agents` JSON: each key an agent name, `prompt` the system prompt, the frontmatter fields read as a file reads them, `color` and `experimental` ignored, a name starting with `-` refused with `<name>: agent names must not start with '-'` (reported only when no definition has a schema problem, as errors.md orders the checks; more than 20 error lines end in `…and N more`). |
| `builtinAgents(policy)` | Explore and Plan (Write and Edit denied, no CLAUDE.md or git status at start), general-purpose, claude, statusline-setup (Sonnet) and claude-code-guide (Haiku); `CLAUDE_CODE_DISABLE_EXPLORE_PLAN_AGENTS` drops the first two, `CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS` all of them in non-interactive mode. |
| `scanAgents(context)` | `{ entries, issues, watch }`: `.claude/agents/**.md` of the managed directory, the project and its parents (nearest first; a linked worktree may borrow the main checkout), each added directory and `~`, through `FolderScan`. A file with no name is documentation (skipped, silent); a name starting with `-`, containing `:` or over 256 characters, a name with no description, and YAML that does not parse skip the file with an error. `watch` lists the personal and project folders that exist (not the managed ones, not `--add-dir`'s), none for `watch: false` (`--disable-slash-commands`). `allows` applies `strictPluginOnlyCustomization`. |
| `resolveAgents(sources)` | The `AgentCatalog`: one definition per name by the priority table (managed 1, `--agents` 2, project 3, user 4, plugin 5, built-in after them); among nested project folders the nearest wins; `shadowed` says who lost, `disabled` what a deny rule switched off, `delegation` is false when the `Agent` tool is denied. |
| `resolveSubagentType(catalog, type)` | The agent an Agent call runs. Without `subagent_type` it is `general-purpose`, else `subagent_type is required: the general-purpose agent is not available in this session. Available agents: ...`. |
| `spawnableAgents(catalog, spawnTypes)` | The catalog an agent sees through its Agent tool: the `Agent(worker, researcher)` allowlist (`spawnTypes` is what `resolveSubagentTools` returns). |
| `spawnDepthLimit(env)`, `nestingAt({ layer, limit, fork })` | Three layers by default (`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`); at the limit `Agent` is withheld from a subagent, and a fork keeps it but cannot spawn. |
| `namedSubagent(facts)` | What a `name` on the Agent call does with agent teams on: addressable, and a teammate in an interactive session when the main conversation makes a non-fork call without `isolation`. |
| `agentMentions(message, catalog)`, `agentTypeahead(catalog)` | `@"code-reviewer (agent)"` and `@agent-<name>` (scoped for plugin agents) select a subagent; the message goes to Claude unchanged; a name in prose selects nothing. |
| `selectSessionAgent(catalog, { flag, setting })`, `resumeSessionAgent(catalog, name, searched)`, `sessionAgentLabel(agent)` | `--agent` over the `agent` setting; a plugin agent by its bare name when one plugin has it, else the scoped name; the resume warning of errors.md when the agent is gone (never for `claude`); the `@<name>` header. |

`Agent(name)` deny rules are read by the permission rules module; the catalog only consumes
`PermissionRule[]`. The prompt of a built-in is empty: Claude Code's own is not published. Prompts,
launch decisions (model, effort, tools) and the memory of an agent stay in the sections above.

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

## Environment and general settings readers

resolveEnv resolves settings environment values with scope, trust and launch-environment rules; envChange and envAfterCd model later application without unsetting removed variables. General readers cover agent view, theme, teammate mode, worktree settings, processWrapper argv parsing, command-line hook gates and plugin defaults. The host supplies the startup-safe variable classification and performs process execution.

## Agent runtime policy

Split subagent context by responsibility: persistent memory, preloaded skills and scoped MCP servers; add folder trust diagnostics and model allowlist substitution. The host still owns provider resolution, connections and prompt assembly.

## Hook classifier annotations and auto-mode rewrites

Hook output exposes classifierContext with its shared 2,000-character cap and classifierTrust; notes for unrecorded read-only lookups are discarded. reviewHookRewrite decides whether a changed call applies, is denied, or drops a further rewrite on a repeat. afterHandbackDenial counts the three retry notices; the host delivers them.

### Live content across turns and updates

Folder skills and agents share their scan state across turn views that keep the current directory. A view with an explicit different `cwd` has its own folder context and never moves the original session. `moveTo` changes the context's live cwd for later hooks and shell placeholders. `host.update` changes plugin catalogs, folder-source policy and settings environment on the next use; it preserves environment files and already-consumed hooks. Re-enabling a folder source that a scan omitted requires reloading it.

### Root export names shared by modules

At the package root, the CLI planners are `planCliInstall`, `planCliEnable`, `planCliDisable` and `planCliMarketplaceUpdate`; their names inside `cli` remain `planInstall`, `planEnable`, `planDisable` and `planMarketplaceUpdate`. Installed-state graph plans use `planInstalledPrune` and `planInstalledUninstall`, distinct from the catalog-aware dependency plans. `readTheme` and `readAgent` are file readers; `readThemeSetting` names the general-settings theme reader. Conflicting public types are qualified by responsibility (`Cli*`, `Update*`, `PolicyHelperRun`, `PolicyHelperOutput`, `WorkflowFailureCause`, `InstalledGraph*`).

## Mods orchestration and settings reads

Engine settings reads retain any valid hook refusal for that dispatch, even when an outer hook replaces the result. `DispatchOptions.observeResult` observes valid hook results before outer hooks replace them. The engine toast's internal UI owner cannot collide with a plugin name.

`runModToolCall` owns managed hooks → mod tool.call → other PreToolUse hooks → mod tool.check → classifier/PermissionRequest/prompt → execution. Pass these effects as callbacks; `decide` must not prompt. It returns the withheld-result model text as well as the raw result, adds the read-only report, and enforces auto-mode input review and session-review repeats. `runModPromptSubmit` returns the dropped-prompt notice and text to restore. `createModSettingsReader` supplies real kit policy layers (and plugin defaults) to engine/mod settings reads.

Only an unresolved `ask` reaches `afterCheck`; a decisive `allow` or `deny` never prompts. When a
`turn.step` hook can rewrite tool frames, pass the model's original call as `review.written`, before
that rewrite. A failed tool result (`isError: true`) never receives the successful-withheld-result
prefix.

### Managed hook filtering

The built-in guard installs admission checks in the hook chain, before a user callback or matcher
runs. It skips the protected classic, prompt, settings, skill, attribution and compaction events,
and the three protected `session.append` doors. Organization tiers and built-in modules are not
filtered, including a built-in module deliberately registered in the user tier.

An embedding host supplies `isManagedTool(input)` for managed MCP descriptors and
`isProtectedRow(input)` for additional protected rows such as stored skill text. These callbacks
classify the **original** host event, not a value another hook has rewritten; they must use trusted
artifact identity. A failed lookup skips the untrusted hook. `host.guardedHookNotes(name)` returns
the documented per-plugin explanation for fully skipped registrations, for a host's plugin profile
and diagnostics UI. An unfiltered `session.append` is not reported as wholly skipped.

### Canonical settings, preload and system-prompt adapters

`createModSettingsReader` defaults to `mergeModSettingsLayers`, using the existing settings
repair/merge core rather than an `Object.assign` approximation. Canonical source precedence,
managed exceptions, the permitted plugin defaults and original invalid-value floors survive mod
settings hooks. A host may still supply its `merged` port for additional application-specific keys.

`preloadAgentSkills(definition, available)` returns the selected full skill/command artifacts and
the bounded preload plan. It neither inherits a parent's preload list nor grants the Skill tool.
The host attaches the bodies to the subagent context; this artifact-selection helper does not run
shell preprocessing. `outputStyleSystem(selection, defaults)` preserves general system sections,
replaces coding sections unless the style keeps them, and appends the style instructions. Short
prompts have no coding section.

`planLspStartup(server, facts)` prepares the process argument vector, environment, transport and
timeouts from an already resolved LSP definition. Missing executables produce a diagnostic and no
launch plan, never an installation command; the host provides executable lookup and the LSP client.
`LoadedPlugin.debug` carries empty-custom-command-directory notices separately from validation
findings, so a host need not put a debug message in its Errors view.

### Release tags and user-config dialogs

`planPluginTag(options, facts)` validates the plugin and its matching marketplace version, refuses a dirty plugin tree or an existing tag unless forced, and returns annotated git-tag/push argument vectors. `facts.directory` is the requested path or the host's current directory; the host supplies validation findings and the matching entry found by walking upward. A dry run has only a preview and no commands. `finishPluginTag(plan, effects)` reports the observed result without undoing a locally created tag if pushing failed.

`configurationDialog(event, config)` returns the option keys and non-sensitive starting inputs a host renders. Interactive session/VS Code installs and session enable ask only for unset options. Explicit configure opens every option. Shell install never opens a dialog; `applyConfig` and `notYetSetLine` cover its values and follow-up instructions. Saving through `planConfigure` or `applyConfig` separates regular settings from secure-store values; the host persists them.
